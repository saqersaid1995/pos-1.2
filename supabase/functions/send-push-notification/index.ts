import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── Web Push Encryption (aes128gcm) ──

function base64urlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64urlEncode(data: Uint8Array): string {
  let binary = "";
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number
): Promise<Uint8Array> {
  // HKDF-Extract: PRK = HMAC-SHA256(salt, IKM) — salt is the key, IKM is the data
  const saltKey = await crypto.subtle.importKey("raw", (salt.length ? salt : new Uint8Array(32)) as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const prk = new Uint8Array(await crypto.subtle.sign("HMAC", saltKey, ikm as BufferSource));

  const prkKey = await crypto.subtle.importKey("raw", prk as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const infoWithCounter = new Uint8Array(info.length + 1);
  infoWithCounter.set(info);
  infoWithCounter[info.length] = 1;
  const okm = new Uint8Array(await crypto.subtle.sign("HMAC", prkKey, infoWithCounter));
  return okm.slice(0, length);
}

function concatBuffers(...buffers: Uint8Array[]): Uint8Array {
  const total = buffers.reduce((sum, b) => sum + b.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const buf of buffers) {
    result.set(buf, offset);
    offset += buf.length;
  }
  return result;
}

function createInfo(type: string, clientPublicKey: Uint8Array, serverPublicKey: Uint8Array): Uint8Array {
  const enc = new TextEncoder();
  const typeBytes = enc.encode(type);
  // "Content-Encoding: <type>\0" + "P-256\0" + len(recipient) + recipient + len(sender) + sender
  const header = enc.encode("Content-Encoding: ");
  const nul = new Uint8Array([0]);
  const p256 = enc.encode("P-256");
  
  const clientLen = new Uint8Array(2);
  new DataView(clientLen.buffer).setUint16(0, clientPublicKey.length);
  
  const serverLen = new Uint8Array(2);
  new DataView(serverLen.buffer).setUint16(0, serverPublicKey.length);
  
  return concatBuffers(
    header, typeBytes, nul,
    p256, nul,
    clientLen, clientPublicKey,
    serverLen, serverPublicKey
  );
}

async function encryptPayload(
  plaintext: string,
  subscriptionP256dh: string,
  subscriptionAuth: string
): Promise<{ ciphertext: Uint8Array; localPublicKey: Uint8Array; salt: Uint8Array }> {
  const enc = new TextEncoder();
  const plaintextBytes = enc.encode(plaintext);
  
  const clientPublicKeyBytes = base64urlDecode(subscriptionP256dh);
  const authSecret = base64urlDecode(subscriptionAuth);
  
  // Generate local ECDH key pair
  const localKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );
  
  // Export local public key (uncompressed)
  const localPublicKeyRaw = new Uint8Array(await crypto.subtle.exportKey("raw", localKeyPair.publicKey));
  
  // Import subscription public key
  const clientKey = await crypto.subtle.importKey(
    "raw",
    clientPublicKeyBytes as BufferSource,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );
  
  // Derive shared secret
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: clientKey },
      localKeyPair.privateKey,
      256
    )
  );
  
  // Generate salt
  const salt = crypto.getRandomValues(new Uint8Array(16));
  
  // IKM = HKDF(auth, sharedSecret, "WebPush: info\0" + client_pub + server_pub, 32)
  const authInfo = concatBuffers(
    enc.encode("WebPush: info\0"),
    clientPublicKeyBytes,
    localPublicKeyRaw
  );
  const ikm = await hkdf(authSecret, sharedSecret, authInfo, 32);
  
  // Content encryption key
  const cekInfo = createInfo("aes128gcm", clientPublicKeyBytes, localPublicKeyRaw);
  const cek = await hkdf(salt, ikm, cekInfo, 16);
  
  // Nonce
  const nonceInfo = createInfo("nonce", clientPublicKeyBytes, localPublicKeyRaw);
  const nonce = await hkdf(salt, ikm, nonceInfo, 12);
  
  // Pad plaintext: add delimiter \x02 then padding
  const paddedPlaintext = concatBuffers(plaintextBytes, new Uint8Array([2]));
  
  // Encrypt with AES-128-GCM
  const aesKey = await crypto.subtle.importKey("raw", cek as BufferSource, { name: "AES-GCM" }, false, ["encrypt"]);
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce as BufferSource },
      aesKey,
      paddedPlaintext as BufferSource
    )
  );
  
  // Build aes128gcm header: salt(16) + rs(4) + idlen(1) + keyid(65) + ciphertext
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  
  const idlen = new Uint8Array([65]); // length of localPublicKey
  
  const ciphertext = concatBuffers(salt, rs, idlen, localPublicKeyRaw, encrypted);
  
  return { ciphertext, localPublicKey: localPublicKeyRaw, salt };
}

// ── VAPID JWT ──

async function generateVapidAuthHeader(
  endpoint: string,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  subject: string
) {
  const urlObj = new URL(endpoint);
  const audience = `${urlObj.protocol}//${urlObj.host}`;

  const header = { typ: "JWT", alg: "ES256" };
  const now = Math.floor(Date.now() / 1000);
  const payload = { aud: audience, exp: now + 12 * 3600, sub: subject };

  const enc = new TextEncoder();

  function b64Encode(data: Uint8Array): string {
    let binary = "";
    for (const byte of data) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function b64EncodeStr(str: string): string {
    return b64Encode(enc.encode(str));
  }

  const headerB64 = b64EncodeStr(JSON.stringify(header));
  const payloadB64 = b64EncodeStr(JSON.stringify(payload));
  const unsignedToken = `${headerB64}.${payloadB64}`;

  const privKeyBytes = base64urlDecode(vapidPrivateKey);
  const pubKeyBytes = base64urlDecode(vapidPublicKey);

  const jwk = {
    kty: "EC",
    crv: "P-256",
    x: b64Encode(pubKeyBytes.slice(1, 33)),
    y: b64Encode(pubKeyBytes.slice(33, 65)),
    d: b64Encode(privKeyBytes),
  };

  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    enc.encode(unsignedToken)
  );

  const sigBytes = new Uint8Array(signature);
  const jwt = `${unsignedToken}.${b64Encode(sigBytes)}`;

  return `vapid t=${jwt}, k=${vapidPublicKey}`;
}

// ── Send push to a single subscription ──

async function sendPushToSubscription(
  sub: { endpoint: string; p256dh: string; auth: string },
  payloadStr: string,
  vapidPublicKey: string,
  vapidPrivateKey: string
): Promise<"ok" | "stale" | "error"> {
  try {
    const authorization = await generateVapidAuthHeader(
      sub.endpoint,
      vapidPublicKey,
      vapidPrivateKey,
      "mailto:support@lavinderia.com"
    );

    const { ciphertext } = await encryptPayload(payloadStr, sub.p256dh, sub.auth);

    const res = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Type": "application/octet-stream",
        "Content-Encoding": "aes128gcm",
        TTL: "86400",
      },
      body: ciphertext,
    });

    if (res.status === 410 || res.status === 404) {
      console.log(`Subscription expired (${res.status}): ${sub.endpoint.slice(0, 60)}...`);
      return "stale";
    }

    if (!res.ok) {
      const text = await res.text();
      console.error(`Push failed (${res.status}):`, text);
      return "error";
    }

    console.log("Push sent successfully");
    return "ok";
  } catch (e) {
    console.error("Push send error:", e);
    return "error";
  }
}

// ── Main handler ──

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phone, message, customerName, appContext } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY")!;
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const context = appContext || "support-lite";

    const { data: subscriptions, error } = await supabase
      .from("push_subscriptions")
      .select("*")
      .eq("app_context", context);

    if (error) {
      console.error("DB error:", error);
      return new Response(JSON.stringify({ error: "DB error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ sent: 0, message: "No subscriptions" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const displayName = customerName || phone;
    const body = message?.substring(0, 100) || "New message";

    const payload = JSON.stringify({
      title: `${displayName}`,
      body,
      phone,
      url: "/support-lite",
      tag: `support-${phone}`,
    });

    let sent = 0;
    const stale: string[] = [];

    for (const sub of subscriptions) {
      const result = await sendPushToSubscription(
        sub,
        payload,
        vapidPublicKey,
        vapidPrivateKey
      );
      if (result === "ok") {
        sent++;
      } else if (result === "stale") {
        stale.push(sub.id);
      }
      // "error" = transient failure, don't delete the subscription
    }

    // Only clean up confirmed stale/expired subscriptions
    if (stale.length > 0) {
      await supabase.from("push_subscriptions").delete().in("id", stale);
    }

    return new Response(
      JSON.stringify({ sent, total: subscriptions.length, stale: stale.length }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (e) {
    console.error("Error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

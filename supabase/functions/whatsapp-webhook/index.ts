import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const VERIFY_TOKEN = "lavinderia_whatsapp_verify_2024";
const GRAPH_API_VERSION = "v18.0";

// ── Media helpers ──

async function downloadAndStoreMedia(
  mediaId: string,
  accessToken: string,
  supabase: any,
  fileExtension: string
): Promise<string | null> {
  try {
    const metaRes = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${mediaId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!metaRes.ok) return null;
    const metaData = await metaRes.json();
    const downloadUrl = metaData.url;
    if (!downloadUrl) return null;

    const mediaRes = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!mediaRes.ok) return null;
    const blob = await mediaRes.blob();
    const mimeType =
      metaData.mime_type ||
      mediaRes.headers.get("content-type") ||
      "application/octet-stream";

    const fileName = `${mediaId}.${fileExtension}`;
    const filePath = `media/${fileName}`;
    const arrayBuffer = await blob.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);

    const { error: uploadError } = await supabase.storage
      .from("whatsapp-media")
      .upload(filePath, uint8, { contentType: mimeType, upsert: true });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return null;
    }

    const { data: publicUrlData } = supabase.storage
      .from("whatsapp-media")
      .getPublicUrl(filePath);
    return publicUrlData?.publicUrl || null;
  } catch (e) {
    console.error("downloadAndStoreMedia error:", e);
    return null;
  }
}

function getExtensionForType(msgType: string, mimeType?: string): string {
  if (mimeType) {
    if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
    if (mimeType.includes("png")) return "png";
    if (mimeType.includes("webp")) return "webp";
    if (mimeType.includes("ogg")) return "ogg";
    if (mimeType.includes("mp4")) return "mp4";
    if (mimeType.includes("pdf")) return "pdf";
  }
  switch (msgType) {
    case "image": return "jpg";
    case "audio": return "ogg";
    case "video": return "mp4";
    case "document": return "pdf";
    case "sticker": return "webp";
    default: return "bin";
  }
}

// ── Auto-reply sender ──

async function sendWhatsAppText(
  phone: string,
  text: string,
  accessToken: string,
  phoneNumberId: string,
  supabase: any,
  customerId: string | null
) {
  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: phone,
          type: "text",
          text: { body: text },
        }),
      }
    );
    const result = await res.json();
    const waMessageId = result?.messages?.[0]?.id || null;

    // Log outgoing auto-reply in whatsapp_messages
    await supabase.from("whatsapp_messages").insert({
      phone,
      message: text,
      type: "outgoing",
      message_type: "text",
      customer_id: customerId,
      wa_message_id: waMessageId,
      send_status: res.ok ? "sent" : "failed",
      is_read: true,
    });

    return res.ok;
  } catch (e) {
    console.error("sendWhatsAppText error:", e);
    return false;
  }
}

// ── Auto-reply logic ──

async function handleAutoReply(
  phone: string,
  messageText: string,
  messageType: string,
  mediaUrl: string | null,
  customerId: string | null,
  supabase: any,
  accessToken: string,
  phoneNumberId: string
) {
  // 1. Load settings
  const { data: settingsArr } = await supabase
    .from("whatsapp_auto_reply_settings")
    .select("*")
    .limit(1);
  const settings = settingsArr?.[0];
  if (!settings) return;

  // Check if auto-reply is active
  const isTestMode = settings.test_mode === true;
  const isProdMode = settings.production_mode === true;

  if (!isTestMode && !isProdMode) return; // system off

  if (isTestMode) {
    const testNum = (settings.test_number || "").replace(/\D/g, "");
    if (!testNum || phone !== testNum) return; // only reply to test number
  }

  // 2. Get or create conversation state
  const { data: stateRow } = await supabase
    .from("whatsapp_conversation_state")
    .select("*")
    .eq("phone", phone)
    .maybeSingle();

  let currentState = stateRow?.state || "new";
  const menuSent = stateRow?.menu_sent || false;

  const input = messageText.trim().toLowerCase();

  // Reset command
  if (input === "0" || input === "menu" || input === "قائمة") {
    await upsertState(supabase, phone, "main_menu", false);
    currentState = "main_menu";
  }

  // 3. Load menu items
  const { data: menuItems } = await supabase
    .from("whatsapp_menu_items")
    .select("*")
    .eq("is_enabled", true)
    .order("sort_order");

  // 4. Load static replies
  const { data: repliesArr } = await supabase
    .from("whatsapp_static_replies")
    .select("*");
  const replies: Record<string, string> = {};
  for (const r of repliesArr || []) {
    replies[r.reply_key] = r.message_text;
  }

  const fallback =
    settings.fallback_message || "عذراً، لم أفهم طلبك. أرسل 0 للعودة للقائمة.";

  // Helper to send menu
  async function sendMenu() {
    const items = (menuItems || [])
      .map((m: any) => `${m.menu_number}- ${m.label_ar}`)
      .join("\n");
    const greeting = settings.greeting_message || "أهلاً بك في Lavanderia\nالرجاء اختيار الخدمة بإرسال الرقم:";
    const fullMenu = `${greeting}\n\n${items}`;
    await sendWhatsAppText(phone, fullMenu, accessToken, phoneNumberId, supabase, customerId);
    await upsertState(supabase, phone, "main_menu", true);
  }

  // ── State machine ──

  if (currentState === "human_handover") {
    // Don't auto-reply when in human handover mode
    return;
  }

  if (currentState === "complaint_mode") {
    // Capture complaint
    await supabase.from("whatsapp_complaints").insert({
      phone,
      customer_id: customerId,
      message: messageText,
      attachment_url: mediaUrl,
      status: "new",
    });
    await sendWhatsAppText(
      phone,
      "تم استلام شكواك. سيتم مراجعتها والرد عليك قريباً.\nأرسل 0 للعودة للقائمة.",
      accessToken,
      phoneNumberId,
      supabase,
      customerId
    );
    await upsertState(supabase, phone, "main_menu", true);
    return;
  }

  if (currentState === "awaiting_order_number") {
    // Look up order
    const orderNum = messageText.trim();
    const { data: order } = await supabase
      .from("orders")
      .select("order_number, current_status, total_amount, remaining_amount, payment_status")
      .eq("order_number", orderNum)
      .eq("is_deleted", false)
      .maybeSingle();

    if (order) {
      const statusMap: Record<string, string> = {
        received: "تم الاستلام",
        processing: "قيد المعالجة",
        "ready-for-pickup": "جاهز للاستلام",
        delivered: "تم التسليم",
      };
      const statusAr = statusMap[order.current_status] || order.current_status;
      const msg = `طلب رقم: ${order.order_number}\nالحالة: ${statusAr}\nالمبلغ: ${order.total_amount} OMR\nالمتبقي: ${order.remaining_amount} OMR\n\nأرسل 0 للعودة للقائمة.`;
      await sendWhatsAppText(phone, msg, accessToken, phoneNumberId, supabase, customerId);
    } else {
      await sendWhatsAppText(
        phone,
        "لم يتم العثور على الطلب. تأكد من الرقم وحاول مجدداً.\nأرسل 0 للعودة للقائمة.",
        accessToken,
        phoneNumberId,
        supabase,
        customerId
      );
    }
    await upsertState(supabase, phone, "main_menu", true);
    return;
  }

  // ── Main menu state (or new) ──

  // If menu not sent yet, send it
  if (!menuSent || currentState === "new") {
    await sendMenu();
    return;
  }

  // Try to match menu number
  const num = parseInt(input, 10);
  const matched = (menuItems || []).find((m: any) => m.menu_number === num);

  if (!matched) {
    await sendWhatsAppText(phone, fallback, accessToken, phoneNumberId, supabase, customerId);
    return;
  }

  // Execute action
  switch (matched.action_type) {
    case "static_reply": {
      const replyText = replies[matched.reply_key || ""] || "لا توجد معلومات حالياً.";
      await sendWhatsAppText(
        phone,
        replyText + "\n\nأرسل 0 للعودة للقائمة.",
        accessToken,
        phoneNumberId,
        supabase,
        customerId
      );
      break;
    }
    case "order_lookup": {
      const prompt = replies[matched.reply_key || ""] || "يرجى إرسال رقم الطلب.";
      await sendWhatsAppText(phone, prompt, accessToken, phoneNumberId, supabase, customerId);
      await upsertState(supabase, phone, "awaiting_order_number", true);
      return;
    }
    case "complaint_flow": {
      const prompt = replies[matched.reply_key || ""] || "يرجى إرسال شكواك.";
      await sendWhatsAppText(phone, prompt, accessToken, phoneNumberId, supabase, customerId);
      await upsertState(supabase, phone, "complaint_mode", true);
      return;
    }
    case "human_handover": {
      const msg = replies[matched.reply_key || ""] || "تم تحويلك للتحدث مع الموظف.";
      await sendWhatsAppText(phone, msg, accessToken, phoneNumberId, supabase, customerId);
      await upsertState(supabase, phone, "human_handover", true);
      return;
    }
    default: {
      await sendWhatsAppText(phone, fallback, accessToken, phoneNumberId, supabase, customerId);
    }
  }
}

async function upsertState(
  supabase: any,
  phone: string,
  state: string,
  menuSent: boolean
) {
  const { data: existing } = await supabase
    .from("whatsapp_conversation_state")
    .select("id")
    .eq("phone", phone)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("whatsapp_conversation_state")
      .update({ state, menu_sent: menuSent, updated_at: new Date().toISOString() })
      .eq("phone", phone);
  } else {
    await supabase.from("whatsapp_conversation_state").insert({
      phone,
      state,
      menu_sent: menuSent,
    });
  }
}

// ── Parse incoming message ──

function parseIncomingMessage(msg: any) {
  let messageText = "";
  let messageType = "text";
  let mediaId: string | null = null;
  let filename: string | null = null;

  if (msg.type === "text" && msg.text?.body) {
    messageText = msg.text.body;
    messageType = "text";
  } else if (msg.type === "image") {
    messageType = "image";
    mediaId = msg.image?.id || null;
    messageText = msg.image?.caption || "[Image]";
  } else if (msg.type === "audio") {
    messageType = "audio";
    mediaId = msg.audio?.id || null;
    messageText = "[Voice note]";
  } else if (msg.type === "document") {
    messageType = "document";
    mediaId = msg.document?.id || null;
    filename = msg.document?.filename || null;
    messageText = filename ? `[Document] ${filename}` : "[Document]";
  } else if (msg.type === "video") {
    messageType = "video";
    mediaId = msg.video?.id || null;
    messageText = "[Video]";
  } else if (msg.type === "sticker") {
    messageType = "sticker";
    mediaId = msg.sticker?.id || null;
    messageText = "[Sticker]";
  } else if (msg.type === "location") {
    messageType = "location";
    messageText = "[Location]";
  } else if (msg.type === "reaction") {
    messageType = "reaction";
    messageText = `[Reaction: ${msg.reaction?.emoji || ""}]`;
  } else {
    messageType = msg.type || "unknown";
    messageText = `[${msg.type || "unknown"}]`;
  }

  return { messageText, messageType, mediaId, filename };
}

async function resolveCustomerId(
  phone: string,
  supabase: any
): Promise<string | null> {
  const phoneDigits = phone.replace(/\D/g, "");

  const { data: customer } = await supabase
    .from("customers")
    .select("id, phone_number")
    .or(
      `phone_number.eq.${phoneDigits},phone_number.eq.${phoneDigits.slice(-8)}`
    )
    .limit(1)
    .maybeSingle();

  if (customer) return customer.id;

  const last8 = phoneDigits.slice(-8);
  const { data: customer2 } = await supabase
    .from("customers")
    .select("id")
    .ilike("phone_number", `%${last8}`)
    .limit(1)
    .maybeSingle();

  return customer2?.id || null;
}

// ── Main handler ──

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);

  // GET: Webhook verification
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("Webhook verified");
      return new Response(challenge, { status: 200, headers: corsHeaders });
    }
    return new Response("Forbidden", { status: 403, headers: corsHeaders });
  }

  // POST: Incoming messages
  if (req.method === "POST") {
    try {
      const body = await req.json();

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN") || "";
      const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || "";
      const supabase = createClient(supabaseUrl, supabaseKey);

      const entries = body.entry || [];
      for (const entry of entries) {
        const changes = entry.changes || [];
        for (const change of changes) {
          const value = change.value;
          if (!value || value.messaging_product !== "whatsapp") continue;

          // ── Handle delivery/read/failed status callbacks ──
          const statuses = value.statuses || [];
          for (const st of statuses) {
            try {
              const waId = st.id;
              if (!waId) continue;
              const ts = st.timestamp
                ? new Date(parseInt(st.timestamp) * 1000).toISOString()
                : new Date().toISOString();
              const status = String(st.status || "").toLowerCase();
              const errCode = st.errors?.[0]?.code ? String(st.errors[0].code) : null;
              const errMsg = st.errors?.[0]?.title || st.errors?.[0]?.message || null;

              const patch: Record<string, any> = { send_status: status };
              if (status === "delivered") patch.delivered_at = ts;
              else if (status === "read") {
                patch.read_at = ts;
                if (!patch.delivered_at) patch.delivered_at = ts;
              } else if (status === "failed") {
                patch.failed_at = ts;
                if (errCode) patch.error_code = errCode;
                if (errMsg) patch.error_message = errMsg;
              }
              await supabase
                .from("notification_logs")
                .update(patch)
                .eq("provider_message_id", waId);
            } catch (e) {
              console.error("Status update error:", e);
            }
          }

          const messages = value.messages || [];

          for (const msg of messages) {
            const phone = (msg.from || "").replace(/\D/g, "");
            const waMessageId = msg.id || null;
            const timestamp = msg.timestamp
              ? new Date(parseInt(msg.timestamp) * 1000).toISOString()
              : new Date().toISOString();

            const { messageText, messageType, mediaId, filename } =
              parseIncomingMessage(msg);

            // Download media if present
            let mediaUrl: string | null = null;
            if (mediaId && accessToken) {
              const mimeSource =
                msg[msg.type as string]?.mime_type || undefined;
              const ext = getExtensionForType(msg.type, mimeSource);
              mediaUrl = await downloadAndStoreMedia(
                mediaId,
                accessToken,
                supabase,
                ext
              );
            }

            const customerId = await resolveCustomerId(phone, supabase);

            // Deduplicate: skip if wa_message_id already exists
            if (waMessageId) {
              const { data: existing } = await supabase
                .from("whatsapp_messages")
                .select("id")
                .eq("wa_message_id", waMessageId)
                .maybeSingle();
              if (existing) {
                console.log(`Duplicate skipped: ${waMessageId}`);
                continue;
              }
            }

            // Store incoming message
            const { error: insertError } = await supabase
              .from("whatsapp_messages")
              .insert({
                phone,
                message: messageText,
                type: "incoming",
                message_type: messageType,
                media_id: mediaId,
                media_url: mediaUrl,
                filename,
                customer_id: customerId,
                wa_message_id: waMessageId,
                message_timestamp: timestamp,
                send_status: "sent",
                is_read: false,
              });

            if (insertError) {
              console.error("Insert error:", insertError);
            } else {
              console.log(
                `Saved ${messageType} from ${phone}, media: ${mediaUrl ? "stored" : "none"}`
              );

              // ── Fire-and-forget: push notification + auto-reply ──
              // Don't await these so webhook returns 200 to Meta quickly
              const bgTasks: Promise<void>[] = [];

              // Push notification (fire-and-forget)
              bgTasks.push((async () => {
                try {
                  const customerName = customerId
                    ? await (async () => {
                        const { data: c } = await supabase.from("customers").select("full_name").eq("id", customerId).maybeSingle();
                        return c?.full_name || null;
                      })()
                    : null;

                  const pushUrl = `${supabaseUrl}/functions/v1/send-push-notification`;
                  await fetch(pushUrl, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${supabaseKey}`,
                    },
                    body: JSON.stringify({
                      phone,
                      message: messageText,
                      customerName,
                      appContext: "support-lite",
                    }),
                  });
                } catch (pushErr) {
                  console.error("Push notification error:", pushErr);
                }
              })());

              // Auto-reply (fire-and-forget)
              if (accessToken && phoneNumberId) {
                bgTasks.push((async () => {
                  try {
                    await handleAutoReply(
                      phone,
                      messageText,
                      messageType,
                      mediaUrl,
                      customerId,
                      supabase,
                      accessToken,
                      phoneNumberId
                    );
                  } catch (e) {
                    console.error("Auto-reply error:", e);
                  }
                })());
              }

              // Let background tasks run without blocking the webhook response
              // EdgeRuntime will keep the isolate alive for these promises
              Promise.allSettled(bgTasks).catch(() => {});
            }
          }
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("Webhook error:", err);
      return new Response(JSON.stringify({ error: String(err) }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  return new Response("Method not allowed", {
    status: 405,
    headers: corsHeaders,
  });
});

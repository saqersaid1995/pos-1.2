import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GRAPH_API_VERSION = "v18.0";
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const WHATSAPP_ACCESS_TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
    const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");

    if (!WHATSAPP_ACCESS_TOKEN) throw new Error("WHATSAPP_ACCESS_TOKEN not configured");
    if (!WHATSAPP_PHONE_NUMBER_ID) throw new Error("WHATSAPP_PHONE_NUMBER_ID not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse multipart form data
    const formData = await req.formData();
    const phone = formData.get("phone") as string;
    const caption = (formData.get("caption") as string) || "";
    const customerId = (formData.get("customer_id") as string) || null;
    const imageFile = formData.get("image") as File;

    if (!phone) {
      return new Response(
        JSON.stringify({ error: "Missing phone" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!imageFile || !(imageFile instanceof File)) {
      return new Response(
        JSON.stringify({ error: "Missing image file" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(imageFile.type)) {
      return new Response(
        JSON.stringify({ error: "Invalid image type. Allowed: JPEG, PNG, WebP" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate file size
    if (imageFile.size > MAX_FILE_SIZE) {
      return new Response(
        JSON.stringify({ error: "Image too large. Maximum 5MB" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normalize phone
    let normalizedPhone = phone.replace(/\D/g, "");
    if (normalizedPhone.length === 8) normalizedPhone = "968" + normalizedPhone;

    // Step 1: Upload image to WhatsApp Media API
    const imageBytes = await imageFile.arrayBuffer();
    const uploadForm = new FormData();
    uploadForm.append("messaging_product", "whatsapp");
    uploadForm.append("file", new Blob([imageBytes], { type: imageFile.type }), imageFile.name || "image.jpg");
    uploadForm.append("type", imageFile.type);

    const uploadUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/media`;
    const uploadRes = await fetch(uploadUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}` },
      body: uploadForm,
    });

    const uploadData = await uploadRes.json();
    if (!uploadRes.ok || !uploadData.id) {
      const errMsg = uploadData?.error?.message || `Upload failed: HTTP ${uploadRes.status}`;
      console.error("WhatsApp media upload failed:", errMsg);
      return new Response(
        JSON.stringify({ success: false, error: errMsg }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const mediaId = uploadData.id;
    console.log(`Media uploaded, id: ${mediaId}`);

    // Step 2: Send image message via WhatsApp
    const msgUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
    const imagePayload: Record<string, unknown> = { id: mediaId };
    if (caption.trim()) imagePayload.caption = caption.trim();

    const sendRes = await fetch(msgUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: normalizedPhone,
        type: "image",
        image: imagePayload,
      }),
    });

    const sendData = await sendRes.json();
    const waMessageId = sendData?.messages?.[0]?.id || null;
    const success = sendRes.ok;

    // Step 3: Upload image to Supabase storage for permanent access
    const ext = imageFile.type === "image/png" ? "png" : imageFile.type === "image/webp" ? "webp" : "jpg";
    const storagePath = `outgoing/${normalizedPhone}/${Date.now()}.${ext}`;
    
    const { data: storageData } = await supabase.storage
      .from("whatsapp-media")
      .upload(storagePath, imageBytes, { contentType: imageFile.type, upsert: false });

    let publicUrl: string | null = null;
    if (storageData?.path) {
      const { data: urlData } = supabase.storage.from("whatsapp-media").getPublicUrl(storageData.path);
      publicUrl = urlData?.publicUrl || null;
    }

    // Step 4: Save to whatsapp_messages
    const messageText = caption.trim() || "[Image]";
    await supabase.from("whatsapp_messages").insert({
      phone: normalizedPhone,
      message: messageText,
      type: "outgoing",
      message_type: "image",
      media_id: mediaId,
      media_url: publicUrl,
      customer_id: customerId,
      wa_message_id: waMessageId,
      message_timestamp: new Date().toISOString(),
      send_status: success ? "sent" : "failed",
    });

    if (!success) {
      const errorMsg = sendData?.error?.message || `HTTP ${sendRes.status}`;
      console.error("WhatsApp image send failed:", errorMsg);
      return new Response(
        JSON.stringify({ success: false, error: errorMsg }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Sent image to ${normalizedPhone}, wa_id: ${waMessageId}`);
    return new Response(
      JSON.stringify({ success: true, message_id: waMessageId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("send-whatsapp-image error:", error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

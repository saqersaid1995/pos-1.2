import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, rgb, grayscale } from "https://esm.sh/pdf-lib@1.17.1";
import fontkit from "https://esm.sh/@pdf-lib/fontkit@1.1.1";
import { encode as encodeQR } from "https://esm.sh/uqr@0.1.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GRAPH_API_VERSION = "v18.0";

// Reliable URLs for assets
const LOGO_URL = "https://odrvdzxondyoxzpzfqdk.supabase.co/storage/v1/object/public/item-images/branding%2Flavanderia-logo.jpeg";
// Self-hosted Amiri font files for stable Arabic + Latin rendering
const ARABIC_FONT_URL = "https://odrvdzxondyoxzpzfqdk.supabase.co/storage/v1/object/public/item-images/fonts%2FAmiri-Regular.ttf";
const ARABIC_FONT_BOLD_URL = "https://odrvdzxondyoxzpzfqdk.supabase.co/storage/v1/object/public/item-images/fonts%2FAmiri-Bold.ttf";

function normalizePhone(phone: string, defaultCountryCode = "968"): string | null {
  const digits = phone.replace(/\D/g, "");
  if (!digits || digits.length < 7) return null;
  if (digits.startsWith("968") && digits.length === 11) return digits;
  if (digits.length === 8) return defaultCountryCode + digits;
  if (digits.length >= 10) return digits;
  return defaultCountryCode + digits;
}

function fmtOMR(amount: number): string {
  return `OMR ${Math.abs(amount).toFixed(3)}`;
}

// Check if text contains Arabic characters
function hasArabic(text: string): boolean {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
}

// Draw QR code using pdf-lib shapes from uqr matrix
function drawQrCode(
  page: any,
  matrix: boolean[][],
  x: number,
  y: number,
  size: number
) {
  const modules = matrix.length;
  const cellSize = size / modules;
  const black = rgb(0, 0, 0);

  for (let row = 0; row < modules; row++) {
    for (let col = 0; col < modules; col++) {
      if (matrix[row][col]) {
        page.drawRectangle({
          x: x + col * cellSize,
          y: y + (modules - 1 - row) * cellSize,
          width: cellSize,
          height: cellSize,
          color: black,
        });
      }
    }
  }
}

// ─── Branded PDF generation ───

async function generateBrandedPdf(
  order: any,
  items: any[],
  options: { includeLogo?: boolean } = {},
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const { includeLogo = true } = options;

  // Receipt-style page: 80mm x 210mm → points
  const W = 226.8;
  const H = 595.3;
  const page = pdf.addPage([W, H]);

  // ─── Load fonts ───
  let fontRegular: any;
  let fontBold: any;

  try {
    const [regularResp, boldResp] = await Promise.all([
      fetch(ARABIC_FONT_URL),
      fetch(ARABIC_FONT_BOLD_URL),
    ]);
    console.log(`Font fetch status: regular=${regularResp.status}, bold=${boldResp.status}`);
    if (!regularResp.ok || !boldResp.ok) {
      throw new Error(`Font fetch failed: regular=${regularResp.status}, bold=${boldResp.status}`);
    }
    const [regularBytes, boldBytes] = await Promise.all([
      regularResp.arrayBuffer(),
      boldResp.arrayBuffer(),
    ]);
    console.log(`Font sizes: regular=${regularBytes.byteLength}, bold=${boldBytes.byteLength}`);
    fontRegular = await pdf.embedFont(regularBytes);
    fontBold = await pdf.embedFont(boldBytes);
    console.log("Arabic fonts embedded successfully");
  } catch (e) {
    console.error("Failed to load Arabic fonts:", e);
    throw new Error("Arabic font loading failed");
  }

  const gray = rgb(0.4, 0.4, 0.4);
  const black = rgb(0, 0, 0);
  const red = rgb(0.757, 0.071, 0.122);
  const lineGray = grayscale(0.85);

  const LM = 14;
  const RM = W - 14;
  const CW = RM - LM;
  let y = H - 20;

  const divider = () => {
    page.drawLine({ start: { x: LM, y }, end: { x: RM, y }, thickness: 0.5, color: lineGray });
    y -= 8;
  };

  const drawRight = (text: string, yPos: number, font = fontRegular, size = 8, color = black) => {
    const tw = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: RM - tw, y: yPos, size, font, color });
  };

  // Truncate text to fit within a max width
  const truncate = (text: string, font: any, size: number, maxW: number): string => {
    if (font.widthOfTextAtSize(text, size) <= maxW) return text;
    let t = text;
    while (t.length > 1 && font.widthOfTextAtSize(t + "…", size) > maxW) {
      t = t.slice(0, -1);
    }
    return t + "…";
  };

  // ─── Logo + Header ───
  let logoImage: any = null;
  if (includeLogo) {
    try {
      const logoResp = await fetch(LOGO_URL);
      if (logoResp.ok) {
        const logoBytes = new Uint8Array(await logoResp.arrayBuffer());
        const ct = logoResp.headers.get("content-type") || "";
        logoImage = ct.includes("png")
          ? await pdf.embedPng(logoBytes)
          : await pdf.embedJpg(logoBytes);
      }
    } catch (e) {
      console.error("Logo embed failed:", e);
    }
  }

  const brandName = "LAVANDERIA";
  const tagline = "Professional Laundry Services";

  if (logoImage) {
    const logoSize = 22;
    const titleW = fontBold.widthOfTextAtSize(brandName, 11);
    const logoX = (W - logoSize - titleW - 6) / 2;
    page.drawImage(logoImage, { x: logoX, y: y - logoSize + 4, width: logoSize, height: logoSize });
    page.drawText(brandName, { x: logoX + logoSize + 6, y: y - 8, size: 11, font: fontBold, color: black });
    page.drawText(tagline, { x: logoX + logoSize + 6, y: y - 18, size: 7, font: fontRegular, color: gray });
  } else {
    const titleW = fontBold.widthOfTextAtSize(brandName, 11);
    page.drawText(brandName, { x: (W - titleW) / 2, y: y - 8, size: 11, font: fontBold, color: black });
    const tagW = fontRegular.widthOfTextAtSize(tagline, 7);
    page.drawText(tagline, { x: (W - tagW) / 2, y: y - 18, size: 7, font: fontRegular, color: gray });
  }

  y -= 28;
  divider();

  // ─── Phone row (large) ───
  const phone = order.customer_phone || "—";
  const phoneLabelW = fontRegular.widthOfTextAtSize("Phone: ", 7);
  const phoneW = fontBold.widthOfTextAtSize(phone, 16);
  const phoneBlockW = phoneLabelW + phoneW;
  const phoneX = (W - phoneBlockW) / 2;
  page.drawText("Phone: ", { x: phoneX, y: y - 4, size: 7, font: fontRegular, color: gray });
  page.drawText(phone, { x: phoneX + phoneLabelW, y: y - 8, size: 16, font: fontBold, color: black });
  y -= 22;
  divider();

  // ─── Info grid ───
  const drawInfoRow = (label: string, value: string, x: number, yPos: number) => {
    page.drawText(label, { x, y: yPos, size: 7, font: fontRegular, color: gray });
    const lw = fontRegular.widthOfTextAtSize(label, 7);
    page.drawText(value, { x: x + lw, y: yPos, size: 8, font: fontBold, color: black });
  };

  const col2X = LM + CW / 2 + 4;
  drawInfoRow("Order: ", order.order_number || "—", LM, y);
  drawInfoRow("Date: ", order.order_date || "—", col2X, y);
  y -= 12;
  drawInfoRow("Customer: ", order.customer_name || "Walk-in", LM, y);
  if (order.delivery_date) {
    drawInfoRow("Delivery: ", order.delivery_date, col2X, y);
  }
  y -= 14;
  divider();

  // ─── Table header ───
  const thSize = 7;
  const tdSize = 8;
  const colItem = LM;
  const colService = LM + CW * 0.3;
  const colQty = LM + CW * 0.6;
  const colTotal = RM;

  page.drawText("ITEM", { x: colItem, y, size: thSize, font: fontRegular, color: gray });
  page.drawText("SERVICE", { x: colService, y, size: thSize, font: fontRegular, color: gray });
  const qtyHdrW = fontRegular.widthOfTextAtSize("QTY", thSize);
  page.drawText("QTY", { x: colQty - qtyHdrW / 2, y, size: thSize, font: fontRegular, color: gray });
  const totalHdrW = fontRegular.widthOfTextAtSize("TOTAL", thSize);
  page.drawText("TOTAL", { x: colTotal - totalHdrW, y, size: thSize, font: fontRegular, color: gray });
  y -= 4;
  page.drawLine({ start: { x: LM, y }, end: { x: RM, y }, thickness: 0.5, color: lineGray });
  y -= 10;

  // ─── Table rows ───
  const itemColMaxW = CW * 0.28;
  const serviceColMaxW = CW * 0.28;

  for (const item of items) {
    if (y < 80) break; // leave space for totals + QR
    const itemName = truncate(item.item_type || "—", fontRegular, tdSize, itemColMaxW);
    const serviceName = truncate(item.service_type || "—", fontRegular, tdSize, serviceColMaxW);
    const qty = String(item.quantity || 1);
    const lineTotal = fmtOMR((Number(item.unit_price) || 0) * (item.quantity || 1));

    page.drawText(itemName, { x: colItem, y, size: tdSize, font: fontRegular, color: black });
    page.drawText(serviceName, { x: colService, y, size: tdSize, font: fontRegular, color: black });
    const qtyW = fontRegular.widthOfTextAtSize(qty, tdSize);
    page.drawText(qty, { x: colQty - qtyW / 2, y, size: tdSize, font: fontRegular, color: black });
    drawRight(lineTotal, y, fontRegular, tdSize);
    y -= 12;
    page.drawLine({ start: { x: LM, y: y + 4 }, end: { x: RM, y: y + 4 }, thickness: 0.3, color: grayscale(0.93) });
  }

  y -= 4;
  divider();

  // ─── Totals ───
  const totalAmt = Number(order.total_amount || 0);
  const paidAmt = Number(order.paid_amount || 0);
  const remainingAmt = Number(order.remaining_amount || 0);

  page.drawText("Total", { x: LM, y, size: 10, font: fontBold, color: black });
  drawRight(fmtOMR(totalAmt), y, fontBold, 10);
  y -= 13;

  page.drawText("Paid", { x: LM, y, size: 8, font: fontRegular, color: gray });
  drawRight(fmtOMR(paidAmt), y, fontRegular, 8);
  y -= 12;

  if (remainingAmt > 0) {
    page.drawText("Remaining", { x: LM, y, size: 8, font: fontBold, color: red });
    drawRight(fmtOMR(remainingAmt), y, fontBold, 8, red);
    y -= 12;
  }

  y -= 6;

  // ─── QR Code ───
  const qrValue = order.qr_value || order.order_number || "N/A";
  try {
    const qrResult = encodeQR(qrValue);
    const qrSize = 50;
    const qrX = (W - qrSize) / 2;
    drawQrCode(page, qrResult.data, qrX, Math.max(y - qrSize, 20), qrSize);
    y = Math.max(y - qrSize - 6, 20);
  } catch (e) {
    console.error("QR generation failed:", e);
  }

  // ─── Footer ───
  const footerText = "Thank you for your business!";
  const footerW = fontRegular.widthOfTextAtSize(footerText, 7);
  page.drawText(footerText, { x: (W - footerW) / 2, y: Math.max(y, 14), size: 7, font: fontRegular, color: gray });

  return pdf.save();
}

// ─── Main Handler ───

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const WHATSAPP_ACCESS_TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
    const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");

    if (!WHATSAPP_ACCESS_TOKEN) throw new Error("WHATSAPP_ACCESS_TOKEN is not configured");
    if (!WHATSAPP_PHONE_NUMBER_ID) throw new Error("WHATSAPP_PHONE_NUMBER_ID is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Load cost rates from settings
    const { data: settingsRow } = await supabase
      .from("whatsapp_settings")
      .select("cost_rates")
      .limit(1)
      .maybeSingle();
    const costRates: any = settingsRow?.cost_rates || {};

    const body = await req.json();
    const {
      order_id,
      customer_id,
      customer_name,
      customer_phone,
      order_number,
      total_amount,
      remaining_amount,
      message_type = "ready_for_pickup",
      template_name = "order_ready_pdf_ar",
      template_language = "ar",
      template_category = "utility",
      event_type = null,
      is_test = false,
    } = body;

    const estimatedCost = Number(
      costRates[template_category] ?? costRates.default ?? 0
    );
    const currency = String(costRates.currency || "OMR");

    if (!customer_phone) {
      return new Response(
        JSON.stringify({ error: "Missing required field: customer_phone" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const normalizedPhone = normalizePhone(customer_phone);
    if (!normalizedPhone) {
      await supabase.from("notification_logs").insert({
        order_id: order_id || null,
        customer_id: customer_id || null,
        channel: "whatsapp",
        recipient_phone: customer_phone,
        message_type,
        direction: "outgoing",
        template_name,
        template_language,
        template_category,
        event_type,
        send_status: "skipped",
        error_message: "Invalid phone number format",
        currency,
      } as any);

      return new Response(
        JSON.stringify({ success: false, status: "skipped", error: "Invalid phone number" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── Fetch order details and generate branded PDF ───
    let pdfBytes: Uint8Array | null = null;
    let pdfFilename = `invoice_${order_number || "unknown"}.pdf`;
    let orderItemsForPdf: any[] = [];

    if (order_id) {
      const { data: orderData } = await supabase
        .from("orders")
        .select("*, order_items(*), customers(full_name, phone_number)")
        .eq("id", order_id)
        .maybeSingle();

      if (orderData) {
        orderItemsForPdf = orderData.order_items || [];
        const orderForPdf = {
          ...orderData,
          customer_name: orderData.customers?.full_name || customer_name || "Walk-in",
          customer_phone: orderData.customers?.phone_number || customer_phone,
        };

        pdfBytes = await generateBrandedPdf(orderForPdf, orderItemsForPdf, { includeLogo: true });
        pdfFilename = `invoice_${orderData.order_number}.pdf`;
      }
    }

    // Fallback minimal PDF
    if (!pdfBytes) {
      const fallbackOrder = {
        order_number: order_number || "N/A",
        order_date: new Date().toISOString().slice(0, 10),
        customer_name: customer_name || "Walk-in",
        customer_phone: customer_phone || "—",
        delivery_date: null,
        total_amount: total_amount || 0,
        paid_amount: (total_amount || 0) - (remaining_amount || 0),
        remaining_amount: remaining_amount || 0,
      };
      pdfBytes = await generateBrandedPdf(fallbackOrder, [], { includeLogo: true });
    }

    // ─── Build template message ───
    const total = Number(total_amount || 0).toFixed(3);
    const orderNum = order_number || "N/A";

    const components: any[] = [];

    components.push({
      type: "header",
      parameters: [{
        type: "document",
        document: { filename: pdfFilename },
      }],
    });

    components.push({
      type: "body",
      parameters: [
        { type: "text", text: orderNum },
        { type: "text", text: `OMR ${total}` },
      ],
    });

    const requestBody: any = {
      messaging_product: "whatsapp",
      to: normalizedPhone,
      type: "template",
      template: {
        name: template_name,
        language: { code: template_language },
        components,
      },
    };

    // Upload PDF as media to WhatsApp
    let mediaId: string | null = null;
    const formData = new FormData();
    formData.append("file", new Blob([pdfBytes as BlobPart], { type: "application/pdf" }), pdfFilename);
    formData.append("messaging_product", "whatsapp");
    formData.append("type", "application/pdf");

    const mediaUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/media`;
    const mediaResponse = await fetch(mediaUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}` },
      body: formData,
    });

    const mediaData = await mediaResponse.json();
    console.log("Media upload response:", JSON.stringify(mediaData, null, 2));

    if (mediaResponse.ok && mediaData.id) {
      mediaId = mediaData.id;
      const headerComp = requestBody.template.components.find((c: any) => c.type === "header");
      if (headerComp) {
        headerComp.parameters[0].document.id = mediaId;
      }
    } else {
      console.error("Media upload failed:", mediaData);

      const shouldRetryWithoutLogo = JSON.stringify(mediaData).toLowerCase().includes("file") || JSON.stringify(mediaData).toLowerCase().includes("size");
      if (shouldRetryWithoutLogo && order_id) {
        const { data: orderData } = await supabase
          .from("orders")
          .select("*, order_items(*), customers(full_name, phone_number)")
          .eq("id", order_id)
          .maybeSingle();

        if (orderData) {
          const retryOrder = {
            ...orderData,
            customer_name: orderData.customers?.full_name || customer_name || "Walk-in",
            customer_phone: orderData.customers?.phone_number || customer_phone,
          };
          pdfBytes = await generateBrandedPdf(retryOrder, orderData.order_items || [], { includeLogo: false });

          const retryFormData = new FormData();
          retryFormData.append("file", new Blob([pdfBytes as BlobPart], { type: "application/pdf" }), pdfFilename);
          retryFormData.append("messaging_product", "whatsapp");
          retryFormData.append("type", "application/pdf");

          const retryMediaResponse = await fetch(mediaUrl, {
            method: "POST",
            headers: { Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}` },
            body: retryFormData,
          });
          const retryMediaData = await retryMediaResponse.json();
          console.log("Retry media upload response:", JSON.stringify(retryMediaData, null, 2));

          if (retryMediaResponse.ok && retryMediaData.id) {
            mediaId = retryMediaData.id;
            const headerComp = requestBody.template.components.find((c: any) => c.type === "header");
            if (headerComp) {
              headerComp.parameters[0].document.id = mediaId;
            }
          } else {
            requestBody.template.components = requestBody.template.components.filter(
              (c: any) => c.type !== "header"
            );
          }
        } else {
          requestBody.template.components = requestBody.template.components.filter(
            (c: any) => c.type !== "header"
          );
        }
      } else {
        requestBody.template.components = requestBody.template.components.filter(
          (c: any) => c.type !== "header"
        );
      }
    }

    const messageDescription = `Template: ${template_name} | To: ${normalizedPhone} | Order: ${orderNum} | Total: OMR ${total} | PDF: ${mediaId ? "attached" : "none"}`;
    console.log("Sending WhatsApp:", messageDescription);

    const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;

    const waResponse = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const waData = await waResponse.json();
    console.log("WhatsApp API response:", JSON.stringify(waData, null, 2));

    if (!waResponse.ok) {
      const errorMsg = waData?.error?.message || `HTTP ${waResponse.status}`;
      const errorCode = waData?.error?.code;

      await supabase.from("notification_logs").insert({
        order_id: order_id || null,
        customer_id: customer_id || null,
        channel: "whatsapp",
        recipient_phone: normalizedPhone,
        message_type: is_test ? "test" : message_type,
        message_body: messageDescription,
        direction: "outgoing",
        template_name,
        template_language,
        template_category,
        event_type,
        send_status: "failed",
        provider_response: JSON.stringify(waData),
        error_message: errorMsg,
        error_code: errorCode ? String(errorCode) : null,
        failed_at: new Date().toISOString(),
        estimated_cost: 0,
        currency,
      } as any);

      if (order_id) {
        await supabase.from("orders").update({ ready_pickup_whatsapp_sent: true }).eq("id", order_id);
      }

      const isTokenError = errorCode === 190 || errorMsg?.toLowerCase().includes("token");

      return new Response(
        JSON.stringify({ success: false, status: "failed", error: errorMsg, is_token_error: isTokenError, provider_response: waData }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const messageId = waData?.messages?.[0]?.id || null;

    await supabase.from("notification_logs").insert({
      order_id: order_id || null,
      customer_id: customer_id || null,
      channel: "whatsapp",
      recipient_phone: normalizedPhone,
      message_type: is_test ? "test" : message_type,
      message_body: messageDescription,
      direction: "outgoing",
      template_name,
      template_language,
      template_category,
      event_type,
      send_status: "sent",
      provider_message_id: messageId,
      provider_response: JSON.stringify(waData),
      estimated_cost: estimatedCost,
      currency,
    } as any);

    // Also save to whatsapp_messages for inbox display
    await supabase.from("whatsapp_messages").insert({
      phone: normalizedPhone,
      message: `[Template: ${template_name}] Order ${orderNum} - Total: OMR ${total}`,
      type: "outgoing",
      customer_id: customer_id || null,
      order_id: order_id || null,
      wa_message_id: messageId,
      message_timestamp: new Date().toISOString(),
    });

    if (order_id) {
      await supabase.from("orders").update({ ready_pickup_whatsapp_sent: true }).eq("id", order_id);
    }

    return new Response(
      JSON.stringify({ success: true, status: "sent", message_id: messageId, has_pdf: !!mediaId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("send-whatsapp error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

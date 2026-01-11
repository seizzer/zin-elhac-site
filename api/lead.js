// api/lead.js  (ESM) — WhatsApp template + Resend email notification
// Works on Vercel Serverless Functions.
//
// ENV required:
// - WHATSAPP_TOKEN
// - WHATSAPP_PHONE_NUMBER_ID
// - WHATSAPP_TEMPLATE_NAME
// - WHATSAPP_TEMPLATE_LANG
// Optional:
// - WHATSAPP_TEST_TO  (fallback if "to" missing)
// Email (Resend):
// - RESEND_API_KEY
// - OWNER_EMAIL
// - RESEND_FROM   (e.g. 'Zin Diary <onboarding@resend.dev>' or your verified domain sender)

function onlyDigits(s){ return (s || "").toString().replace(/\D/g, ""); }

function escHtml(str){
  return (str ?? "").toString()
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

async function sendResendEmail({ apiKey, from, to, subject, html }){
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html }),
  });
  const data = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, data };
}

export default async function handler(req, res) {
  try {
    // CORS (safe even if same-origin)
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS,GET");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") return res.status(200).end();

    if (req.method === "GET") {
      return res.status(200).json({
        ok: true,
        message: "lead endpoint is alive. POST JSON to send WhatsApp template + email owner.",
        now: new Date().toISOString(),
      });
    }

    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    // ENV — WhatsApp
    const token = process.env.WHATSAPP_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const templateName = process.env.WHATSAPP_TEMPLATE_NAME;
    const templateLang = process.env.WHATSAPP_TEMPLATE_LANG || "en_US";
    const fallbackTo = process.env.WHATSAPP_TEST_TO;

    // ENV — Resend
    const resendKey = process.env.RESEND_API_KEY;
    const ownerEmail = process.env.OWNER_EMAIL;
    const resendFrom = process.env.RESEND_FROM || "Zin Diary <onboarding@resend.dev>";

    const missing = [];
    if (!token) missing.push("WHATSAPP_TOKEN");
    if (!phoneNumberId) missing.push("WHATSAPP_PHONE_NUMBER_ID");
    if (!templateName) missing.push("WHATSAPP_TEMPLATE_NAME");
    if (!templateLang) missing.push("WHATSAPP_TEMPLATE_LANG");

    // Email is optional for WhatsApp to work, but you asked for it — we will require both:
    if (!resendKey) missing.push("RESEND_API_KEY");
    if (!ownerEmail) missing.push("OWNER_EMAIL");

    if (missing.length) {
      return res.status(500).json({ ok: false, error: "Missing env vars", need: missing });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});

    // Required fields (message optional)
    const firstName = (body.firstName || "").toString().trim();
    const lastName  = (body.lastName  || "").toString().trim();
    const country   = (body.country   || "").toString().trim();
    const email     = (body.email     || "").toString().trim();
    const phonePrefix = (body.phonePrefix || "").toString().trim();
    const phoneRaw  = (body.phoneRaw  || "").toString().trim();
    const message   = (body.message   || "").toString().trim();

    const optin = !!body.optin;         // WhatsApp opt-in checkbox
    const stopInfo = !!body.stopInfo;   // STOP info checkbox
    const sessions = Array.isArray(body.sessions) ? body.sessions : [];
    const packages = Array.isArray(body.packages) ? body.packages : [];

    const pickedCount = (sessions?.length || 0) + (packages?.length || 0);

    if (!firstName || !lastName || !country || !email || !phonePrefix || !phoneRaw || !optin || pickedCount < 1) {
      return res.status(400).json({
        ok: false,
        error: "Validation failed",
        need: {
          firstName: !firstName,
          lastName: !lastName,
          country: !country,
          email: !email,
          phonePrefix: !phonePrefix,
          phoneRaw: !phoneRaw,
          optin: !optin,
          atLeastOneChoice: pickedCount < 1,
        }
      });
    }

    const toDigits = onlyDigits(body.to || (phonePrefix + phoneRaw) || fallbackTo);
    if (!toDigits) {
      return res.status(400).json({ ok: false, error: "Missing 'to' (phone number)" });
    }

    // -------- 1) Send WhatsApp template --------
    const waUrl = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;

    let components = [];
    if (templateName !== "hello_world") {
      // IMPORTANT: Only send params if your template expects them.
      // We'll keep a simple 2-param example here for your future zin_booking_summary_v1.
      components = [
        {
          type: "body",
          parameters: [
            { type: "text", text: firstName },
            { type: "text", text: `Seans: ${sessions.join(", ") || "—"} | Paket: ${packages.join(", ") || "—"}` },
          ],
        },
      ];
    }

    const waPayload = {
      messaging_product: "whatsapp",
      to: toDigits,
      type: "template",
      template: {
        name: templateName,
        language: { code: templateLang },
        ...(components.length ? { components } : {}),
      },
    };

    const waResp = await fetch(waUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(waPayload),
    });

    const waData = await waResp.json().catch(() => ({}));
    if (!waResp.ok) {
      return res.status(400).json({ ok: false, status: waResp.status, whatsapp_error: waData });
    }

    // -------- 2) Email the owner (Resend) --------
    const subject = `Zîn Diary | Yeni İletişim Formu: ${firstName} ${lastName}`;
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.5">
        <h2>Yeni İletişim Formu</h2>
        <p><b>Ad Soyad:</b> ${escHtml(firstName)} ${escHtml(lastName)}</p>
        <p><b>Ülke:</b> ${escHtml(country)}</p>
        <p><b>Telefon:</b> ${escHtml(phonePrefix)} ${escHtml(phoneRaw)} (digits: ${escHtml(toDigits)})</p>
        <p><b>E-posta:</b> ${escHtml(email)}</p>
        <p><b>WhatsApp Opt-in:</b> ${optin ? "Evet" : "Hayır"}</p>
        <p><b>STOP bilgisi:</b> ${stopInfo ? "Evet" : "Hayır"}</p>
        <p><b>Seçilen Seanslar:</b> ${escHtml(sessions.join(", ") || "—")}</p>
        <p><b>Seçilen Paketler:</b> ${escHtml(packages.join(", ") || "—")}</p>
        <hr/>
        <p><b>Mesaj:</b></p>
        <pre style="white-space:pre-wrap;background:#faf7f5;padding:12px;border:1px solid #e7dbd0">${escHtml(message || "—")}</pre>
        <p style="color:#626a48;font-size:12px">Bu mail otomatik gönderildi.</p>
      </div>
    `;

    const emailResp = await sendResendEmail({
      apiKey: resendKey,
      from: resendFrom,
      to: ownerEmail,
      subject,
      html,
    });

    if (!emailResp.ok) {
      // WhatsApp succeeded but email failed — still return 200 but include warning
      return res.status(200).json({
        ok: true,
        status: 200,
        data: waData,
        email_ok: false,
        email_status: emailResp.status,
        email_error: emailResp.data,
      });
    }

    return res.status(200).json({
      ok: true,
      status: 200,
      data: waData,
      email_ok: true,
      email_status: emailResp.status,
    });

  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || "Server error" });
  }
}

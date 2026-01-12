export default async function handler(req, res) {
  try {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS,GET");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.status(200).end();

    if (req.method === "GET") {
      return res.status(200).json({
        ok: true,
        message: "lead endpoint is alive. POST JSON to send WhatsApp template.",
        now: new Date().toISOString(),
      });
    }

    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const token = process.env.WHATSAPP_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const templateName = process.env.WHATSAPP_TEMPLATE_NAME;
    const templateLang = process.env.WHATSAPP_TEMPLATE_LANG || "en_US";
    const fallbackTo = process.env.WHATSAPP_TEST_TO;

    const resendKey = process.env.RESEND_API_KEY;
    const ownerEmail = process.env.OWNER_EMAIL;
    const resendFrom = process.env.RESEND_FROM || "Zin Diary <onboarding@resend.dev>";

    const missing = [];
    if (!token) missing.push("WHATSAPP_TOKEN");
    if (!phoneNumberId) missing.push("WHATSAPP_PHONE_NUMBER_ID");
    if (!templateName) missing.push("WHATSAPP_TEMPLATE_NAME");
    if (!templateLang) missing.push("WHATSAPP_TEMPLATE_LANG");
    // email env'leri opsiyonel ama debug için yazalım:
    if (!resendKey) missing.push("RESEND_API_KEY");
    if (!ownerEmail) missing.push("OWNER_EMAIL");
    if (missing.length) {
      // WhatsApp şart, email opsiyonel -> WhatsApp eksikse 500, email eksikse uyarı
      const waMissing = missing.filter(x => x.startsWith("WHATSAPP_"));
      if (waMissing.length) return res.status(500).json({ ok: false, error: "Missing env vars", need: missing });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const firstName = (body.firstName || "").toString().trim();
    const lastName = (body.lastName || "").toString().trim();
    const country = (body.country || "").toString().trim();
    const email = (body.email || "").toString().trim();
    const message = (body.message || "").toString().trim();
    const sessions = Array.isArray(body.sessions) ? body.sessions : [];
    const packages = Array.isArray(body.packages) ? body.packages : [];
    const optin = !!body.optin;
    const stopInfo = !!body.stopInfo;

    const toRaw = (body.to || body.phoneE164 || body.phone || "").toString().trim();
    const to = (toRaw || fallbackTo || "").replace(/\D/g, "");
    if (!to) return res.status(400).json({ ok: false, error: "Missing phone number (to)" });

    // ---- WhatsApp payload ----
    const waUrl = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;

    let components = [];
    // hello_world parametresiz olmalı:
    if (templateName !== "hello_world") {
      // template onaylanınca burayı gerçek parametre düzenine göre güncellersin
      components = [
        {
          type: "body",
          parameters: [
            { type: "text", text: firstName || "—" },
            { type: "text", text: `Seans: ${sessions.join(", ") || "—"} | Paket: ${packages.join(", ") || "—"}` },
          ],
        },
      ];
    }

    const waPayload = {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: templateLang },
        ...(components.length ? { components } : {}),
      },
    };

    const waResp = await fetch(waUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(waPayload),
    });

    const waData = await waResp.json();
    const whatsapp_ok = waResp.ok;

    // ---- Email via Resend (debug’lı) ----
    let email_ok = false;
    let email_error = null;
    let email_data = null;

    if (resendKey && ownerEmail) {
      const html = `
        <h2>Yeni İletişim Formu</h2>
        <p><b>Ad:</b> ${escapeHtml(firstName)} ${escapeHtml(lastName)}</p>
        <p><b>Ülke:</b> ${escapeHtml(country)}</p>
        <p><b>Telefon:</b> ${escapeHtml(toRaw || ("+" + to))}</p>
        <p><b>Email:</b> ${escapeHtml(email)}</p>
        <p><b>Mesaj:</b><br/>${escapeHtml(message || "—")}</p>
        <p><b>Seanslar:</b> ${escapeHtml(sessions.join(", ") || "—")}</p>
        <p><b>Paketler:</b> ${escapeHtml(packages.join(", ") || "—")}</p>
        <p><b>Opt-in:</b> ${optin ? "Evet" : "Hayır"}</p>
        <p><b>STOP bilgisi:</b> ${stopInfo ? "Evet" : "Hayır"}</p>
        <hr/>
        <p><i>Zin Diary otomatik bildirim</i></p>
      `;

      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: resendFrom,
          to: [ownerEmail],
          subject: "Zin Diary — Yeni iletişim formu",
          html,
        }),
      });

      const d = await r.json().catch(() => null);

      if (r.ok) {
        email_ok = true;
        email_data = d;
      } else {
        email_ok = false;
        email_error = d || { status: r.status };
      }
    } else {
      email_error = { message: "RESEND_API_KEY / OWNER_EMAIL missing" };
    }

    // Sonuç: WhatsApp hata ise 400 döndür, ama email debug’ını da ekle
    if (!whatsapp_ok) {
      return res.status(400).json({
        ok: false,
        status: waResp.status,
        whatsapp_error: waData,
        whatsapp_ok,
        email_ok,
        email_error,
      });
    }

    // WhatsApp OK ise 200 dön; email sonucu ayrı alanlarda
    return res.status(200).json({
      ok: true,
      status: waResp.status,
      data: waData,
      whatsapp_ok,
      email_ok,
      email_error,
      email_data,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || "Server error" });
  }
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

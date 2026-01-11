// api/lead.js  (ESM uyumlu)

const json = (res, status, obj) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(obj));
};

const pick = (obj, keys) => {
  const out = {};
  for (const k of keys) out[k] = obj?.[k];
  return out;
};

export default async function handler(req, res) {
  // Sadece POST kabul edelim (tarayıcıdan açınca GET olur, 405 dönmeli)
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { ok: false, error: "Use POST /api/lead" });
  }

  try {
    const needEnv = [
      "WHATSAPP_TOKEN",
      "WHATSAPP_PHONE_NUMBER_ID",
      "WHATSAPP_TEST_TO",
      "WHATSAPP_TEMPLATE_NAME",
      "WHATSAPP_TEMPLATE_LANG",
    ];
    const missing = needEnv.filter((k) => !process.env[k]);
    if (missing.length) {
      return json(res, 400, { ok: false, error: "Missing env vars", need: missing });
    }

    // Frontend formundan gelecek alanlar
    // (req.body Vercel’de bazen string gelir; güvenli parse edelim)
    const body =
      typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});

    // Zorunlu alanlar (mesaj hariç)
    const required = ["firstName", "lastName", "country", "phone", "email"];
    const missingFields = required.filter((k) => !String(body[k] ?? "").trim());
    if (missingFields.length) {
      return json(res, 400, { ok: false, error: "Missing fields", need: missingFields });
    }

    // Checkbox: en az birini seçsin
    const optin1 = !!body.optin_whatsapp;
    const optin2 = !!body.optin_stop;
    if (!optin1 && !optin2) {
      return json(res, 400, { ok: false, error: "At least one opt-in checkbox must be selected" });
    }

    // Seans/paket seçimi en az 1 tane olmalı (istersen bunu kapatabiliriz)
    const sessions = Array.isArray(body.sessions) ? body.sessions : [];
    const packages = Array.isArray(body.packages) ? body.packages : [];
    if (sessions.length === 0 && packages.length === 0) {
      return json(res, 400, { ok: false, error: "Select at least one session or package" });
    }

    // Template parametreleri: {{1}} seanslar, {{2}} paketler
    const p1 = sessions.join(", ") || "-";
    const p2 = packages.join(", ") || "-";

    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const url = `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`;

    const payload = {
      messaging_product: "whatsapp",
      to: process.env.WHATSAPP_TEST_TO,
      type: "template",
      template: {
        name: process.env.WHATSAPP_TEMPLATE_NAME,
        language: { code: process.env.WHATSAPP_TEMPLATE_LANG }, // ör: "tr" veya "en_US"
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: p1 },
              { type: "text", text: p2 },
            ],
          },
        ],
      },
    };

    const r = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await r.json().catch(() => ({}));

    if (!r.ok) {
      return json(res, r.status, { ok: false, status: r.status, data });
    }

    // Frontend'e "tamam gönderildi" cevabı
    return json(res, 200, {
      ok: true,
      status: 200,
      sent: true,
      debug: {
        // loglamak için küçük özet
        template: process.env.WHATSAPP_TEMPLATE_NAME,
        lang: process.env.WHATSAPP_TEMPLATE_LANG,
        to: process.env.WHATSAPP_TEST_TO,
      },
      data,
    });
  } catch (e) {
    return json(res, 500, { ok: false, error: "Server error", message: String(e?.message || e) });
  }
}

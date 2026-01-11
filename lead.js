// api/lead.js (ESM) - Vercel Node Serverless uyumlu, raw body parse eder

const json = (res, status, obj) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(obj));
};

const readRawBody = (req) =>
  new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });

export default async function handler(req, res) {
  // CORS gerekmez (aynı domain) ama preflight gelirse bozulmasın:
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

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

    // --- BODY PARSE (kritik) ---
    const raw = await readRawBody(req);
    let body = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return json(res, 400, { ok: false, error: "Invalid JSON body" });
    }

    // Zorunlu alanlar (mesaj hariç)
    const required = ["firstName", "lastName", "country", "phone", "email"];
    const missingFields = required.filter((k) => !String(body?.[k] ?? "").trim());
    if (missingFields.length) {
      return json(res, 400, { ok: false, error: "Missing fields", need: missingFields });
    }

    // Checkbox: en az biri seçili
    const optin1 = !!body.optin_whatsapp;
    const optin2 = !!body.optin_stop;
    if (!optin1 && !optin2) {
      return json(res, 400, { ok: false, error: "At least one opt-in checkbox must be selected" });
    }

    // Seans/paket seçimi
    const sessions = Array.isArray(body.sessions) ? body.sessions : [];
    const packages = Array.isArray(body.packages) ? body.packages : [];
    if (sessions.length === 0 && packages.length === 0) {
      return json(res, 400, { ok: false, error: "Select at least one session or package" });
    }

    const p1 = sessions.join(", ") || "-";
    const p2 = packages.join(", ") || "-";

    const url = `https://graph.facebook.com/v22.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

    const payload = {
      messaging_product: "whatsapp",
      to: process.env.WHATSAPP_TEST_TO,
      type: "template",
      template: {
        name: process.env.WHATSAPP_TEMPLATE_NAME,
        language: { code: process.env.WHATSAPP_TEMPLATE_LANG }, // ör: "tr"
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
      return json(res, r.status, {
        ok: false,
        status: r.status,
        data,
        debug: { lang: process.env.WHATSAPP_TEMPLATE_LANG, name: process.env.WHATSAPP_TEMPLATE_NAME },
      });
    }

    return json(res, 200, { ok: true, status: 200, data });
  } catch (e) {
    return json(res, 500, { ok: false, error: "Server error", message: String(e?.message || e) });
  }
}

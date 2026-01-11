// api/lead.js  ✅ (ESM)  ✅ raw body parse  ✅ GET never crashes
// Works when package.json contains: { "type": "module" }

const sendJson = (res, status, obj) => {
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

const safeParseJson = (raw) => {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export default async function handler(req, res) {
  // Always respond to GET so you can sanity-check deployment in browser
  if (req.method === "GET") {
    return sendJson(res, 200, {
      ok: true,
      message: "lead endpoint is alive. POST JSON to send WhatsApp template.",
      now: new Date().toISOString(),
    });
  }

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST, OPTIONS");
    return sendJson(res, 405, { ok: false, error: "Method not allowed" });
  }

  try {
    // --- ENV CHECK (do not crash, return a clear JSON) ---
    const requiredEnv = [
      "WHATSAPP_TOKEN",
      "WHATSAPP_PHONE_NUMBER_ID",
      "WHATSAPP_TEMPLATE_NAME",
      "WHATSAPP_TEMPLATE_LANG",
      "WHATSAPP_TEST_TO",
    ];
    const missing = requiredEnv.filter(
      (k) => !process.env[k] || String(process.env[k]).trim() === ""
    );

    if (missing.length) {
      return sendJson(res, 500, {
        ok: false,
        error: "Missing env vars",
        need: missing,
      });
    }

    // --- BODY (raw) ---
    const raw = await readRawBody(req);
    const body = safeParseJson(raw);

    if (body === null) {
      return sendJson(res, 400, {
        ok: false,
        error: "Invalid JSON body",
        hint: "Send Content-Type: application/json with a JSON payload.",
      });
    }

    // --- Minimal validation (front-end also validates, but keep server safe) ---
    const sessions = Array.isArray(body.sessions) ? body.sessions : [];
    const packages = Array.isArray(body.packages) ? body.packages : [];

    const p1 = sessions.length ? sessions.join(", ") : "-";
    const p2 = packages.length ? packages.join(", ") : "-";

    // --- WhatsApp Cloud API request ---
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const url = `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`;

    const payload = {
      messaging_product: "whatsapp",
      to: String(process.env.WHATSAPP_TEST_TO).replace(/\D/g, ""), // digits only
      type: "template",
      template: {
        name: process.env.WHATSAPP_TEMPLATE_NAME,
        language: { code: process.env.WHATSAPP_TEMPLATE_LANG },
        // If your template has NO variables, remove components entirely.
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: String(p1) },
              { type: "text", text: String(p2) },
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
      // Return WhatsApp API error details to help debugging
      return sendJson(res, r.status || 500, {
        ok: false,
        status: r.status,
        whatsapp_error: data,
      });
    }

    return sendJson(res, 200, { ok: true, status: 200, data });
  } catch (err) {
    // Never crash without explanation
    return sendJson(res, 500, {
      ok: false,
      error: "Server exception",
      message: String(err?.message || err),
    });
  }
}

/**
 * Vercel Serverless Function: /api/lead
 * - GET  -> returns {ok:true, message:"lead ok"} (so opening in browser won't crash)
 * - POST -> validates payload and sends WhatsApp template message
 *
 * Required env vars:
 *   WHATSAPP_TOKEN
 *   WHATSAPP_PHONE_NUMBER_ID
 *   WHATSAPP_TEMPLATE_NAME
 *   WHATSAPP_TEMPLATE_LANG     (e.g. "tr" for Turkish, "en_US" for hello_world)
 *
 * Optional:
 *   WHATSAPP_DEBUG=1
 */

function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(obj));
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) out[k] = obj?.[k];
  return out;
}

function safeStr(v, max = 200) {
  if (v == null) return "";
  const s = String(v).trim();
  return s.length > max ? s.slice(0, max) : s;
}

function normalizeE164(cc, local) {
  // cc: like "+90" or "90"
  // local: "546..." (may contain spaces)
  const c = String(cc || "").replace(/[^\d+]/g, "");
  const l = String(local || "").replace(/\D/g, "");
  const ccDigits = c.startsWith("+") ? c.slice(1) : c;
  if (!ccDigits || !l) return "";
  return ccDigits + l; // WhatsApp API accepts without '+'
}

async function readJsonBody(req) {
  return await new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => { data += chunk; if (data.length > 2_000_000) reject(new Error("Body too large")); });
    req.on("end", () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); }
      catch (e) { reject(new Error("Invalid JSON")); }
    });
    req.on("error", reject);
  });
}

module.exports = async (req, res) => {
  try {
    if (req.method === "GET") {
      return json(res, 200, { ok: true, message: "lead ok (POST JSON to send template)" });
    }

    if (req.method !== "POST") {
      return json(res, 405, { ok: false, error: "Method not allowed. Use POST." });
    }

    const needed = ["WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_TEMPLATE_NAME", "WHATSAPP_TEMPLATE_LANG"];
    const missing = needed.filter(k => !process.env[k] || String(process.env[k]).trim() === "");
    if (missing.length) {
      return json(res, 400, { ok: false, error: "Missing env vars", need: missing });
    }

    const body = await readJsonBody(req);

    // Minimal validation
    const firstName = safeStr(body.firstName, 80);
    const lastName  = safeStr(body.lastName, 80);
    const email     = safeStr(body.email, 160);
    const country   = safeStr(body.country, 80);
    const cc        = safeStr(body.countryCode, 8) || safeStr(body.cc, 8);
    const phoneLocal= safeStr(body.phone, 32);
    const note      = safeStr(body.message, 500);

    const sessions  = Array.isArray(body.sessions) ? body.sessions.map(x => safeStr(x, 40)).filter(Boolean) : [];
    const packages  = Array.isArray(body.packages) ? body.packages.map(x => safeStr(x, 40)).filter(Boolean) : [];

    const optin1 = !!body.optinWhatsapp;
    const optin2 = !!body.optinStop;

    if (!firstName || !lastName || !email || !country || !cc || !phoneLocal) {
      return json(res, 400, { ok: false, error: "Missing required fields" });
    }
    if (!optin1 || !optin2) {
      return json(res, 400, { ok: false, error: "Consent required" });
    }
    if (sessions.length === 0 && packages.length === 0) {
      return json(res, 400, { ok: false, error: "Select at least one session or package" });
    }

    const to = normalizeE164(cc, phoneLocal);
    if (!to || to.length < 8) {
      return json(res, 400, { ok: false, error: "Invalid phone number" });
    }

    // Build template variables (body has {{1}} {{2}} in your demo template)
    const selectionText = [
      sessions.length ? `Seçilen seanslar: ${sessions.join(", ")}` : "",
      packages.length ? `Seçilen paketler: ${packages.join(", ")}` : ""
    ].filter(Boolean).join(" | ");

    const totalText = safeStr(body.total || body.totalText || "", 120);

    const templatePayload = {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: process.env.WHATSAPP_TEMPLATE_NAME,
        language: { code: process.env.WHATSAPP_TEMPLATE_LANG },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: selectionText || "—" },
              { type: "text", text: totalText || "—" }
            ]
          }
        ]
      }
    };

    // Send
    const url = `https://graph.facebook.com/v22.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(templatePayload)
    });

    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      return json(res, resp.status, {
        ok: false,
        status: resp.status,
        error: "WhatsApp API error",
        details: data
      });
    }

    return json(res, 200, { ok: true, status: resp.status, data });

  } catch (err) {
    return json(res, 500, {
      ok: false,
      error: "FUNCTION_CRASH",
      message: err?.message || String(err)
    });
  }
};

/**
 * /api/lead
 * Vercel Serverless Function (Node.js)
 *
 * Expects POST JSON from the frontend contact modal.
 * Sends a WhatsApp template message via Meta WhatsApp Cloud API.
 *
 * NOTE:
 * - While your custom template (zin_booking_summary_v1) is still "In review",
 *   you should use a known approved template like "hello_world".
 *   Set env vars in Vercel:
 *     WHATSAPP_TOKEN
 *     WHATSAPP_PHONE_NUMBER_ID
 *     WHATSAPP_TEMPLATE_NAME   (e.g. hello_world)
 *     WHATSAPP_TEMPLATE_LANG   (e.g. en_US)
 */

function readJson(req) {
  return new Promise((resolve, reject) => {
    // If Vercel already parsed it
    if (req.body && typeof req.body === "object") return resolve(req.body);

    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(obj));
}

function normalizePhone(prefix, phone) {
  const p = String(prefix || "").replace(/[^\d]/g, "");
  const n = String(phone || "").replace(/[^\d]/g, "");
  if (!p || !n) return "";
  // Ensure prefix includes country code only (no leading zeros)
  return (p + n).replace(/^0+/, "");
}

module.exports = async (req, res) => {
  try {
    // CORS (keep simple for same-domain usage)
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") return json(res, 200, { ok: true });
    if (req.method !== "POST") {
      return json(res, 405, {
        ok: false,
        error: "Method not allowed. Use POST.",
      });
    }

    const token = process.env.WHATSAPP_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const templateName = process.env.WHATSAPP_TEMPLATE_NAME || "hello_world";
    const templateLang = process.env.WHATSAPP_TEMPLATE_LANG || "en_US";

    if (!token || !phoneNumberId) {
      return json(res, 500, {
        ok: false,
        error: "Missing env vars",
        need: ["WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"],
      });
    }

    const body = await readJson(req);

    // Basic required fields (message optional)
    const firstName = String(body.firstName || "").trim();
    const lastName = String(body.lastName || "").trim();
    const email = String(body.email || "").trim();
    const phone = normalizePhone(body.phone_prefix, body.phone);
    const consentWhatsapp = !!body.consent_whatsapp;

    if (!firstName || !lastName || !email || !phone) {
      return json(res, 400, {
        ok: false,
        error: "Missing required fields",
        need: ["firstName", "lastName", "email", "phone_prefix", "phone"],
      });
    }

    if (!consentWhatsapp) {
      return json(res, 400, {
        ok: false,
        error: "WhatsApp consent is required",
      });
    }

    // Build WhatsApp template payload
    const payload = {
      messaging_product: "whatsapp",
      to: phone,
      type: "template",
      template: {
        name: templateName,
        language: { code: templateLang },
      },
    };

    // If you later use zin_booking_summary_v1 with variables, add components here.
    // Example (when approved):
    // payload.template.components = [
    //   { type: "body", parameters: [
    //     { type: "text", text: "Seans 1, Paket 2" },
    //     { type: "text", text: "$15" }
    //   ]}
    // ];

    const url = `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`;

    const r = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
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
        message:
          (data && data.error && data.error.message) ||
          "WhatsApp API error",
      });
    }

    // Success response to frontend
    return json(res, 200, { ok: true, status: 200, data });
  } catch (e) {
    return json(res, 500, {
      ok: false,
      error: "Server error",
      detail: String(e && e.message ? e.message : e),
    });
  }
};

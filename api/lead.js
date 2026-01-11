// /api/lead.js
// Vercel Serverless Function (Node)
// - GET  -> health/info (mesaj GÖNDERMEZ)
// - POST -> formdan gelen veriyi alır, WhatsApp template mesajı yollar

const DEFAULT_LANG = "tr"; // template dil kodu (Meta'nin kabul ettiği)

function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(obj));
}

// Vercel bazen body'yi otomatik parse eder; bazen raw gelir.
// Bu helper ikisini de taşır.
async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;

  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        // form-urlencoded gelirse patlamasın
        resolve({ _raw: data });
      }
    });
    req.on("error", reject);
  });
}

function normalizeMsisdn(countryCallingCode, nationalNumber) {
  // frontend "90546..." gibi gönderebilir, ya da "546..." + "+90" gibi
  // burada en basit: sadece rakam bırak, başında + yok
  const cc = String(countryCallingCode || "").replace(/\D/g, "");
  const nn = String(nationalNumber || "").replace(/\D/g, "");
  const combined = (cc + nn).replace(/^0+/, "");
  return combined;
}

async function sendTemplate({ token, phoneNumberId, to, templateName, lang, params }) {
  const url = `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`;

  const body = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: lang || DEFAULT_LANG },
      components: [
        {
          type: "body",
          parameters: params.map((t) => ({ type: "text", text: String(t ?? "") })),
        },
      ],
    },
  };

  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await r.json().catch(() => ({}));
  return { status: r.status, data };
}

module.exports = async (req, res) => {
  try {
    if (req.method === "GET") {
      return json(res, 200, { ok: true, message: "lead endpoint ok (use POST)" });
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return json(res, 405, { ok: false, error: "Method not allowed" });
    }

    // ENV (Vercel)
    const token = process.env.WHATSAPP_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const templateName = process.env.WHATSAPP_TEMPLATE_NAME; // zin_booking_summary_v1
    const templateLang = process.env.WHATSAPP_TEMPLATE_LANG || DEFAULT_LANG;

    if (!token || !phoneNumberId || !templateName) {
      return json(res, 500, {
        ok: false,
        error: "Missing env vars",
        need: ["WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_TEMPLATE_NAME"],
      });
    }

    const body = await readBody(req);

    // Frontend'den beklenen alanlar (senin formuna göre)
    // Örn: { firstName, lastName, email, countryCode, phone, message, sessions:[], packages:[], optin1:true, optin2:true }
    const firstName = body.firstName || body.ad || "";
    const lastName = body.lastName || body.soyad || "";
    const email = body.email || body.emailAddress || "";
    const message = body.message || body.mesaj || "";
    const sessions = Array.isArray(body.sessions) ? body.sessions : [];
    const packages = Array.isArray(body.packages) ? body.packages : [];

    // Telefon: iki farklı form olabilir
    // 1) body.phoneE164 / body.phone gibi "90546..."
    // 2) body.countryCallingCode + body.phoneNational
    const to =
      String(body.to || body.phone || body.phoneE164 || "").replace(/\D/g, "") ||
      normalizeMsisdn(body.countryCallingCode, body.phoneNational);

    // Checkbox zorunluluğu (sen böyle istedin): en az 1 tanesi true
    const opt1 = !!(body.optinWhatsapp ?? body.optin1 ?? body.whatsappOptin);
    const opt2 = !!(body.optinStop ?? body.optin2 ?? body.stopOptin);
    if (!opt1 && !opt2) {
      return json(res, 400, { ok: false, error: "Opt-in required (select at least one checkbox)" });
    }

    // Mesaj hariç alanları zorunlu demiştin:
    if (!firstName || !lastName || !email || !to) {
      return json(res, 400, {
        ok: false,
        error: "Missing required fields",
        need: ["firstName", "lastName", "email", "phone"],
      });
    }

    // Template paramları (2 param var diye varsayıyorum: {{1}}, {{2}})
    // Senin screenshot'ta Variable Samples iki tane görünüyordu.
    const selectedText =
      `Seçtiğiniz seans ve paketler:\n` +
      `${sessions.length ? sessions.join(", ") : "—"} / ${packages.length ? packages.join(", ") : "—"}`;

    const totalText = `İletişim: ${firstName} ${lastName} • ${email}`;

    const params = [selectedText, totalText];

    const result = await sendTemplate({
      token,
      phoneNumberId,
      to,
      templateName,
      lang: templateLang, // BURASI kritik: Meta template dil kodu
      params,
    });

    if (result.status >= 400) {
      return json(res, 200, { ok: false, status: result.status, data: result.data });
    }

    return json(res, 200, { ok: true, status: result.status, data: result.data });
  } catch (e) {
    return json(res, 500, { ok: false, error: "Server crashed", detail: String(e?.message || e) });
  }
};

// api/lead.js  (ESM uyumlu)

export default async function handler(req, res) {
  try {
    // CORS (same-origin ise sorun olmaz ama koymak iyi)
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS,GET");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") return res.status(200).end();

    // GET ile açınca "alive" dönsün (senin gördüğün gibi)
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

    // ENV
    const token = process.env.WHATSAPP_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const templateName = process.env.WHATSAPP_TEMPLATE_NAME;
    const templateLang = process.env.WHATSAPP_TEMPLATE_LANG || "en_US";
    const fallbackTo = process.env.WHATSAPP_TEST_TO; // formdan to gelmezse test numarasına gider

    const missing = [];
    if (!token) missing.push("WHATSAPP_TOKEN");
    if (!phoneNumberId) missing.push("WHATSAPP_PHONE_NUMBER_ID");
    if (!templateName) missing.push("WHATSAPP_TEMPLATE_NAME");
    if (!templateLang) missing.push("WHATSAPP_TEMPLATE_LANG");
    if (missing.length) {
      return res.status(500).json({ ok: false, error: "Missing env vars", need: missing });
    }

    // Body parse (Vercel çoğu zaman req.body'yi hazır verir; yine de garanti alalım)
    const body =
      typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});

    // Formdan gelebilecek alanlar
    const toRaw = (body.to || body.phone || body.wa || "").toString().trim();
    const to = (toRaw || fallbackTo || "").replace(/\D/g, ""); // sadece rakam
    if (!to) {
      return res.status(400).json({ ok: false, error: "Missing 'to' (phone number)" });
    }

    // WhatsApp Cloud API endpoint
    const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;

    // ✅ hello_world = parametresiz gönder
    // ✅ zin_booking_summary_v1 (approve olunca) = parametreli göndereceğiz
    let components = [];

    if (templateName !== "hello_world") {
      // Bu blok, parametreli template’ler için.
      // Şimdilik senin gerçek template onaylanana kadar devreye girmeyecek.
      const firstName = (body.firstName || body.first_name || "").toString().trim() || "—";
      const sessions = Array.isArray(body.sessions) ? body.sessions : [];
      const packages = Array.isArray(body.packages) ? body.packages : [];

      // örnek: 2 parametre gönderme (template’in gerçekten 2 parametre beklemesi şart)
      components = [
        {
          type: "body",
          parameters: [
            { type: "text", text: firstName },
            { type: "text", text: `Seanslar: ${sessions.join(", ") || "—"} / Paketler: ${packages.join(", ") || "—"}` },
          ],
        },
      ];
    }

    const payload = {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: templateLang },
        ...(components.length ? { components } : {}),
      },
    };

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await resp.json();

    if (!resp.ok) {
      return res.status(400).json({
        ok: false,
        status: resp.status,
        whatsapp_error: data,
      });
    }

    return res.status(200).json({ ok: true, status: resp.status, data });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || "Server error" });
  }
}

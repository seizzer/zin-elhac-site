async function sendTemplate({ token, phoneNumberId, to, name, lang }) {
  const url = `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`;

  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name,
      language: { code: lang }
    }
  };

  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await r.json();
  return { ok: r.ok, status: r.status, data };
}

export default async function handler(req, res) {
  try {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const to = process.env.WHATSAPP_TEST_TO;
    const name = process.env.WHATSAPP_TEMPLATE_NAME || "hello_world";
    const lang = process.env.WHATSAPP_TEMPLATE_LANG || "en_US";

    if (!token || !phoneNumberId || !to) {
      return res.status(400).json({
        ok: false,
        error: "Missing env vars",
        need: ["WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_TEST_TO"]
      });
    }

    const result = await sendTemplate({ token, phoneNumberId, to, name, lang });
    return res.status(result.ok ? 200 : 500).json(result);
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
}

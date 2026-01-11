// api/lead.js
export default async function handler(req, res) {
  // CORS ayarları
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    // Vercel zaten body'yi parse etmiş olabilir
    const body = req.body || {};

    // Gerekli alanların kontrolü (Body içinden)
    const { to, firstName, lastName } = body;

    if (req.method === 'POST') {
      if (!to || !firstName) {
         return res.status(400).json({ ok: false, error: "Eksik veri: to veya firstName" });
      }

      // WhatsApp API çağrısını yapın (Size verdiğim önceki kodun devamı buraya gelecek)
      // ...
    }

    res.status(200).json({ ok: true, message: "İşlem başarılı" });

  } catch (err) {
    console.error("HATA:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
}

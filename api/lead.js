import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { name, phone, session, package: selectedPackage, sessionPrice, packagePrice } = req.body;

    // 1. ADIM: VERİLERİ BİRLEŞTİRME (Template'e uygun hale getirme)
    // Taslağındaki {{1}} için isimleri birleştiriyoruz
    const selectedItems = `${session || 'Seçilmedi'}, ${selectedPackage || 'Seçilmedi'}`;
    
    // Taslağındaki {{2}} için fiyatları birleştiriyoruz
    const totalDetails = `${session}: $${sessionPrice}, ${selectedPackage}: $${packagePrice}`;

    // 2. ADIM: WHATSAPP MESAJI GÖNDERİMİ
    const waResponse = await fetch(
      `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: phone.replace(/\D/g, ''), // Sadece rakamlar
          type: "template",
          template: {
            name: process.env.WHATSAPP_TEMPLATE_NAME,
            language: { code: process.env.WHATSAPP_TEMPLATE_LANG || "tr" },
            components: [
              {
                type: "body",
                parameters: [
                  { type: "text", text: selectedItems }, // {{1}} buraya gider
                  { type: "text", text: totalDetails }   // {{2}} buraya gider
                ],
              },
            ],
          },
        }),
      }
    );

    const waData = await waResponse.json();
    console.log("WA Response:", JSON.stringify(waData));

    // 3. ADIM: SANA GELEN MAİL (RESEND)
    await resend.emails.send({
      from: process.env.RESEND_FROM,
      to: process.env.OWNER_EMAIL,
      subject: `Yeni Kayıt: ${name}`,
      html: `
        <h3>Yeni Ajanda Kaydı</h3>
        <p><strong>İsim:</strong> ${name}</p>
        <p><strong>Telefon:</strong> ${phone}</p>
        <p><strong>Seçilen Seans:</strong> ${session} ($${sessionPrice})</p>
        <p><strong>Seçilen Paket:</strong> ${selectedPackage} ($${packagePrice})</p>
      `,
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Hata:", error);
    return res.status(500).json({ error: error.message });
  }
}

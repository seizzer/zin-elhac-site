import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  // 1. İzin verilmeyen metod kontrolü
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Gelen veriyi loglara yazdıralım ki neyin eksik olduğunu görelim
    console.log("FORM'DAN GELEN VERİLER:", JSON.stringify(req.body));

    const { name, phone, session, package: selectedPackage, sessionPrice, packagePrice } = req.body;

    // 2. Telefon numarası kontrolü (Hatanın sebebi burasıydı)
    if (!phone) {
      console.error("HATA: Telefon numarası (phone) boş geldi!");
      return res.status(400).json({ error: 'Telefon numarası zorunludur.' });
    }

    // Verileri WhatsApp formatına hazırlama
    const selectedItems = `${session || 'Seçilmedi'}, ${selectedPackage || 'Seçilmedi'}`;
    const totalDetails = `${session}: $${sessionPrice}, ${selectedPackage}: $${packagePrice}`;

    // 3. WhatsApp Mesajı Gönderimi
    console.log("WhatsApp isteği hazırlanıyor...");
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
          to: phone.replace(/\D/g, ''), // Sadece rakamları al
          type: "template",
          template: {
            name: process.env.WHATSAPP_TEMPLATE_NAME,
            language: { code: process.env.WHATSAPP_TEMPLATE_LANG || "tr" },
            components: [
              {
                type: "body",
                parameters: [
                  { type: "text", text: selectedItems }, // {{1}}
                  { type: "text", text: totalDetails }   // {{2}}
                ],
              },
            ],
          },
        }),
      }
    );

    const waData = await waResponse.json();
    console.log("META API CEVABI:", JSON.stringify(waData));

    // 4. Mail Gönderimi (Resend)
    console.log("Mail gönderiliyor...");
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

    return res.status(200).json({ success: true, metaResponse: waData });

  } catch (error) {
    console.error("SİSTEM HATASI:", error);
    return res.status(500).json({ error:

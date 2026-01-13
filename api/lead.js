import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log("FORM'DAN GELEN HAM VERİ:", JSON.stringify(req.body));

    // 1. ADIM: Loglara göre verileri doğru isimlerle alıyoruz
    const { 
      firstName, 
      lastName, 
      phonePrefix, 
      phoneRaw, 
      sessions, 
      packages, 
      sessionPrice, 
      packagePrice 
    } = req.body;

    // 2. ADIM: Parçalı verileri birleştiriyoruz (Backend'in beklediği hale getiriyoruz)
    // İsim soyisim birleşiyor
    const name = `${firstName || ''} ${lastName || ''}`.trim();
    
    // Telefon kod ve numara birleşiyor (Örn: +90 ve 555... -> +90555...)
    const phone = `${phonePrefix || ''}${phoneRaw || ''}`.replace(/\D/g, ''); // Sadece rakamları bırak

    // Seans ve paketler dizi (array) olarak geliyor ["Seans 1"], onları metne çeviriyoruz
    const sessionName = Array.isArray(sessions) ? sessions.join(", ") : (sessions || 'Seçilmedi');
    const packageName = Array.isArray(packages) ? packages.join(", ") : (packages || 'Seçilmedi');

    // Fiyatlar gelmediyse (undefined ise) boş görünmesin diye kontrol
    const sPrice = sessionPrice || '0';
    const pPrice = packagePrice || '0';

    // 3. ADIM: Telefon kontrolü (Artık birleştirdiğimiz için hata vermeyecek)
    if (!phone) {
      console.error("HATA: Telefon numarası oluşturulamadı!");
      return res.status(400).json({ error: 'Telefon numarası zorunludur.' });
    }

    // 4. ADIM: WhatsApp için metinleri hazırlama
    const selectedItems = `${sessionName}, ${packageName}`;
    const totalDetails = `Seans: $${sPrice}, Paket: $${pPrice}`;

    // 5. WhatsApp Gönderimi
    console.log("WhatsApp isteği hazırlanıyor... Gidecek No:", phone);
    
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
          to: phone, 
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

    // 6. Mail Gönderimi
    await resend.emails.send({
      from: process.env.RESEND_FROM,
      to: process.env.OWNER_EMAIL,
      subject: `Yeni Kayıt: ${name}`,
      html: `
        <h3>Yeni Ajanda Kaydı</h3>
        <p><strong>İsim:</strong> ${name}</p>
        <p><strong>Telefon:</strong> ${phone}</p>
        <p><strong>Seçimler:</strong> ${selectedItems}</p>
        <p><strong>Fiyat Detayı:</strong> ${totalDetails}</p>
      `,
    });

    return res.status(200).json({ success: true, metaResponse: waData });

  } catch (error) {
    console.error("SİSTEM HATASI:", error);
    return res.status(500).json({ error: error.message });
  }
}

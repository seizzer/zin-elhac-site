import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 1. FRONTEND'DEN GELEN VERİYİ AL
    // Dikkat: Artık "sessions" dizisi değil, tek "session" stringi geliyor.
    const { 
      firstName, 
      lastName, 
      phone,      
      email, 
      session,    // Örn: "Sakina - Single"
      message,
      q1, q2, q3, q4, q5, q6, q7, q8
    } = req.body;

    console.log("Gelen Veri (Backend):", req.body);

    // 2. VERİ TEMİZLİĞİ
    const fullName = `${firstName || ''} ${lastName || ''}`.trim();
    const cleanPhone = (phone || '').replace(/\D/g, ''); 
    const clientEmail = email || 'Belirtilmedi';
    const clientMessage = message || 'Mesaj bırakılmadı.';

    if (!cleanPhone) {
      return res.status(400).json({ error: 'Telefon numarası zorunlu.' });
    }

    // 3. PAKET İSMİ VE FİYAT BELİRLEME (Yeni Yapı)
    let arabicName = session || "غير محدد"; // Seçilmediyse
    let priceStr = "";

    // Gelen string'i analiz edip Arapça karşılığını ve fiyatını bulalım
    if (session) {
        if (session.includes("Sakina")) {
            if (session.includes("Single")) {
                arabicName = 'لقاء "سكينة" (جلسة واحدة)';
                priceStr = "110$";
            } else { 
                arabicName = 'لقاء "سكينة" (باقة 3 جلسات)';
                priceStr = "295$";
            }
        } else if (session.includes("El-Abour")) {
            if (session.includes("Single")) {
                arabicName = 'لقاء "العبور" (جلسة واحدة)';
                priceStr = "147$";
            } else { 
                arabicName = 'لقاء "العبور" (باقة 3 جلسات)';
                priceStr = "395$";
            }
        }
    }

    // 4. WHATSAPP GÖNDERİMİ
    let waData = null;
    try {
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
              to: cleanPhone, 
              type: "template",
              template: {
                name: process.env.WHATSAPP_TEMPLATE_NAME,
                language: { code: "ar" },
                components: [
                  {
                    type: "body",
                    parameters: [
                      { type: "text", text: arabicName }, // Değişken 1: Paket Adı
                      { type: "text", text: priceStr }    // Değişken 2: Fiyat
                    ],
                  },
                ],
              },
            }),
          }
        );
        waData = await waResponse.json();
        console.log("Meta Yanıtı:", JSON.stringify(waData));
    } catch (waError) {
        console.error("WhatsApp Hatası:", waError);
    }
    
    // 5. MAIL GÖNDERİMİ
    try {
        await resend.emails.send({
          from: process.env.RESEND_FROM,
          to: process.env.OWNER_EMAIL,
          subject: `طلب جديد: ${fullName}`,
          html: `
            <div style="font-family: Arial, sans-serif; direction: rtl; text-align: right;">
                <h3>طلب استشارة جديد</h3>
                <p><strong>الاسم:</strong> ${fullName}</p>
                <p><strong>الهاتف:</strong> ${phone} (<a href="https://wa.me/${cleanPhone}">واتساب</a>)</p>
                <p><strong>الباقة:</strong> ${arabicName} - ${priceStr}</p>
                <hr>
                <p><strong>تفاصيل الحالة:</strong></p>
                <ul>
                    <li>الأعراض: ${q1}</li>
                    <li>البداية: ${q2}</li>
                    <li>التفاقم: ${q3}</li>
                    <li>التشخيص: ${q4}</li>
                    <li>الأدوية: ${q5}</li>
                    <li>تجربة سابقة: ${q6}</li>
                    <li>التوقعات: ${q7}</li>
                    <li>الوقت: ${q8}</li>
                </ul>
                <p><strong>رسالة:</strong> ${clientMessage}</p>
            </div>
          `,
        });
    } catch (mailError) {
        console.error("Mail Hatası:", mailError);
    }

    return res.status(200).json({ success: true, metaResponse: waData });

  } catch (error) {
    console.error("Sistem Hatası:", error);
    return res.status(500).json({ error: error.message });
  }
}

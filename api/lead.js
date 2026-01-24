import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 1. FRONTEND'DEN GELEN VERİ
    const { 
      firstName, lastName, phone, email, session, message,
      q1, q2, q3, q4, q5, q6, q7, q8
    } = req.body;

    console.log("🟢 1. Veri Alındı:", req.body);

    // 2. TEMİZLİK
    const fullName = `${firstName || ''} ${lastName || ''}`.trim();
    const cleanPhone = (phone || '').replace(/\D/g, ''); 
    const clientEmail = email || 'Belirtilmedi';
    const clientMessage = message || 'Mesaj bırakılmadı.';

    if (!cleanPhone) {
      console.error("🔴 Hata: Telefon numarası yok.");
      return res.status(400).json({ error: 'Telefon zorunlu.' });
    }

    // 3. PAKET VE FİYAT BELİRLEME
    let arabicName = session || "غير محدد"; 
    let priceStr = "";

    if (session) {
        if (session.includes("Sakina")) {
            if (session.includes("Single")) {
                // Tırnak hatası düzeltildi: ' yerine " kullanıldı
                arabicName = 'لقاء "بصيرة" (جلسة واحدة)';
                priceStr = "110$";
            } else { 
                arabicName = 'لقاء "بصيرة" (باقة 3 جلسات)';
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

    console.log(`🟡 2. WhatsApp Hazırlanıyor: Tel: ${cleanPhone}, Paket: ${arabicName}`);

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
                      { type: "text", text: arabicName },
                      { type: "text", text: priceStr }
                    ],
                  },
                ],
              },
            }),
          }
        );

        waData = await waResponse.json();
        
        if (!waResponse.ok) {
            console.error("🔴 WhatsApp API Hatası:", JSON.stringify(waData, null, 2));
        } else {
            console.log("🟢 WhatsApp Başarılı:", JSON.stringify(waData, null, 2));
        }

    } catch (waError) {
        console.error("🔴 WhatsApp Bağlantı Hatası:", waError);
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
                <p><strong>الهاتف:</strong> ${phone}</p>
                <p><strong>الباقة:</strong> ${arabicName} - ${priceStr}</p>
                <hr>
                <p><strong>تفاصيل الحالة:</strong></p>
                <ul>
                    <li>1. الأعراض: ${q1}</li>
                    <li>2. البداية: ${q2}</li>
                    <li>3. التفاقم: ${q3}</li>
                    <li>4. التشخيص: ${q4}</li>
                    <li>5. الأدوية: ${q5}</li>
                    <li>6. تجربة سابقة: ${q6}</li>
                    <li>7. التوقعات: ${q7}</li>
                    <li>8. الوقت: ${q8}</li>
                </ul>
                <p><strong>رسالة:</strong> ${clientMessage}</p>
            </div>
          `,
        });
        console.log("🟢 Mail Gönderildi");
    } catch (mailError) {
        console.error("🔴 Mail Hatası:", mailError);
    }

    return res.status(200).json({ success: true, metaResponse: waData });

  } catch (error) {
    console.error("🔴 SİSTEM ÇÖKME HATASI:", error);
    return res.status(500).json({ error: error.message });
  }
}

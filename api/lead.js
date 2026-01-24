import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  // Sadece POST isteklerini kabul et
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 1. HTML Formundan gelen verileri al (Frontend ile birebir uyumlu)
    const { 
      firstName, 
      lastName, 
      phone,      // Frontend artık birleşik gönderiyor (Prefix + Raw)
      email, 
      session,    // Frontend artık tek string gönderiyor: "Sakina - Single" vb.
      message,
      q1, q2, q3, q4, q5, q6, q7, q8
    } = req.body;

    // 2. Verileri Temizle ve Hazırla
    const fullName = `${firstName || ''} ${lastName || ''}`.trim();
    // WhatsApp için sadece rakamları al
    const cleanPhone = (phone || '').replace(/\D/g, ''); 
    const clientEmail = email || 'Belirtilmedi';
    const clientMessage = message || 'Mesaj bırakılmadı.';

    if (!cleanPhone) {
      return res.status(400).json({ error: 'Telefon numarası zorunlu.' });
    }

    // 3. Fiyat ve İsim Belirleme Mantığı
    // Frontend'den gelen "session" stringine göre Arapça isim ve fiyatı belirliyoruz.
    let arabicName = session; 
    let priceStr = "0$";

    if (session) {
        if (session.includes("Sakina")) {
            if (session.includes("Single")) {
                arabicName = 'لقاء "سكينة" (جلسة واحدة)';
                priceStr = "110$";
            } else { // Package
                arabicName = 'لقاء "سكينة" (باقة 3 جلسات)';
                priceStr = "295$";
            }
        } else if (session.includes("El-Abour")) {
            if (session.includes("Single")) {
                arabicName = 'لقاء "العبور" (جلسة واحدة)';
                priceStr = "147$";
            } else { // Package
                arabicName = 'لقاء "العبور" (باقة 3 جلسات)';
                priceStr = "395$";
            }
        }
    } else {
        arabicName = "لم يتم الاختيار"; // Seçim yok
    }

    // 4. WHATSAPP GÖNDERİMİ (Meta Cloud API)
    // Şablona 2 parametre gidiyor: 1. Paket İsmi, 2. Fiyat
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
                      { type: "text", text: arabicName }, // Param 1: Paket Adı
                      { type: "text", text: priceStr }    // Param 2: Fiyat
                    ],
                  },
                ],
              },
            }),
          }
        );
        waData = await waResponse.json();
    } catch (waError) {
        console.error("WhatsApp Error:", waError);
        // WhatsApp hatası olsa bile mail atmaya devam etsin diye akışı kesmiyoruz
    }
    
    // 5. MAIL GÖNDERİMİ (Resend - Arapça Tablo)
    await resend.emails.send({
      from: process.env.RESEND_FROM,
      to: process.env.OWNER_EMAIL,
      subject: `طلب جديد: ${fullName}`, // Konu: Yeni Talep: İsim Soyisim
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden; direction: rtl; text-align: right;">
            <div style="background-color: #626a48; padding: 20px; text-align: center;">
                <h2 style="color: #ffffff; margin: 0;">طلب استشارة جديد 🎉</h2>
            </div>
            <div style="padding: 20px; background-color: #fcfbf9;">
                
                <h3 style="color:#b36932; border-bottom:1px solid #ddd; padding-bottom:10px;">👤 البيانات الشخصية والطلب</h3>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px;">
                    <tr><td style="padding:8px; border-bottom:1px solid #eee; font-weight:bold; width: 150px;">الاسم والكنية</td><td style="padding:8px; border-bottom:1px solid #eee;">${fullName}</td></tr>
                    <tr><td style="padding:8px; border-bottom:1px solid #eee; font-weight:bold;">رقم الهاتف</td><td style="padding:8px; border-bottom:1px solid #eee; direction: ltr; text-align: right;">${phone}</td></tr>
                    <tr><td style="padding:8px; border-bottom:1px solid #eee; font-weight:bold;">البريد الإلكتروني</td><td style="padding:8px; border-bottom:1px solid #eee;">${clientEmail}</td></tr>
                    <tr><td style="padding:8px; border-bottom:1px solid #eee; font-weight:bold;">الباقة المختارة</td><td style="padding:8px; border-bottom:1px solid #eee; color:#d35400; font-weight:bold;">${arabicName}</td></tr>
                    <tr><td style="padding:8px; border-bottom:1px solid #eee; font-weight:bold;">المبلغ</td><td style="padding:8px; border-bottom:1px solid #eee;">${priceStr}</td></tr>
                </table>

                <h3 style="color:#b36932; border-bottom:1px solid #ddd; padding-bottom:10px;">📋 استمارة المقابلة الأولية</h3>
                <div style="background:#fff; padding:15px; border:1px solid #eee; border-radius:5px;">
                    <p><strong>1. الأعراض والتحديات الرئيسية:</strong><br>${q1 || '-'}</p>
                    <hr style="border:0; border-top:1px solid #eee; margin:10px 0;">
                    
                    <p><strong>2. متى بدأت هذه الأعراض:</strong><br>${q2 || '-'}</p>
                    <hr style="border:0; border-top:1px solid #eee; margin:10px 0;">
                    
                    <p><strong>3. أوقات التفاقم (تزداد سوءاً):</strong><br>${q3 || '-'}</p>
                    <hr style="border:0; border-top:1px solid #eee; margin:10px 0;">
                    
                    <p><strong>4. هل تم التشخيص مسبقاً؟</strong><br>👉 ${q4 || '-'}</p>
                    <hr style="border:0; border-top:1px solid #eee; margin:10px 0;">

                    <p><strong>5. هل يتناول أدوية حالياً؟</strong><br>👉 ${q5 || '-'}</p>
                    <hr style="border:0; border-top:1px solid #eee; margin:10px 0;">

                    <p><strong>6. تجربة العلاج السابقة:</strong><br>👉 ${q6 || '-'}</p>
                    <hr style="border:0; border-top:1px solid #eee; margin:10px 0;">
                    
                    <p><strong>7. التوقعات والأهداف:</strong><br>${q7 || '-'}</p>
                    <hr style="border:0; border-top:1px solid #eee; margin:10px 0;">

                    <p><strong>8. توفر الوقت والعزيمة:</strong><br>${q8 || '-'}</p>
                </div>

                <h3 style="color:#b36932; border-bottom:1px solid #ddd; padding-bottom:10px; margin-top:25px;">💬 رسالة إضافية</h3>
                <p style="background:#eee; padding:10px; border-radius:4px; font-style:italic;">"${clientMessage}"</p>

            </div>
        </div>
      `,
    });

    // Başarılı yanıt
    return res.status(200).json({ success: true, metaResponse: waData });

  } catch (error) {
    console.error("SİSTEM HATASI:", error);
    return res.status(500).json({ error: error.message });
  }
}

// /api/lead.js
const json = (res, status, obj) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(obj));
};

const allowCors = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); 
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
};

const safeStr = (v) => (typeof v === 'string' ? v.trim() : '');
const safeArr = (v) => (Array.isArray(v) ? v.map(x => String(x)) : []);
const digitsOnly = (v) => String(v || '').replace(/\D/g, '');

const PRICE_SESSION = 5;
const PRICE_PACKAGE = 10;

async function sendWhatsAppTemplate({ to, firstName, sessions, packages }) {
  try {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const templateName = process.env.WHATSAPP_TEMPLATE_NAME || "zin_booking_summary_v1"; 
    const templateLang = "tr"; 

    const waTo = digitsOnly(to);
    const sessionCount = safeArr(sessions).length;
    const packageCount = safeArr(packages).length;
    const totalPrice = (sessionCount * PRICE_SESSION) + (packageCount * PRICE_PACKAGE);
    
    const sessionNames = sessions.join(', ') || 'Seçilmedi';
    const packageNames = packages.join(', ') || 'Seçilmedi';

    const detailText = `Seanslar: ${sessionNames} ($${sessionCount * PRICE_SESSION}). Paketler: ${packageNames} ($${packageCount * PRICE_PACKAGE}). TOPLAM: $${totalPrice}. Ödeme: Western Union/MoneyGram (Ali Veli / Hasan Hüseyin). Dekontu lütfen bu numaraya iletiniz.`;

    const payload = {
      messaging_product: 'whatsapp',
      to: waTo,
      type: 'template',
      template: {
        name: templateName,
        language: { code: templateLang },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: firstName },

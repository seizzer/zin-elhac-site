// /api/lead.js  (ESM for Vercel: package.json has { "type": "module" })
/*
  What this endpoint does
  - Accepts POST JSON from the website contact form
  - Sends a WhatsApp template message via Meta Cloud API
  - Sends an email to the site owner via Resend (optional; will fail until domain is verified)
*/

const json = (res, status, obj) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(obj));
};

const allowCors = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); // OK for a public brochure site
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
};

const requireEnv = (name) => {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
};

const safeStr = (v) => (typeof v === 'string' ? v.trim() : '');
const safeArr = (v) => (Array.isArray(v) ? v.map(x => String(x)) : []);
const digitsOnly = (v) => String(v || '').replace(/\D/g, '');

async function sendWhatsAppTemplate({ to, firstName, lastName, sessions, packages, message }) {
  const token = requireEnv('WHATSAPP_TOKEN');
  const phoneNumberId = requireEnv('WHATSAPP_PHONE_NUMBER_ID');
  const templateName = requireEnv('WHATSAPP_TEMPLATE_NAME');
  const templateLang = requireEnv('WHATSAPP_TEMPLATE_LANG'); // e.g. "tr"
  const paramCount = Number(process.env.WHATSAPP_TEMPLATE_PARAM_COUNT || '2');

  const waTo = digitsOnly(to);
  if (!waTo || waTo.length < 8) throw new Error('Invalid "to" phone number');

  // Build a short summary (keep it short; templates have length limits)
  const sessionsTxt = safeArr(sessions).length ? safeArr(sessions).join(', ') : '-';
  const packagesTxt = safeArr(packages).length ? safeArr(packages).join(', ') : '-';
  const summary = `Seçilen seanslar: ${sessionsTxt}\nSeçilen paketler: ${packagesTxt}`;

  const note = safeStr(message);
  const summary2 = note ? `${summary}\n\nNot: ${note.slice(0, 200)}` : summary;

  const payload = {
    messaging_product: 'whatsapp',
    to: waTo,
    type: 'template',
    template: {
      name: templateName,
      language: { code: templateLang }
    }
  };

  // IMPORTANT:
  // - If your template has NO variables, Meta expects 0 params. Set WHATSAPP_TEMPLATE_PARAM_COUNT=0
  // - If your template has variables, set the correct count (commonly 2: summary + total)
  if (paramCount > 0) {
    payload.template.components = [
      {
        type: 'body',
        parameters: []
      }
    ];

    // Parameter #1: summary (sessions/packages + optional note)
    payload.template.components[0].parameters.push({ type: 'text', text: summary2 });

    // Parameter #2: total (optional). If you don't use it, set paramCount=1
    if (paramCount >= 2) {
      // You can later calculate prices on backend; for now we send a placeholder.
      const total = process.env.ZIN_TOTAL_PLACEHOLDER || 'Toplam tutar: (hesaplanacak)';
      payload.template.components[0].parameters.push({ type: 'text', text: total });
    }
  }

  const resp = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, data };
}

async function sendOwnerEmail({ firstName, lastName, email, phone, country, sessions, packages, message }) {
  const apiKey = process.env.RESEND_API_KEY;
  const toOwner = process.env.OWNER_EMAIL;       // e.g. "zins.diary@gmail.com"
  const fromEmail = process.env.RESEND_FROM;     // e.g. "Zin Diary <noreply@zindiary.com>"

  if (!apiKey || !toOwner || !fromEmail) {
    return { ok: false, skipped: true, reason: 'Resend not configured (missing RESEND_API_KEY / OWNER_EMAIL / RESEND_FROM)' };
  }

  const subject = `Yeni talep: ${safeStr(firstName)} ${safeStr(lastName)}`.trim();

  const lines = [
    `Ad: ${safeStr(firstName)}`,
    `Soyad: ${safeStr(lastName)}`,
    `E-posta: ${safeStr(email)}`,
    `Telefon: ${safeStr(phone)}`,
    `Ülke: ${safeStr(country)}`,
    `Seanslar: ${safeArr(sessions).join(', ') || '-'}`,
    `Paketler: ${safeArr(packages).join(', ') || '-'}`,
    '',
    'Mesaj:',
    safeStr(message) || '-'
  ];

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5;">
      <h2>Yeni İletişim Formu Talebi</h2>
      <pre style="background:#f7f7f7;padding:12px;border-radius:8px;white-space:pre-wrap;">${lines.map(s => String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))).join('\n')}</pre>
    </div>
  `.trim();

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [toOwner],
      subject,
      html
    })
  });

  const data = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, data };
}

export default async function handler(req, res) {
  allowCors(req, res);

  if (req.method === 'OPTIONS') return json(res, 204, { ok: true });
  if (req.method === 'GET') {
    return json(res, 200, { ok: true, message: 'lead endpoint is alive. POST JSON to send WhatsApp template.', now: new Date().toISOString() });
  }

  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method Not Allowed' });

  try {
    const body = typeof req.body === 'object' && req.body ? req.body : JSON.parse(req.body || '{}');

    // Expected fields from frontend
    const firstName = safeStr(body.firstName);
    const lastName = safeStr(body.lastName);
    const email = safeStr(body.email);
    const country = safeStr(body.country);
    const dial = safeStr(body.dialCode); // like "+90"
    const phoneLocal = safeStr(body.phoneLocal); // digits
    const phone = `${dial}${phoneLocal}`.trim();
    const to = digitsOnly(`${dial}${phoneLocal}`);
    const sessions = safeArr(body.sessions);
    const packages = safeArr(body.packages);
    const message = safeStr(body.message);

    // Basic validation
    if (!firstName || !lastName || !email || !country || !dial || !phoneLocal) {
      return json(res, 400, { ok: false, error: 'Missing required fields' });
    }
    if (!sessions.length && !packages.length) {
      return json(res, 400, { ok: false, error: 'Select at least one session or package' });
    }

    const wa = await sendWhatsAppTemplate({ to, firstName, lastName, sessions, packages, message });
    const mail = await sendOwnerEmail({ firstName, lastName, email, phone, country, sessions, packages, message });

    const ok = Boolean(wa.ok);
    return json(res, ok ? 200 : 400, {
      ok,
      whatsapp_ok: Boolean(wa.ok),
      whatsapp_status: wa.status,
      whatsapp_data: wa.data,
      email_ok: Boolean(mail.ok),
      email_status: mail.status,
      email_data: mail.data,
      email_skipped: Boolean(mail.skipped),
      email_reason: mail.reason
    });
  } catch (err) {
    return json(res, 500, { ok: false, error: String(err?.message || err) });
  }
}

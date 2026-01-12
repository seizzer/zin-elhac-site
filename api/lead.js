// api/lead.js (ESM) — stable version for Vercel
// Default behavior: send template with NO parameters (fixes "localizable_params" mismatch).
// If Resend is configured, also sends an email to the site owner.

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v19.0';

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) out[k] = obj?.[k];
  return out;
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      return sendJson(res, 200, {
        ok: true,
        message: 'lead endpoint is alive. POST JSON to send WhatsApp template.',
        now: new Date().toISOString(),
      });
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return sendJson(res, 405, { ok: false, error: 'Method not allowed' });
    }

    // Body parsing: Vercel already parses JSON in most cases, but keep this safe.
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = {}; }
    }

    const {
      to,
      firstName,
      lastName,
      email,
      country,
      phoneCountry,
      phoneLocal,
      message,
      sessions,
      packages,
      consentWhatsApp,
      consentStop,
    } = body || {};

    // Minimal validation: we must have a destination number.
    if (!to || String(to).trim().length < 8) {
      return sendJson(res, 400, { ok: false, error: 'Missing/invalid "to" (phone number).' });
    }

    // Env validation
    const needed = ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_TEMPLATE_NAME'];
    const missing = needed.filter((k) => !process.env[k]);
    if (missing.length) {
      return sendJson(res, 500, { ok: false, error: 'Missing env vars', need: missing });
    }

    const token = process.env.WHATSAPP_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const templateName = process.env.WHATSAPP_TEMPLATE_NAME;
    const templateLang = process.env.WHATSAPP_TEMPLATE_LANG || 'tr';

    // IMPORTANT: do NOT send components/params unless your template actually has variables.
    const waPayload = {
      messaging_product: 'whatsapp',
      to: String(to).replace(/\D/g, ''),
      type: 'template',
      template: {
        name: templateName,
        language: { code: templateLang },
      },
    };

    // If you ever add variables to the template, you can set WHATSAPP_TEMPLATE_COMPONENTS_JSON.
    // It must be a valid JSON string for the "components" array.
    if (process.env.WHATSAPP_TEMPLATE_COMPONENTS_JSON) {
      try {
        const comps = JSON.parse(process.env.WHATSAPP_TEMPLATE_COMPONENTS_JSON);
        if (Array.isArray(comps) && comps.length) {
          waPayload.template.components = comps;
        }
      } catch {
        // ignore bad JSON; better to send without components than crash
      }
    }

    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`;

    const waResp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(waPayload),
    });

    let waData;
    try { waData = await waResp.json(); } catch { waData = { raw: await waResp.text() }; }

    const whatsapp_ok = waResp.ok;
    const whatsapp_error = waResp.ok ? null : waData;

    // --- Optional: email via Resend ---
    let email_ok = false;
    let email_error = null;

    const resendKey = process.env.RESEND_API_KEY;
    const resendTo = process.env.RESEND_TO; // e.g. zins.diary@gmail.com
    const resendFrom = process.env.RESEND_FROM; // e.g. no-reply@zindiary.com (must be verified)

    if (resendKey && resendTo && resendFrom) {
      try {
        const subject = `Yeni iletişim formu: ${firstName || ''} ${lastName || ''}`.trim() || 'Yeni iletişim formu';
        const html = `
          <div style="font-family: Arial, sans-serif; line-height: 1.5">
            <h2>Yeni İletişim Formu</h2>
            <p><b>Ad:</b> ${escapeHtml(firstName)} ${escapeHtml(lastName)}</p>
            <p><b>Email:</b> ${escapeHtml(email)}</p>
            <p><b>Ülke:</b> ${escapeHtml(country)}</p>
            <p><b>Telefon:</b> ${escapeHtml(phoneCountry)} ${escapeHtml(phoneLocal)} (to=${escapeHtml(to)})</p>
            <p><b>Seanslar:</b> ${escapeHtml((Array.isArray(sessions) ? sessions.join(', ') : (sessions || '')))}</p>
            <p><b>Paketler:</b> ${escapeHtml((Array.isArray(packages) ? packages.join(', ') : (packages || '')))}</p>
            <p><b>WhatsApp onay:</b> ${consentWhatsApp ? 'Evet' : 'Hayır'} / <b>STOP bilgisi:</b> ${consentStop ? 'Evet' : 'Hayır'}</p>
            <hr/>
            <p><b>Mesaj:</b></p>
            <pre style="white-space: pre-wrap; background:#f6f6f6; padding:12px; border-radius:8px">${escapeHtml(message || '')}</pre>
          </div>
        `;

        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: resendFrom,
            to: resendTo,
            subject,
            html,
          }),
        });

        const rData = await r.json().catch(() => null);
        email_ok = r.ok;
        if (!r.ok) email_error = rData || { status: r.status };
      } catch (e) {
        email_ok = false;
        email_error = { message: String(e?.message || e) };
      }
    } else {
      email_error = {
        message: 'Resend env not fully set (RESEND_API_KEY, RESEND_TO, RESEND_FROM).',
        have: pick(process.env, ['RESEND_API_KEY', 'RESEND_TO', 'RESEND_FROM']),
      };
    }

    // IMPORTANT: Don't block success on email while domain is pending.
    const overall_ok = whatsapp_ok;

    return sendJson(res, whatsapp_ok ? 200 : 400, {
      ok: overall_ok,
      whatsapp_ok,
      email_ok,
      data: whatsapp_ok ? waData : null,
      whatsapp_error,
      email_error,
    });
  } catch (err) {
    return sendJson(res, 500, { ok: false, error: String(err?.message || err) });
  }
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

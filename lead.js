// Vercel Serverless Function: /api/lead
// Receives form data and sends a WhatsApp template message via Meta WhatsApp Cloud API.

function json(res, status, body){
  res.statusCode = status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function onlyDigits(s){ return (s||'').replace(/\D/g,''); }

function toE164(dialCode, local){
  const dc = (dialCode||'').trim();
  const l = onlyDigits(local);
  if(!dc.startsWith('+')) return null;
  if(!l) return null;
  return dc + l;
}

// Summarize selections for template variable
function summarizeSelections(sessions, packages){
  const parts = [];
  (sessions||[]).forEach(s => parts.push(s));
  (packages||[]).forEach(p => parts.push(p));
  return parts.join(', ');
}

export default async function handler(req, res){
  if(req.method !== 'POST'){
    return json(res, 405, {error: 'Method not allowed'});
  }

  let body = req.body;
  // Vercel may not parse JSON automatically in some cases
  if(typeof body === 'string'){
    try { body = JSON.parse(body); } catch(e){ body = null; }
  }
  if(!body) return json(res, 400, {error:'Geçersiz JSON'});

  const {
    firstName, lastName, email, country,
    dialCode, phoneLocal, message,
    optin, sessions, packages
  } = body;

  // Validate required fields (message is optional)
  const errs = [];
  if(!firstName) errs.push('Ad gerekli');
  if(!lastName) errs.push('Soyad gerekli');
  if(!email) errs.push('Email gerekli');
  if(!country) errs.push('Ülke gerekli');
  if(!dialCode) errs.push('Ülke kodu gerekli');
  if(!phoneLocal) errs.push('Telefon gerekli');
  if(!optin) errs.push('WhatsApp opt-in gerekli');
  const countSel = (sessions?.length||0) + (packages?.length||0);
  if(countSel < 1) errs.push('En az bir seans veya paket seçilmeli');

  if(errs.length) return json(res, 400, {error: errs.join(' | ')});

  const to = toE164(dialCode, phoneLocal);
  if(!to) return json(res, 400, {error:'Telefon formatı hatalı'});

  // ENV
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const templateName = process.env.WHATSAPP_TEMPLATE_NAME;
  const langCode = process.env.WHATSAPP_TEMPLATE_LANG || 'tr';

  if(!token || !phoneNumberId || !templateName){
    return json(res, 500, {error:'Sunucu ayarları eksik (ENV)'}); 
  }

  // IMPORTANT:
  // - Business-initiated messages require an APPROVED template.
  // - Keep this message short; ask user to reply (e.g., "DEVAM") to open the 24h customer service window.
  const selectionSummary = summarizeSelections(sessions, packages);

  // Template variables: adapt to your template structure.
  // Here we assume Body has 2 variables: {{1}}=FirstName, {{2}}=Selections
  // If your template has different variables, update this.
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: langCode },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: String(firstName) },
            { type: "text", text: selectionSummary || "-" }
          ]
        }
      ]
    }
  };

  const url = `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`;

  try{
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await r.json().catch(()=>({}));

    if(!r.ok){
      // Forward Meta error (trim)
      const metaErr = (data && data.error && data.error.message) ? data.error.message : 'Meta API error';
      return json(res, 502, {error: metaErr, details: data});
    }

    // Here you could also log the lead to a database / Google Sheet
    return json(res, 200, {ok:true, to, meta:data});
  }catch(e){
    return json(res, 500, {error: 'Sunucu hatası: ' + (e?.message || e)});
  }
}

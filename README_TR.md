# Zin Elhac Site + WhatsApp Cloud API (Vercel) — Başlangıç Paketi

Bu proje iki parçadan oluşur:
1) `index.html` (senin tek sayfa siten)
2) `/api/lead` (form gönderilince WhatsApp template mesajı atan backend)

## 1) Kurulum (en basit yol: Vercel)
1. GitHub’da yeni repo aç: `zin-elhac-site`
2. Bu klasördeki dosyaları repo’ya yükle (index.html, api/lead.js, vs.)
3. Vercel’e gir → **New Project** → GitHub repo’nu seç → Deploy

## 2) Vercel’de ENV gir
Vercel → Project → Settings → Environment Variables:
- `WHATSAPP_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_TEMPLATE_NAME`
- `WHATSAPP_TEMPLATE_LANG` (tr veya ar)

Sonra **Redeploy**.

## 3) Meta tarafı minimumlar
- Template’in **Approved** olması gerekir (business-initiated).
- Test modunda, mesaj göndereceğin numarayı “recipient” olarak eklemen gerekir.
- En sağlam akış: Template sonunda kullanıcıdan “DEVAM” yazmasını iste; kullanıcı cevaplayınca 24 saat pencerede free-text gönderebilirsin.

## 4) Ucuz yürütme notu
- 1 adet template mesaj = ücretli olabilir (ülkeye göre değişir).
- Free-text’i kullanıcı cevapladıktan sonra (24 saat penceresi) atarsan hem policy uyumlu hem pratik olur.

## 5) Lokal çalıştırma (opsiyon)
Bilgisayarında:
- `npm i -g vercel`
- proje klasöründe: `vercel dev`

> Not: Bu paket “lead” bilgilerini bir yere kaydetmiyor. İstersen sonraki adımda Google Sheet / email / DB ekleriz.

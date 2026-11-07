/** بيانات تواصل Twist اللي تويلا بتقولها للعملاء وأصحاب المحلات. نفس القيم اللي في web/src/config/contact.js (ولو اتغيّرت هناك غيّرها هنا أو من متغيرات البيئة). */
export const DEFAULT_CONTACT = {
  phone: '01206928670',
  whatsapp: '201206928670',
  facebook: 'https://www.facebook.com/profile.php?id=61595798750009',
  instagram: 'https://www.instagram.com/twiststore2026/',
  tiktok: 'https://www.tiktok.com/@twiststore0',
  email: 'storetwist007@gmail.com',
  address: 'بنها، القليوبية، مصر',
  website: 'twistegy.com',
};

export function contactFromEnv(env = process.env) {
  const pick = (k, d) => (env[k] && String(env[k]).trim()) || d;
  const wa = pick('PLATFORM_WA', DEFAULT_CONTACT.whatsapp).replace(/\D/g, '');
  return {
    phone: pick('SITE_PHONE', DEFAULT_CONTACT.phone),
    whatsapp: wa || DEFAULT_CONTACT.whatsapp,
    facebook: pick('SITE_FACEBOOK', DEFAULT_CONTACT.facebook),
    instagram: pick('SITE_INSTAGRAM', DEFAULT_CONTACT.instagram),
    tiktok: pick('SITE_TIKTOK', DEFAULT_CONTACT.tiktok),
    email: pick('SITE_EMAIL', DEFAULT_CONTACT.email),
    address: pick('SITE_ADDRESS', DEFAULT_CONTACT.address),
    website: pick('SITE_DOMAIN', DEFAULT_CONTACT.website),
  };
}

/** بيحل {phone} {wa} {facebook}... جوه نص الرد. */
export function fillContact(text, contact) {
  const c = { ...DEFAULT_CONTACT, ...(contact || {}) };
  const map = { phone: c.phone, wa: `https://wa.me/${String(c.whatsapp).replace(/\D/g, '')}`, whatsapp_number: `+${String(c.whatsapp).replace(/\D/g, '')}`, facebook: c.facebook, instagram: c.instagram, tiktok: c.tiktok, email: c.email, address: c.address, site: c.website };
  return String(text).replace(/\{(phone|wa|whatsapp_number|facebook|instagram|tiktok|email|address|site)\}/g, (_, k) => map[k]);
}

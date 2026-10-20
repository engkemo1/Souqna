import fs from 'node:fs';
import sharp from 'sharp';

const logoBuffer = await sharp('web/public/brand/twist-logo.png').png().toBuffer();
const logo = `data:image/png;base64,${logoBuffer.toString('base64')}`;

const esc = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;');

const text = (x, y, value, {
  size = 40,
  color = '#10254a',
  weight = 600,
  anchor = 'end',
} = {}) => `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="Arial, Tahoma, sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}">${esc(value)}</text>`;

const check = (x, y) => `
  <circle cx="${x}" cy="${y}" r="31" fill="#fff0e6"/>
  <path d="M${x - 13} ${y}l9 10 18-23" fill="none" stroke="#f8620a" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`;

const section = (x, y, width, title, lines, tone = 'white') => {
  const dark = tone === 'navy';
  const background = dark ? '#10254a' : '#fff';
  const heading = dark ? '#fff' : '#10254a';
  const body = dark ? '#d8e0eb' : '#60708a';
  const rows = lines.map((line, index) => {
    const rowY = y + 182 + index * 94;
    return `${check(x + width - 66, rowY - 12)}${text(x + width - 118, rowY, line, { size: 33, color: body, weight: 600 })}`;
  }).join('');
  return `
    <rect x="${x}" y="${y}" width="${width}" height="${156 + lines.length * 94}" rx="42" fill="${background}"/>
    ${text(x + width - 56, y + 88, title, { size: 45, color: heading, weight: 900 })}
    <path d="M${x + 52} ${y + 122}H${x + width - 52}" stroke="${dark ? '#3a5279' : '#f4d4bd'}" stroke-width="4"/>
    ${rows}`;
};

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="3000" height="4242" viewBox="0 0 3000 4242">
  <defs>
    <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1">
      <stop stop-color="#fffaf5"/>
      <stop offset="1" stop-color="#f7f1ea"/>
    </linearGradient>
    <linearGradient id="navy" x1="0" y1="0" x2="1" y2="1">
      <stop stop-color="#142d59"/>
      <stop offset="1" stop-color="#061833"/>
    </linearGradient>
    <linearGradient id="orange" x1="0" y1="0" x2="1" y2="0">
      <stop stop-color="#ff812f"/>
      <stop offset="1" stop-color="#f3530b"/>
    </linearGradient>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="170%">
      <feDropShadow dx="0" dy="22" stdDeviation="28" flood-color="#071a3a" flood-opacity=".17"/>
    </filter>
  </defs>

  <rect width="3000" height="4242" fill="url(#paper)"/>
  <circle cx="2770" cy="540" r="600" fill="#f8620a" opacity=".05"/>
  <circle cx="90" cy="3360" r="460" fill="#f8620a" opacity=".045"/>

  <image x="2160" y="92" width="680" height="228" preserveAspectRatio="xMidYMid meet" href="${logo}"/>
  <rect x="150" y="144" width="820" height="110" rx="55" fill="#fff" stroke="#f8620a" stroke-width="4"/>
  ${text(560, 216, 'لأصحاب المحلات في بنها', { size: 44, color: '#f8620a', weight: 800, anchor: 'middle' })}

  ${text(2830, 470, 'زهقت من الواتساب وفيسبوك؟', { size: 94, color: '#10254a', weight: 900 })}
  ${text(2830, 635, 'عايز موقع لمحلّك…', { size: 114, color: '#f8620a', weight: 900 })}
  ${text(2830, 785, 'بس مش عايز وجع دماغ وتكلفة زيادة؟', { size: 82, color: '#10254a', weight: 900 })}
  ${text(2830, 892, 'مع Twist، محلك يبقى أونلاين باسمك وبإدارة سهلة من موبايلك.', { size: 47, color: '#5e6e87', weight: 600 })}

  <g filter="url(#shadow)">
    <rect x="145" y="1015" width="2710" height="555" rx="60" fill="url(#navy)"/>
  </g>
  ${text(2785, 1145, 'لو عملت موقع لوحدك… هتدخل في دوامة:', { size: 54, color: '#ff9b61', weight: 900 })}
  <g font-family="Arial, Tahoma, sans-serif">
    <circle cx="2640" cy="1260" r="34" fill="#f8620a"/><text x="2640" y="1274" text-anchor="middle" font-size="32" font-weight="900" fill="#fff">١</text>
    ${text(2570, 1275, 'تدور على مطوّر وتدفع تكلفة تصميم كبيرة.', { size: 40, color: '#fff', weight: 700 })}
    <circle cx="2640" cy="1370" r="34" fill="#f8620a"/><text x="2640" y="1384" text-anchor="middle" font-size="32" font-weight="900" fill="#fff">٢</text>
    ${text(2570, 1385, 'أي تعديل في المنتجات أو الشكل = وقت وفلوس تاني.', { size: 40, color: '#fff', weight: 700 })}
    <circle cx="2640" cy="1480" r="34" fill="#f8620a"/><text x="2640" y="1494" text-anchor="middle" font-size="32" font-weight="900" fill="#fff">٣</text>
    ${text(2570, 1495, 'وبعدها لسه محتاج تسوّق للموقع عشان حد يوصله.', { size: 40, color: '#fff', weight: 700 })}
  </g>

  ${text(1500, 1740, 'طب إيه رأيك نعمل لك ده كله؟', { size: 82, color: '#10254a', weight: 900, anchor: 'middle' })}
  ${text(1500, 1824, 'من غير ما تفضّل رايح جاي على مطوّر، ومن غير ما تضيع وقتك في متابعة كل حاجة لوحدك.', { size: 40, color: '#64738b', weight: 600, anchor: 'middle' })}

  <g filter="url(#shadow)">
    ${section(145, 1935, 1315, 'Twist يعمل لك متجر كامل باسمك', [
      'اعرض منتجاتك وصورها وأسعارها ومقاساتها.',
      'عنوان محلك وموقعه على الخريطة عشان العميل يوصلك.',
      'عروض وكوبونات ودفع عند الاستلام.',
      'QR خاص بمتجرك: العميل يمسحه ويفتح صفحتك فورًا.',
    ])}
    ${section(1540, 1935, 1315, 'وتتحكم في كل ده بنفسك', [
      'لوحة أدمن على الموبايل والكمبيوتر.',
      'تضيف وتعدّل منتجاتك وأسعارك بضغطة زر.',
      'طلبات جديدة وتنبيهات على اللوحة أو واتساب لو حابب.',
      'مخزون ومبيعاتك قدامك، وتعرف كل طلب وصل لفين.',
    ])}
  </g>

  <g filter="url(#shadow)">
    ${section(145, 2550, 1315, 'ومش هتكون مستخبي', [
      'متجرك موجود جوه سوق Twist في بنها.',
      'العميل يقدر يلاقي منتجاتك، أسعارك، ومكانك بسهولة.',
      'لو مش لاقي المنتج، يبعث طلبه ويوصلك التنبيه.',
    ], 'navy')}
    ${section(1540, 2550, 1315, 'التوصيل والتصوير متوفرين', [
      'استخدم دليفري محلك أو خلّي Twist يستلم ويوصل للعميل.',
      'دفع عند الاستلام وتحويل الطلب للتوصيل عند الحاجة.',
      'محتاج صور أقوى؟ اطلب تصوير احترافي لمنتجاتك كخدمة اختيارية.',
    ])}
  </g>

  <g filter="url(#shadow)">
    <rect x="145" y="3070" width="2710" height="585" rx="70" fill="url(#orange)"/>
  </g>
  ${text(2700, 3212, 'عرض البداية للمحلات في بنها', { size: 51, color: '#fff1e8', weight: 800 })}
  ${text(2700, 3350, 'سجّل قبل ١ نوفمبر ٢٠٢٦', { size: 76, color: '#fff', weight: 900 })}
  ${text(2700, 3460, 'وخد أول شهر مجانًا', { size: 76, color: '#fff', weight: 900 })}
  ${text(2700, 3550, 'جرّب بنفسك، وبعدها قرر. اشتراك شهري بسيط ومن غير عمولة على البيع.', { size: 37, color: '#fff8f3', weight: 600 })}
  <rect x="280" y="3175" width="750" height="285" rx="46" fill="#fff"/>
  ${text(655, 3285, 'مستني إيه؟', { size: 54, color: '#10254a', weight: 900, anchor: 'middle' })}
  ${text(655, 3372, 'كلّمنا وخد التفاصيل', { size: 37, color: '#64738b', weight: 700, anchor: 'middle' })}
  <text x="655" y="3470" text-anchor="middle" font-family="Arial, Tahoma, sans-serif" font-size="60" font-weight="900" fill="#f8620a">01206928670</text>

  ${text(1500, 3845, 'موقعك • منتجاتك • طلباتك • توصيلك… كل ده في مكان واحد.', { size: 47, color: '#10254a', weight: 900, anchor: 'middle' })}
  ${text(1500, 3930, 'Twist Store — خلّي عميلك يوصلك ويطلب منك بسهولة.', { size: 42, color: '#64738b', weight: 600, anchor: 'middle' })}
  ${text(1500, 4050, 'واتساب: 01206928670', { size: 54, color: '#f8620a', weight: 900, anchor: 'middle' })}
</svg>`;

fs.writeFileSync('marketing/twist-store-flyer-back.svg', svg);
await sharp(Buffer.from(svg), { density: 72 })
  .withMetadata({ density: 300 })
  .png()
  .toFile('marketing/twist-store-flyer-back.png');

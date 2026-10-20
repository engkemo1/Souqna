import fs from 'node:fs';
import sharp from 'sharp';
import qrgen from '../web/src/lib/qr/qrcode-generator.js';

const asset = async (path, format = 'jpeg') => {
  const out = format === 'png'
    ? await sharp(path).png().toBuffer()
    : await sharp(path).jpeg({ quality: 90 }).toBuffer();
  return `data:image/${format};base64,${out.toString('base64')}`;
};

const [logo, men, women, shoes, bags] = await Promise.all([
  asset('web/public/brand/twist-logo.png', 'png'),
  asset('web/public/departments/men.jpg'),
  asset('web/public/departments/women.jpg'),
  asset('web/public/departments/shoes.jpg'),
  asset('web/public/departments/bags.jpg'),
]);

const qr = qrgen(0, 'H');
qr.addData('https://wa.me/201206928670?text=أهلاً، عايز أعرف تفاصيل Twist Store والعرض المجاني', 'Byte');
qr.make();
const margin = 4;
let modules = '';
for (let y = 0; y < qr.getModuleCount(); y += 1) {
  for (let x = 0; x < qr.getModuleCount(); x += 1) {
    if (qr.isDark(y, x)) modules += `M${x + margin} ${y + margin}h1v1h-1z`;
  }
}
const qrSource = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${qr.getModuleCount() + margin * 2} ${qr.getModuleCount() + margin * 2}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="white"/><path d="${modules}"/></svg>`;
const qrImage = `data:image/png;base64,${(await sharp(Buffer.from(qrSource)).resize(440, 440).png().toBuffer()).toString('base64')}`;

const safe = (v) => String(v).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const text = (x, y, value, { size = 40, color = '#10284f', weight = 600, anchor = 'end' } = {}) =>
  `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="Arial, Tahoma, sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}">${safe(value)}</text>`;
const pill = (x, y, w, value) => `<rect x="${x}" y="${y}" width="${w}" height="82" rx="41" fill="#fff1e6"/>${text(x + w / 2, y + 54, value, { size: 28, color: '#f25a12', weight: 800, anchor: 'middle' })}`;
const check = (x, y) => `<circle cx="${x}" cy="${y}" r="31" fill="#fff0e6"/>${text(x, y + 11, '✓', { size: 36, color: '#fb6718', weight: 900, anchor: 'middle' })}`;

const card = (x, number, title, lines) => `
  <g filter="url(#shadow)">
    <rect x="${x}" y="2654" width="842" height="630" rx="45" fill="#fff"/>
    <circle cx="${x + 755}" cy="2743" r="40" fill="#ff6617"/>
    ${text(x + 755, 2757, number, { size: 37, color: '#fff', weight: 900, anchor: 'middle' })}
    ${text(x + 676, 2756, title, { size: 38, color: '#10284f', weight: 900 })}
    <path d="M${x + 52} 2816H${x + 790}" stroke="#f5d8c5" stroke-width="4"/>
    ${lines.map((line, index) => {
      const cy = 2900 + index * 118;
      return `${check(x + 754, cy - 8)}${text(x + 692, cy, line[0], { size: 28, color: '#10284f', weight: 800 })}${text(x + 692, cy + 40, line[1], { size: 22, color: '#718099', weight: 500 })}`;
    }).join('')}
  </g>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="3000" height="4242" viewBox="0 0 3000 4242">
  <defs>
    <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fffdf9"/><stop offset="1" stop-color="#f8f0e9"/></linearGradient>
    <linearGradient id="navy" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#183a70"/><stop offset="1" stop-color="#071b3c"/></linearGradient>
    <linearGradient id="orange" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#ff963e"/><stop offset="1" stop-color="#f6530d"/></linearGradient>
    <filter id="shadow" x="-30%" y="-30%" width="170%" height="180%"><feDropShadow dx="0" dy="20" stdDeviation="25" flood-color="#071a3a" flood-opacity=".17"/></filter>
    <clipPath id="men"><rect x="1770" y="1424" width="290" height="372" rx="22"/></clipPath>
    <clipPath id="women"><rect x="2078" y="1424" width="290" height="372" rx="22"/></clipPath>
    <clipPath id="shoes"><rect x="1770" y="1812" width="290" height="372" rx="22"/></clipPath>
    <clipPath id="bags"><rect x="2078" y="1812" width="290" height="372" rx="22"/></clipPath>
  </defs>
  <rect width="3000" height="4242" fill="url(#paper)"/>
  <circle cx="2820" cy="-100" r="660" fill="#fff0e4"/>
  <circle cx="-220" cy="3440" r="570" fill="#fff1e6"/>

  <image x="2190" y="112" width="560" height="210" href="${logo}" preserveAspectRatio="xMidYMid meet"/>
  <rect x="140" y="132" width="700" height="92" rx="46" fill="none" stroke="#ff6617" stroke-width="5"/>
  ${text(790, 193, 'لأصحاب محلات الملابس في بنها', { size: 34, color: '#f66015', weight: 800 })}

  ${text(2710, 505, 'طلباتك بتضيع وسط', { size: 79, color: '#10284f', weight: 900 })}
  ${text(2710, 620, 'الواتساب والفيسبوك؟', { size: 95, color: '#f85e12', weight: 900 })}
  ${text(2710, 715, 'العميل يسأل عن السعر والمقاس والمكان… وإنت ترد على كل واحد لوحده.', { size: 34, color: '#657690', weight: 500 })}
  ${text(2710, 770, 'وفي الآخر منشوراتك بتختفي وسط الزحمة وطلبات بتفوتك.', { size: 34, color: '#657690', weight: 500 })}

  <g filter="url(#shadow)">
    <rect x="180" y="915" width="1120" height="1230" rx="55" fill="#fff"/>
    ${pill(790, 1008, 390, 'رسايل متكررة كل يوم')}
    <path d="M560 1160c-160 80-195 178-35 248" fill="none" stroke="#ffbd92" stroke-width="7" stroke-dasharray="16 14"/>
    <rect x="290" y="1190" width="670" height="126" rx="28" fill="#f5f7fa"/>
    ${text(900, 1270, 'السعر كام؟', { size: 37, color: '#10284f', weight: 800 })}
    <rect x="420" y="1370" width="690" height="126" rx="28" fill="#fff1e7"/>
    ${text(1050, 1450, 'متوفر مقاس كام؟', { size: 37, color: '#10284f', weight: 800 })}
    <rect x="250" y="1550" width="650" height="126" rx="28" fill="#f5f7fa"/>
    ${text(840, 1630, 'المحل فين؟ والتوصيل إزاي؟', { size: 33, color: '#10284f', weight: 800 })}
    <rect x="365" y="1740" width="740" height="185" rx="32" fill="#10284f"/>
    ${text(1035, 1813, 'المشكلة مش في البيع…', { size: 34, color: '#ff8c42', weight: 800 })}
    ${text(1035, 1873, 'المشكلة إن العميل بيتوه قبل ما يطلب.', { size: 34, color: '#fff', weight: 800 })}
    ${text(740, 2040, 'محادثات كثيرة  ·  طلبات متلخبطة  ·  وقت ضايع', { size: 26, color: '#8796aa', weight: 600, anchor: 'middle' })}
  </g>

  <path d="M1375 1510H1535" stroke="#ff6617" stroke-width="18" stroke-linecap="round"/>
  <path d="M1500 1460l84 50-84 50" fill="none" stroke="#ff6617" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>

  <g filter="url(#shadow)">
    <rect x="1645" y="915" width="1175" height="1230" rx="55" fill="#fff"/>
    ${text(2735, 1040, 'الحل: متجر محلك على', { size: 42, color: '#10284f', weight: 900 })}
    ${text(2115, 1040, 'Twist', { size: 42, color: '#f85e12', weight: 900 })}
    <rect x="1715" y="1090" width="1035" height="92" rx="20" fill="#f8f9fb"/>
    ${text(2660, 1150, 'ابحث عن أي منتج أو مقاس أو محل…', { size: 25, color: '#91a0b2', weight: 500 })}
    <rect x="1715" y="1212" width="1035" height="158" rx="24" fill="url(#navy)"/>
    ${text(2685, 1278, 'محلك، منتجاتك، أسعارك ومكانك', { size: 34, color: '#fff', weight: 800 })}
    ${text(2685, 1324, 'كلهم واضحين للعميل في صفحة واحدة.', { size: 24, color: '#c8d4e7', weight: 500 })}
    <image x="1770" y="1424" width="290" height="372" href="${men}" preserveAspectRatio="xMidYMid slice" clip-path="url(#men)"/>
    <image x="2078" y="1424" width="290" height="372" href="${women}" preserveAspectRatio="xMidYMid slice" clip-path="url(#women)"/>
    <image x="1770" y="1812" width="290" height="372" href="${shoes}" preserveAspectRatio="xMidYMid slice" clip-path="url(#shoes)"/>
    <image x="2078" y="1812" width="290" height="372" href="${bags}" preserveAspectRatio="xMidYMid slice" clip-path="url(#bags)"/>
    ${['رجالي', 'حريمي', 'أحذية', 'شنط'].map((name, index) => {
      const x = index % 2 ? 2078 : 1770; const y = index > 1 ? 1812 : 1424;
      return `<rect x="${x}" y="${y + 303}" width="290" height="69" rx="0" fill="#071b3c" opacity=".72"/>${text(x + 262, y + 349, name, { size: 25, color: '#fff', weight: 800 })}`;
    }).join('')}
    <rect x="2393" y="1424" width="270" height="760" rx="26" fill="#fff4eb"/>
    ${text(2585, 1494, 'العميل', { size: 29, color: '#10284f', weight: 900 })}
    ${text(2585, 1550, 'يشوف', { size: 27, color: '#687991', weight: 600 })}
    ${text(2585, 1612, '• السعر', { size: 25, color: '#10284f', weight: 700 })}
    ${text(2585, 1662, '• المقاس', { size: 25, color: '#10284f', weight: 700 })}
    ${text(2585, 1712, '• المكان', { size: 25, color: '#10284f', weight: 700 })}
    ${text(2585, 1762, '• الطلب', { size: 25, color: '#10284f', weight: 700 })}
    <rect x="2423" y="1850" width="200" height="82" rx="21" fill="#ff6617"/>
    ${text(2523, 1905, 'يطلب فورًا', { size: 25, color: '#fff', weight: 800, anchor: 'middle' })}
    ${text(2230, 2040, 'متجر واحد واضح… بدل مئات الرسايل.', { size: 30, color: '#10284f', weight: 900, anchor: 'middle' })}
  </g>

  ${text(1500, 2364, 'بدل ما ترد على نفس السؤال مية مرة… خلّي متجرك يرد عنك.', { size: 51, color: '#10284f', weight: 900, anchor: 'middle' })}
  ${text(1500, 2430, 'Twist يجمع عرض المنتجات، استقبال الطلبات، وإدارة المحل في مكان واحد.', { size: 30, color: '#657690', weight: 500, anchor: 'middle' })}

  ${card(130, '١', 'العميل يطلب لوحده', [['منتجاتك واضحة', 'صورة، سعر، مقاس، ومكان المحل'], ['طلب منظم', 'يوصلك بكل تفاصيله بدل شات طويل'], ['QR لمتجرك', 'العميل يمسحه ويفتح صفحتك فورًا']])}
  ${card(1080, '٢', 'تدير محلك بسهولة', [['من موبايلك', 'ضيف وعدّل منتجاتك وأسعارك'], ['تنبيه بكل طلب', 'تابع الطلب أول بأول من لوحة التحكم'], ['مبيعات ومخزون', 'تعرف شغلك ماشي إزاي بوضوح']])}
  ${card(2030, '٣', 'تظهر في سوق Twist', [['مكانك ظاهر', 'داخل سوق محلات الملابس في بنها'], ['توصيل اختياري', 'استلم ووصل مع دفع عند الاستلام'], ['تصوير احترافي', 'خدمة اختيارية لعرض منتجاتك أفضل']])}

  <g filter="url(#shadow)">
    <rect x="130" y="3455" width="2740" height="500" rx="55" fill="url(#navy)"/>
    <rect x="178" y="3503" width="415" height="404" rx="32" fill="#fff"/>
    <image x="206" y="3531" width="300" height="300" href="${qrImage}"/>
    ${text(385, 3870, 'امسح وكلمنا', { size: 24, color: '#657690', weight: 700, anchor: 'middle' })}
    ${text(2700, 3574, 'عرض البداية لأصحاب المحلات في بنها', { size: 29, color: '#ff9e5a', weight: 800 })}
    ${text(2700, 3675, 'سجّل قبل ١ نوفمبر ٢٠٢٦', { size: 58, color: '#fff', weight: 900 })}
    ${text(2700, 3750, 'وخد أول شهر مجانًا', { size: 47, color: '#fff', weight: 900 })}
    ${text(2700, 3865, '01206928670', { size: 60, color: '#ff7a2f', weight: 900 })}
    ${text(1660, 3865, 'واتساب · اشتراك بسيط · من غير عمولة على البيع', { size: 26, color: '#d4deeb', weight: 600 })}
  </g>
  ${text(1500, 4090, 'Twist Store  ·  خلي منتجاتك قدام العميل، وخلي البيع أوضح وأسهل.', { size: 28, color: '#657690', weight: 700, anchor: 'middle' })}
</svg>`;

fs.writeFileSync('marketing/twist-store-onepage-ad.svg', svg, 'utf8');
await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile('marketing/twist-store-onepage-ad.png');

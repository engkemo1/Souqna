import fs from 'node:fs';
import sharp from 'sharp';
import qrgen from '../web/src/lib/qr/qrcode-generator.js';

const toDataUri = async (path, format = 'jpeg') => {
  const pipeline = sharp(path);
  const bytes = format === 'png'
    ? await pipeline.png().toBuffer()
    : await pipeline.jpeg({ quality: 88 }).toBuffer();
  return `data:image/${format};base64,${bytes.toString('base64')}`;
};

const logo = await toDataUri('web/public/brand/twist-logo.png', 'png');
const departments = await Promise.all([
  ['حريمي', 'web/public/departments/women.jpg'],
  ['رجالي', 'web/public/departments/men.jpg'],
  ['كوتشيات وأحذية', 'web/public/departments/shoes.jpg'],
  ['أطفال', 'web/public/departments/kids.jpg'],
  ['شنط', 'web/public/departments/bags.jpg'],
  ['عبايات', 'web/public/departments/abaya.jpg'],
].map(async ([name, path]) => ({ name, src: await toDataUri(path) })));

const qr = qrgen(0, 'H');
qr.addData('https://wa.me/201206928670?text=أهلاً، عايز أعرف تفاصيل Twist Store والعرض المجاني', 'Byte');
qr.make();
const moduleCount = qr.getModuleCount();
const margin = 4;
let qrPath = '';
for (let row = 0; row < moduleCount; row += 1) {
  for (let column = 0; column < moduleCount; column += 1) {
    if (qr.isDark(row, column)) qrPath += `M${column + margin} ${row + margin}h1v1h-1z`;
  }
}
const qrSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${moduleCount + margin * 2} ${moduleCount + margin * 2}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${qrPath}"/></svg>`;
const qrImage = `data:image/png;base64,${(await sharp(Buffer.from(qrSvg)).resize(500, 500).png().toBuffer()).toString('base64')}`;

const esc = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const text = (x, y, value, {
  size = 38,
  color = '#10254a',
  weight = 600,
  anchor = 'end',
} = {}) => `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="Arial, Tahoma, sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}">${esc(value)}</text>`;

const icon = (x, y, symbol, color = '#f8620a') => `
  <circle cx="${x}" cy="${y}" r="36" fill="#fff0e6"/>
  ${text(x, y + 12, symbol, { size: 38, color, weight: 900, anchor: 'middle' })}`;

const departmentTiles = departments.map(({ name, src }, index) => {
  const x = 172 + index * 210;
  return `
    <rect x="${x}" y="1562" width="184" height="248" rx="26" fill="#e5e9ef"/>
    <image x="${x}" y="1562" width="184" height="248" preserveAspectRatio="xMidYMid slice" href="${src}"/>
    <rect x="${x}" y="1723" width="184" height="87" rx="0" fill="#061833" opacity=".61"/>
    ${text(x + 164, 1772, name, { size: name.length > 10 ? 20 : 25, color: '#fff', weight: 800 })}`;
}).join('');

const featureCard = (x, number, title, rows) => {
  const columnX = x + 62;
  const numberX = x + 540;
  return `
    <rect x="${x}" y="2470" width="620" height="770" rx="47" fill="#fff"/>
    <circle cx="${numberX}" cy="2575" r="44" fill="#f8620a"/>
    ${text(numberX, 2590, number, { size: 38, color: '#fff', weight: 900, anchor: 'middle' })}
    ${text(numberX - 70, 2590, title, { size: 43, color: '#10254a', weight: 900 })}
    <path d="M${columnX} 2642H${x + 560}" stroke="#f6d8c4" stroke-width="4"/>
    ${rows.map((row, index) => {
      const y = 2740 + index * 137;
      return `${icon(x + 510, y - 11, row.icon)}${text(x + 450, y, row.title, { size: 34, color: '#10254a', weight: 800 })}${text(x + 450, y + 45, row.body, { size: 26, color: '#687890', weight: 500 })}${index < rows.length - 1 ? `<path d="M${columnX} ${y + 70}H${x + 560}" stroke="#edf0f4" stroke-width="3"/>` : ''}`;
    }).join('')}`;
};

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="3000" height="4242" viewBox="0 0 3000 4242">
  <defs>
    <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fffaf5"/><stop offset="1" stop-color="#f7f1ea"/></linearGradient>
    <linearGradient id="navy" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#16335f"/><stop offset="1" stop-color="#061833"/></linearGradient>
    <linearGradient id="orange" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#ff7c28"/><stop offset="1" stop-color="#f3540a"/></linearGradient>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="22" stdDeviation="28" flood-color="#071a3a" flood-opacity=".19"/></filter>
    <clipPath id="store-clip"><rect x="142" y="1284" width="1376" height="605" rx="0"/></clipPath>
  </defs>
  <rect width="3000" height="4242" fill="url(#paper)"/>
  <circle cx="2745" cy="575" r="570" fill="#f8620a" opacity=".055"/>
  <circle cx="115" cy="3020" r="470" fill="#f8620a" opacity=".045"/>

  <image x="2170" y="82" width="670" height="228" preserveAspectRatio="xMidYMid meet" href="${logo}"/>
  <rect x="150" y="145" width="800" height="110" rx="55" fill="#fff" stroke="#f8620a" stroke-width="4"/>
  ${text(550, 216, 'لأصحاب المحلات في بنها', { size: 44, color: '#f8620a', weight: 800, anchor: 'middle' })}

  ${text(2825, 470, 'زهقت من الواتساب والفيسبوك؟', { size: 84, color: '#10254a', weight: 900 })}
  ${text(2825, 626, 'خلّي محلك أونلاين…', { size: 122, color: '#10254a', weight: 900 })}
  ${text(2825, 777, 'وإنت ماسك كل حاجة في إيدك', { size: 102, color: '#f8620a', weight: 900 })}
  ${text(2825, 884, 'متجر باسمك، سوق بنها، ولوحة تحكم من موبايلك.', { size: 48, color: '#5e6e87', weight: 600 })}
  ${text(2825, 954, 'من غير مطوّر لكل تعديل… ومن غير عمولة على البيع.', { size: 48, color: '#5e6e87', weight: 600 })}

  <!-- Live public marketplace composition -->
  <g filter="url(#shadow)">
    <rect x="95" y="1120" width="1535" height="910" rx="52" fill="#fff"/>
    <rect x="125" y="1150" width="1475" height="84" rx="25" fill="#fff"/>
    <image x="1270" y="1157" width="290" height="76" preserveAspectRatio="xMidYMid meet" href="${logo}"/>
    <rect x="585" y="1175" width="580" height="43" rx="21" fill="#f4f5f7"/>
    ${text(1130, 1206, 'ابحث عن أي منتج، علامة تجارية أو إطلالة…', { size: 20, color: '#8a96a8', weight: 500 })}
    <rect x="125" y="1234" width="1475" height="58" fill="#fbfcfd"/>
    ${text(1545, 1272, 'اكتشف المتاجر    تصفح المنتجات    رجالي    حريمي    أطفال    كوتشيات وأحذية', { size: 22, color: '#10254a', weight: 700 })}
    <rect x="140" y="1320" width="670" height="120" rx="28" fill="#fff" stroke="#eef0f4" stroke-width="3"/>
    ${icon(762, 1381, '▣')}${text(710, 1366, 'الدفع عند الاستلام', { size: 26, color: '#10254a', weight: 800 })}${text(710, 1404, 'ادفع كاش لما الطلب يوصلك', { size: 21, color: '#718099', weight: 500 })}
    <rect x="830" y="1320" width="670" height="120" rx="28" fill="#fff" stroke="#eef0f4" stroke-width="3"/>
    ${icon(1450, 1381, '⌂')}${text(1400, 1366, 'منتجات محلية', { size: 26, color: '#10254a', weight: 800 })}${text(1400, 1404, 'من محلات حقيقية في بنها', { size: 21, color: '#718099', weight: 500 })}
    ${text(1500, 1508, 'تسوّق حسب القسم', { size: 43, color: '#10254a', weight: 900 })}
    ${text(1500, 1542, 'اكتشف تشكيلة محلات بنها في مكان واحد', { size: 22, color: '#718099', weight: 500 })}
    ${departmentTiles}
    ${text(1500, 1940, 'تسوّق من المحلات', { size: 34, color: '#10254a', weight: 900 })}
    ${['لمار بوتيك', 'أحمد فاشون', 'دنيم هاوس', 'تاون ستايل'].map((name, index) => {
      const cx = 1455 - index * 210;
      const initials = ['L', 'AF', 'DH', 'TS'][index];
      const colors = ['#ae4159', '#151515', '#2e3f92', '#0e8d76'][index];
      return `<circle cx="${cx}" cy="1977" r="54" fill="${colors}"/>${text(cx, 1992, initials, { size: initials.length > 1 ? 25 : 39, color: '#fff', weight: 800, anchor: 'middle' })}${text(cx, 2046, name, { size: 18, color: '#10254a', weight: 700, anchor: 'middle' })}`;
    }).join('')}
    <rect x="590" y="1948" width="420" height="70" rx="35" fill="#fff"/>
    ${text(800, 1992, 'لقطة من السوق الحقيقي', { size: 28, color: '#10254a', weight: 900, anchor: 'middle' })}
  </g>

  <!-- Actual dashboard styling, based on the current live owner dashboard -->
  <g filter="url(#shadow)">
    <rect x="1600" y="1110" width="635" height="1040" rx="78" fill="#10192d"/>
    <rect x="1628" y="1139" width="579" height="984" rx="55" fill="#f6f7fa"/>
    <rect x="1808" y="1156" width="215" height="17" rx="8" fill="#10192d"/>
    ${text(2154, 1248, 'دنيم هاوس', { size: 32, color: '#10254a', weight: 900 })}
    ${text(2154, 1290, 'مساء الخير 👋', { size: 20, color: '#718099', weight: 600 })}
    <rect x="1660" y="1322" width="515" height="250" rx="30" fill="#0b2d5a"/>
    ${text(2128, 1382, 'مبيعات النهارده', { size: 23, color: '#d6e0ef', weight: 600 })}
    ${text(2128, 1462, '٠ ج.م', { size: 58, color: '#fff', weight: 900 })}
    ${text(2128, 1512, '٠ طلب النهارده', { size: 20, color: '#d6e0ef', weight: 600 })}
    <rect x="1682" y="1508" width="470" height="48" rx="18" fill="#244875"/>
    ${text(2104, 1541, '٥ طلب جديد مستني تأكيد', { size: 20, color: '#fff', weight: 700 })}
    ${[['المبيعات','٣٬٣٠٤ ج.م'], ['الطلبات','٤'], ['متوسط الطلب','٨٢٦ ج.م'], ['معدل التحويل','٢٫٣٪']].map((item, index) => {
      const column = index % 2;
      const row = Math.floor(index / 2);
      const x = 1660 + column * 265;
      const y = 1600 + row * 135;
      return `<rect x="${x}" y="${y}" width="245" height="112" rx="23" fill="#fff"/>${text(x + 218, y + 42, item[0], { size: 19, color: '#758298', weight: 600 })}${text(x + 218, y + 88, item[1], { size: 29, color: '#10254a', weight: 900 })}`;
    }).join('')}
    <rect x="1660" y="1885" width="515" height="180" rx="28" fill="#fff"/>
    ${text(2125, 1930, 'نظرة على المبيعات', { size: 23, color: '#10254a', weight: 800 })}
    <path d="M1690 2015C1760 1995 1810 2025 1870 1950S1980 2010 2040 1915S2110 1930 2145 1900" fill="none" stroke="#f8620a" stroke-width="8" stroke-linecap="round"/>
  </g>
  <g filter="url(#shadow)">
    <rect x="2110" y="1330" width="655" height="905" rx="76" fill="#10192d" transform="rotate(5 2437 1782)"/>
    <g transform="rotate(5 2437 1782)">
      <rect x="2138" y="1358" width="599" height="849" rx="53" fill="#f8f9fb"/>
      <text x="2670" y="1440" text-anchor="end" font-family="Arial, Tahoma, sans-serif" font-size="29" font-weight="900" fill="#10254a">لوحة إدارة Twist</text>
      <rect x="2175" y="1474" width="525" height="138" rx="28" fill="#fff"/>
      ${text(2660, 1518, 'إجمالي المبيعات', { size: 22, color: '#738097', weight: 600 })}
      ${text(2660, 1582, '٢٬٤٧٥٬٠٩٢ ج.م', { size: 38, color: '#10254a', weight: 900 })}
      <rect x="2175" y="1640" width="250" height="135" rx="24" fill="#fff"/>
      <rect x="2450" y="1640" width="250" height="135" rx="24" fill="#fff"/>
      ${text(2385, 1690, 'المحلات النشطة', { size: 19, color: '#758298', weight: 600 })}${text(2385, 1742, '٦', { size: 41, color: '#10254a', weight: 900 })}
      ${text(2660, 1690, 'طلبات جديدة', { size: 19, color: '#758298', weight: 600 })}${text(2660, 1742, '١٩', { size: 41, color: '#f8620a', weight: 900 })}
      <rect x="2175" y="1807" width="525" height="265" rx="28" fill="#fff"/>
      ${text(2660, 1855, 'المبيعات — آخر ١٤ يوم', { size: 23, color: '#10254a', weight: 800 })}
      <path d="M2210 1985C2270 1900 2320 1915 2380 1855S2470 1900 2530 1810S2620 1910 2670 1835" fill="none" stroke="#f8620a" stroke-width="7"/>
    </g>
    <rect x="2175" y="2160" width="525" height="86" rx="43" fill="#fff"/>
    ${text(2437, 2216, 'ولوحة الإدارة', { size: 34, color: '#10254a', weight: 900, anchor: 'middle' })}
  </g>

  ${text(1500, 2362, 'كل اللي محلك محتاجه في مكان واحد', { size: 76, color: '#10254a', weight: 900, anchor: 'middle' })}
  <g filter="url(#shadow)">
    ${featureCard(2240, '١', 'موقعك ومتجرك', [
      { icon: '◎', title: 'موقع باسم محلك', body: 'عدّله بنفسك في أي وقت' },
      { icon: '⌖', title: 'موقعك على الخريطة', body: 'عنوان ومواعيد وواتساب' },
      { icon: '✦', title: 'عروض وكوبونات', body: 'وصّلها لعملائك بسهولة' },
      { icon: '▣', title: 'دفع عند الاستلام', body: 'العميل يدفع لما يستلم' },
    ])}
    ${featureCard(1540, '٢', 'زباين أكتر', [
      { icon: '⌂', title: 'سوق Twist لبنها', body: 'متجرك وسط محلات حقيقية' },
      { icon: '⌕', title: 'بحث بالمنتج والصورة', body: 'العميل يلاقي اللي عايزه' },
      { icon: 'QR', title: 'QR خاص بمتجرك', body: 'يفتح صفحتك فورًا' },
      { icon: '↗', title: 'طلبات «مش لاقيه»', body: 'يوصلك طلب العميل' },
    ])}
    ${featureCard(840, '٣', 'تدبير بسهولة', [
      { icon: '▦', title: 'لوحة تحكم للمحل', body: 'موبايل أو كمبيوتر' },
      { icon: '◉', title: 'تنبيه لكل طلب', body: 'على اللوحة أو واتساب' },
      { icon: '▣', title: 'مخزون ومبيعاتك', body: 'كلها قدامك' },
      { icon: '↻', title: 'حدّث منتجاتك', body: 'وأسعارك في أي وقت' },
    ])}
    ${featureCard(140, '٤', 'معاك على طول', [
      { icon: '◌', title: 'دعم فني', body: 'معاك وقت ما تحتاج' },
      { icon: '▧', title: 'تصوير احترافي', body: 'خدمة اختيارية للمنتجات' },
      { icon: '▤', title: 'توصيل Twist اختياري', body: 'أو استخدم دليفري محلك' },
      { icon: '✓', title: 'دفع عند الاستلام', body: 'نوصّل والعميل يدفع' },
    ])}
  </g>

  <g filter="url(#shadow)">
    <rect x="135" y="3425" width="2730" height="560" rx="76" fill="url(#navy)"/>
  </g>
  <g transform="rotate(-6 440 3660)" filter="url(#shadow)">
    <rect x="225" y="3350" width="440" height="630" rx="28" fill="#fff"/>
    <rect x="254" y="3380" width="382" height="570" rx="18" fill="#fff" stroke="#f8620a" stroke-width="4"/>
    ${text(445, 3475, 'امسح واسألنا', { size: 31, color: '#10254a', weight: 900, anchor: 'middle' })}
    <image x="304" y="3520" width="280" height="280" href="${qrImage}"/>
    ${text(445, 3880, 'متجرك على Twist', { size: 27, color: '#64738b', weight: 700, anchor: 'middle' })}
  </g>
  ${text(2750, 3585, 'جديد… QR لكل متجر', { size: 48, color: '#ff9b61', weight: 800 })}
  ${text(2750, 3700, 'عميلك يمسح ويوصل', { size: 75, color: '#fff', weight: 900 })}
  ${text(2750, 3800, 'لمتجرك ومنتجاتك فورًا', { size: 66, color: '#fff', weight: 900 })}
  ${text(2750, 3890, 'وتوصيل Twist اختياري: نستلم من محلك ونوصل للعميل.', { size: 34, color: '#d3ddeb', weight: 600 })}

  ${text(150, 4118, '01206928670', { size: 76, color: '#f8620a', weight: 900, anchor: 'start' })}
  ${text(2850, 4086, 'سجّل قبل ١ نوفمبر ٢٠٢٦ وخد أول شهر مجانًا', { size: 52, color: '#10254a', weight: 900 })}
  ${text(2850, 4165, 'اشتراك شهري بسيط • من غير عمولة على البيع • دعم فني معاك', { size: 36, color: '#718099', weight: 600 })}
  ${text(150, 4200, 'كلّمنا واتساب', { size: 31, color: '#f8620a', weight: 700, anchor: 'start' })}
</svg>`;

fs.writeFileSync('marketing/twist-store-flyer.svg', svg);
await sharp(Buffer.from(svg), { density: 72 })
  .withMetadata({ density: 300 })
  .png()
  .toFile('marketing/twist-store-flyer.png');

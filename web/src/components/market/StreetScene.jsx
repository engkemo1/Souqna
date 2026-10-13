import { Link } from 'react-router-dom';

/**
 * Hero illustration: a wide street of clothing shops, drawn in the brand's language (the scalloped awning from the logo).
 * It is meant to span the full page width. Every element means something: each shop is a department (click → that
 * department's products), the people are shoppers walking the street, the lamp-post plaque is the street's name.
 * Pure SVG: no photos, scales to any width.
 */
const NAVY = '#14213D';
const ORANGE = '#F45100';
const SKIN = '#EBCBB1';
const W = 1600;

const SHOPS = [
  { x: 40, top: 168, wall: '#FFF8F0', dept: 'women', ar: 'حريمي', en: 'Women', awning: [ORANGE, '#FFFFFF'], kind: 'dress', sale: true, roof: 'tank' },
  { x: 266, top: 140, wall: '#EAF1FA', dept: 'men', ar: 'رجالي', en: 'Men', awning: [NAVY, '#FFFFFF'], kind: 'suit', roof: 'antenna' },
  { x: 492, top: 176, wall: '#FDEBDD', dept: 'kids', ar: 'أطفال', en: 'Kids', awning: [ORANGE, '#FFFFFF'], kind: 'kids', roof: 'flag' },
  { x: 718, top: 150, wall: '#EEF4EC', dept: 'shoes', ar: 'كوتشيات', en: 'Shoes', awning: [NAVY, '#FFFFFF'], kind: 'shoes', sale: true, roof: 'plant' },
  { x: 944, top: 172, wall: '#FFF3E3', dept: 'bags', ar: 'شنط', en: 'Bags', awning: [ORANGE, '#FFFFFF'], kind: 'bag', roof: 'tank' },
  { x: 1170, top: 144, wall: '#E9EEF7', dept: 'sports', ar: 'رياضة', en: 'Sports', awning: [NAVY, '#FFFFFF'], kind: 'sport', roof: 'antenna' },
  { x: 1396, top: 164, wall: '#FFF7F1', dept: 'wedding_dress', ar: 'فساتين فرح', en: 'Bridal', awning: [ORANGE, '#FFFFFF'], kind: 'bride', sale: true, roof: 'flag' },
];

function Awning({ colors, y }) {
  const n = 6, w = 192 / n, r = w / 2;
  return (
    <g transform={`translate(-6,${y})`}>
      <rect x="0" y="-2" width="192" height="14" rx="3" fill={colors[0]} />
      {Array.from({ length: n }, (_, i) => (
        <path key={i} d={`M${i * w} 10H${(i + 1) * w}V34A${r} ${r} 0 0 1 ${i * w} 34Z`} fill={colors[i % 2]} />
      ))}
      <ellipse cx="96" cy="64" rx="86" ry="6" fill={NAVY} opacity="0.07" />
    </g>
  );
}

function Window({ wy, kind, sale }) {
  const h = 440 - wy;
  const garments = ['#F45100', '#14213D', '#F9B58F', '#6C7A99'];
  return (
    <g>
      <rect x="14" y={wy} width="100" height={h} rx="5" fill="#FFF6EC" />
      <rect x="14" y="430" width="100" height="10" fill="#EADBCB" />
      <line x1="26" y1={wy + 20} x2="102" y2={wy + 20} stroke="#9AA3B2" strokeWidth="2" strokeLinecap="round" />
      {garments.map((c, i) => (
        <g key={i} transform={`translate(${34 + i * 20},${wy + 20})`}>
          <path d="M0 0 L-3 3" stroke="#9AA3B2" strokeWidth="1.5" /><path d="M-9 6 L-4 3 L0 6 L4 3 L9 6 L7 12 L5 11 L5 24 L-5 24 L-5 11 L-7 12 Z" fill={c} opacity="0.92" />
        </g>
      ))}
      {kind === 'dress' && (
        <g>
          <ellipse cx="64" cy="437" rx="22" ry="4" fill="#C9CBD4" /><rect x="62" y="414" width="4" height="23" fill="#C9CBD4" />
          <circle cx="64" cy="344" r="9" fill={SKIN} /><rect x="61" y="351" width="6" height="6" fill={SKIN} />
          <path d="M51 357 L77 357 L73 386 L92 424 L36 424 L55 386 Z" fill={ORANGE} /><rect x="54" y="383" width="20" height="5" rx="2" fill={NAVY} />
        </g>
      )}
      {kind === 'suit' && (
        <g>
          <circle cx="64" cy="342" r="9" fill={SKIN} /><rect x="61" y="349" width="6" height="6" fill={SKIN} />
          <path d="M47 358 Q64 352 81 358 L85 402 L43 402 Z" fill={NAVY} /><path d="M58 356 L64 372 L70 356 Z" fill="#FFFFFF" /><path d="M63 362 L65 362 L66 378 L64 382 L62 378 Z" fill={ORANGE} />
          <rect x="49" y="402" width="14" height="32" fill="#33466B" /><rect x="65" y="402" width="14" height="32" fill="#33466B" />
          <ellipse cx="56" cy="436" rx="9" ry="3" fill={NAVY} /><ellipse cx="72" cy="436" rx="9" ry="3" fill={NAVY} />
        </g>
      )}
      {kind === 'kids' && (
        <g>
          <circle cx="64" cy="378" r="8" fill={SKIN} /><rect x="62" y="384" width="4" height="4" fill={SKIN} />
          <path d="M47 392 L52 388 L76 388 L81 392 L77 402 L74 400 L74 414 L54 414 L54 400 L51 402 Z" fill={ORANGE} />
          <rect x="54" y="414" width="9" height="12" fill={NAVY} /><rect x="65" y="414" width="9" height="12" fill={NAVY} />
          <rect x="56" y="426" width="5" height="8" fill={SKIN} /><rect x="67" y="426" width="5" height="8" fill={SKIN} />
          <ellipse cx="58" cy="436" rx="7" ry="3" fill="#FFFFFF" stroke={NAVY} strokeWidth="1" /><ellipse cx="70" cy="436" rx="7" ry="3" fill="#FFFFFF" stroke={NAVY} strokeWidth="1" />
          <path d="M90 372 Q91 396 85 428" stroke="#9AA3B2" strokeWidth="1" fill="none" /><ellipse cx="90" cy="362" rx="8" ry="10" fill={ORANGE} />
        </g>
      )}
      {kind === 'shoes' && (
        <g>
          <rect x="20" y="384" width="88" height="5" rx="2" fill="#B9AA97" /><rect x="20" y="424" width="88" height="5" rx="2" fill="#B9AA97" />
          {[0, 1, 2].map((i) => (
            <g key={i} transform={`translate(${28 + i * 29},${384})`}>
              <path d="M0 0 L0 -14 Q10 -16 14 -8 L24 -6 Q27 -5 27 0 Z" fill={[ORANGE, NAVY, '#F9B58F'][i]} /><rect x="-1" y="-2" width="29" height="3" rx="1.5" fill="#FFFFFF" />
            </g>
          ))}
          <path d="M30 424 L26 402 L50 402 L46 424 Z" fill={NAVY} /><path d="M33 402 Q38 392 43 402" stroke={NAVY} strokeWidth="2" fill="none" />
          <path d="M66 424 L62 408 L90 408 L86 424 Z" fill={ORANGE} /><path d="M70 408 Q76 398 82 408" stroke={ORANGE} strokeWidth="2" fill="none" />
        </g>
      )}
      {kind === 'bag' && (
        <g>
          <rect x="20" y="398" width="88" height="5" rx="2" fill="#B9AA97" /><rect x="20" y="430" width="88" height="5" rx="2" fill="#B9AA97" />
          <path d="M30 398 L26 372 L54 372 L50 398 Z" fill={ORANGE} /><path d="M33 372 Q40 358 47 372" stroke={ORANGE} strokeWidth="3" fill="none" /><rect x="34" y="382" width="12" height="3" rx="1.5" fill="#FFFFFF" />
          <rect x="62" y="378" width="34" height="20" rx="4" fill={NAVY} /><path d="M66 378 Q79 364 92 378" stroke={NAVY} strokeWidth="2.5" fill="none" /><circle cx="79" cy="388" r="2.6" fill="#F9B58F" />
          <path d="M28 430 L84 430 L80 410 L32 410 Z" fill="#F9B58F" /><rect x="52" y="418" width="8" height="4" rx="2" fill={NAVY} />
          <rect x="88" y="414" width="18" height="16" rx="3" fill="#6C7A99" />
        </g>
      )}
      {kind === 'sport' && (
        <g>
          <circle cx="64" cy="342" r="9" fill={SKIN} /><rect x="61" y="349" width="6" height="6" fill={SKIN} />
          <path d="M46 358 Q64 352 82 358 L84 398 L44 398 Z" fill={ORANGE} /><rect x="62" y="354" width="4" height="44" fill="#FFFFFF" />
          <rect x="49" y="398" width="14" height="34" fill={NAVY} /><rect x="65" y="398" width="14" height="34" fill={NAVY} /><rect x="55" y="398" width="2" height="34" fill="#FFFFFF" /><rect x="71" y="398" width="2" height="34" fill="#FFFFFF" />
          <ellipse cx="56" cy="436" rx="9" ry="3" fill="#FFFFFF" stroke={NAVY} strokeWidth="1" /><ellipse cx="72" cy="436" rx="9" ry="3" fill="#FFFFFF" stroke={NAVY} strokeWidth="1" />
          <circle cx="98" cy="425" r="9" fill="#FFFFFF" stroke={NAVY} strokeWidth="1.5" /><path d="M98 420 L102 423 L100 428 L96 428 L94 423 Z" fill={NAVY} />
        </g>
      )}
      {kind === 'bride' && (
        <g>
          <circle cx="64" cy="344" r="9" fill={SKIN} /><path d="M54 340 Q64 328 74 340 L84 396 Q64 384 44 396 Z" fill="#FFFFFF" opacity="0.55" />
          <rect x="61" y="351" width="6" height="6" fill={SKIN} />
          <path d="M52 358 L76 358 L72 384 L98 434 L30 434 L56 384 Z" fill="#FFFFFF" stroke="#E4D8CA" strokeWidth="1.5" /><rect x="55" y="381" width="18" height="4" rx="2" fill={ORANGE} />
          <path d="M44 420 Q64 428 84 420" stroke="#E4D8CA" strokeWidth="1.2" fill="none" />
          <g transform="translate(96,418)"><path d="M0 0 L-4 -10 M0 0 L4 -10 M0 0 L0 -12" stroke="#6E9D80" strokeWidth="1.5" /><circle cx="-4" cy="-12" r="3" fill={ORANGE} /><circle cx="4" cy="-12" r="3" fill="#F9B58F" /><circle cx="0" cy="-14" r="3" fill={ORANGE} /></g>
        </g>
      )}
      <rect x="14" y={wy} width="100" height={h} rx="5" fill="none" stroke={NAVY} strokeWidth="4" />
      <path d={`M24 ${wy + 6} L58 ${wy + 6} L30 ${wy + 90} L24 ${wy + 90} Z`} fill="#FFFFFF" opacity="0.28" />
      <path d={`M66 ${wy + 6} L78 ${wy + 6} L50 ${wy + 90} L38 ${wy + 90} Z`} fill="#FFFFFF" opacity="0.2" />
      {sale && <g transform={`translate(98,${wy + 22})`}><circle r="11" fill={ORANGE} /><text y="4" textAnchor="middle" fontSize="12" fontWeight="800" fill="#FFFFFF">%</text></g>}
      <rect x="14" y="440" width="100" height="40" rx="3" fill={NAVY} opacity="0.92" /><rect x="14" y="440" width="100" height="4" fill={ORANGE} />
    </g>
  );
}


function Door({ dy, lang }) {
  return (
    <g>
      <rect x="124" y={dy} width="42" height={480 - dy} rx="4" fill="#FFF6EC" stroke={NAVY} strokeWidth="4" />
      <rect x="130" y={dy + 8} width="30" height={480 - dy - 38} rx="2" fill="#DCEAF4" />
      <path d={`M132 ${dy + 10} L146 ${dy + 10} L132 ${dy + 52} Z`} fill="#FFFFFF" opacity="0.5" />
      <circle cx="132" cy={dy + 92} r="2.6" fill={ORANGE} />
      <rect x="136" y={dy + 22} width="22" height="11" rx="2.5" fill={NAVY} /><text x="147" y={dy + 30.4} textAnchor="middle" fontSize="6.5" fontWeight="800" fill="#FFFFFF" className="font-display">{lang === 'ar' ? 'مفتوح' : 'OPEN'}</text>
      <rect x="127" y="474" width="36" height="6" rx="3" fill={ORANGE} opacity="0.85" />
    </g>
  );
}

function Roof({ kind, y }) {
  if (kind === 'tank') return <g transform={`translate(132,${y})`}><rect x="-12" y="-26" width="24" height="26" rx="4" fill="#9AA3B2" /><rect x="-12" y="-26" width="24" height="5" rx="2.5" fill="#7C869A" /><rect x="-9" y="0" width="3" height="5" fill="#7C869A" /><rect x="6" y="0" width="3" height="5" fill="#7C869A" /></g>;
  if (kind === 'antenna') return <g transform={`translate(138,${y})`} stroke="#7C869A" strokeWidth="2" fill="none"><path d="M0 0 V-34" /><path d="M-10 -28 H10 M-7 -20 H7 M-12 -36 H12" /></g>;
  if (kind === 'flag') return <g transform={`translate(30,${y})`}><rect x="-1.5" y="-40" width="3" height="40" fill={NAVY} /><path d="M1.5 -40 L30 -33 L1.5 -26 Z" fill={ORANGE} /></g>;
  return <g transform={`translate(40,${y})`}><path d="M-16 0 L16 0 L12 -14 L-12 -14 Z" fill={ORANGE} /><ellipse cx="-6" cy="-24" rx="7" ry="13" fill="#8FB9A0" transform="rotate(-18 -6 -16)" /><ellipse cx="7" cy="-26" rx="7" ry="14" fill="#A7C9B3" transform="rotate(16 7 -16)" /><ellipse cx="0" cy="-30" rx="6" ry="14" fill="#8FB9A0" /></g>;
}

function Shop({ shop, label, lang }) {
  const { x, top, wall, awning, kind, dept, sale, roof } = shop;
  const awY = top + 76, wy = top + 140, dy = top + 150;
  return (
    <Link to={`/search?department=${dept}`} aria-label={label} className="group cursor-pointer outline-none">
      <g transform={`translate(${x},0)`}>
        <Roof kind={roof} y={top} />
        <rect x="0" y={top} width="180" height={480 - top} fill={wall} />
        <rect x="0" y={top} width="180" height="12" fill={NAVY} opacity="0.16" />
        <rect x="0" y={top + 12} width="180" height="3" fill="#FFFFFF" opacity="0.7" />
        <rect x="150" y={top + 82} width="22" height="14" rx="2" fill="#FFFFFF" opacity="0.9" stroke="#C9CBD4" strokeWidth="1.2" /><path d={`M154 ${top + 86}H168M154 ${top + 90}H168`} stroke="#C9CBD4" strokeWidth="1.2" />
        <g className="transition-transform duration-300 ease-out group-hover:-translate-y-1 group-focus-visible:-translate-y-1">
          {[26, 90, 154].map((lx) => <g key={lx}><path d={`M${lx} ${top + 22} v-6 h8`} stroke={NAVY} strokeWidth="2" fill="none" /><circle cx={lx + 8} cy={top + 16} r="3.2" fill="#FFE2B8" /><circle cx={lx + 8} cy={top + 16} r="9" fill="#FFD9A8" opacity="0.35" /></g>)}
          <rect x="14" y={top + 24} width="152" height="40" rx="9" fill={NAVY} />
          <rect x="18" y={top + 28} width="144" height="32" rx="6" fill="none" stroke="#FFFFFF" strokeWidth="1" opacity="0.3" />
          <circle cx="28" cy={top + 44} r="3.5" fill={ORANGE} /><circle cx="152" cy={top + 44} r="3.5" fill={ORANGE} />
          <text x="90" y={top + 51} textAnchor="middle" fontSize={label.length > 9 ? 17 : 22} fontWeight="800" fill="#FFFFFF" className="font-display">{label}</text>
          <Awning colors={awning} y={awY} />
        </g>
        <Window wy={wy} kind={kind} sale={sale} />
        <Door dy={dy} lang={lang} />
      </g>
    </Link>
  );
}

function Person({ x, s = 1, top, bottom, hair, woman, bag, flip = false }) {
  return (
    <g transform={`translate(${x},550) scale(${flip ? -s : s},${s})`}>
      <ellipse cx="0" cy="3" rx="24" ry="4.5" fill={NAVY} opacity="0.12" />
      {woman ? (
        <g>
          <path d="M-12 -50 L12 -50 L19 -28 L-19 -28 Z" fill={bottom} />
          <rect x="-8" y="-28" width="5.5" height="26" rx="2" fill={SKIN} /><rect x="2.5" y="-28" width="5.5" height="26" rx="2" fill={SKIN} />
          <rect x="-10" y="-4" width="9" height="4" rx="2" fill={NAVY} /><rect x="1" y="-4" width="9" height="4" rx="2" fill={NAVY} />
        </g>
      ) : (
        <g>
          <rect x="-11" y="-36" width="10" height="33" rx="2" fill={bottom} /><rect x="1" y="-36" width="10" height="33" rx="2" fill={bottom} />
          <rect x="-12" y="-4" width="11" height="4" rx="2" fill={NAVY} /><rect x="1" y="-4" width="11" height="4" rx="2" fill={NAVY} />
        </g>
      )}
      <path d={`M-13 ${woman ? -82 : -84} Q0 -89 13 ${woman ? -82 : -84} L${woman ? 13 : 12} ${woman ? -48 : -38} L${woman ? -13 : -12} ${woman ? -48 : -38} Z`} fill={top} />
      <rect x="-18" y="-82" width="5.5" height="30" rx="2.5" fill={top} /><rect x="12.5" y="-82" width="5.5" height="30" rx="2.5" fill={top} />
      <rect x="-3" y="-91" width="6" height="8" fill={SKIN} />
      {woman && <path d="M-11 -98 Q-13 -112 0 -112 Q13 -112 11 -98 L12 -80 Q6 -78 0 -86 Q-6 -78 -12 -80 Z" fill={hair} />}
      <circle cx="0" cy="-98" r="10" fill={SKIN} />
      <path d={`M-10.5 -99 Q0 ${woman ? -111 : -113} 10.5 -99 Q0 ${woman ? -102 : -104} -10.5 -99 Z`} fill={hair} />
      {bag && (
        <g>
          <path d="M17 -54 L17 -46" stroke={top} strokeWidth="4" /><path d="M20 -46 Q26 -62 32 -46" stroke={bag} strokeWidth="2.5" fill="none" />
          <path d="M14 -46 L36 -46 L33 -22 L17 -22 Z" fill={bag} /><rect x="20" y="-38" width="10" height="3" rx="1.5" fill="#FFFFFF" opacity="0.85" />
        </g>
      )}
    </g>
  );
}

function Plant({ x }) {
  return (
    <g transform={`translate(${x},548)`}>
      <ellipse cx="0" cy="3" rx="20" ry="4" fill={NAVY} opacity="0.12" />
      <path d="M-14 -26 L14 -26 L10 0 L-10 0 Z" fill={NAVY} /><rect x="-16" y="-30" width="32" height="6" rx="3" fill={ORANGE} />
      {[[-12, -52, -24], [0, -62, 0], [12, -50, 26]].map(([dx, dy, rot], i) => (
        <ellipse key={i} cx={dx} cy={dy} rx="7" ry="20" fill={i === 1 ? '#8FB9A0' : '#A7C9B3'} transform={`rotate(${rot} ${dx} ${dy + 18})`} />
      ))}
    </g>
  );
}

function Tree({ x, y = 552 }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <ellipse cx="0" cy="2" rx="26" ry="5" fill={NAVY} opacity="0.12" />
      <rect x="-4" y="-92" width="8" height="92" rx="3" fill="#8A6B55" />
      <circle cx="-18" cy="-104" r="26" fill="#9CC3A8" /><circle cx="18" cy="-108" r="28" fill="#A7C9B3" /><circle cx="0" cy="-130" r="30" fill="#8FB9A0" /><circle cx="-6" cy="-92" r="22" fill="#86B496" />
      <circle cx="-14" cy="-120" r="4" fill="#FFFFFF" opacity="0.25" /><circle cx="20" cy="-96" r="3" fill="#FFFFFF" opacity="0.2" />
    </g>
  );
}

function Lamp({ x, name, lang }) {
  return (
    <g>
      <circle cx={x} cy="232" r="34" fill="url(#st-lamp)" opacity="0.7" />
      <rect x={x - 3} y="250" width="6" height="298" rx="3" fill={NAVY} /><rect x={x - 12} y="540" width="24" height="9" rx="4" fill={NAVY} />
      <path d={`M${x - 10} 240 L${x + 10} 240 L${x + 6} 222 L${x - 6} 222 Z`} fill={NAVY} /><rect x={x - 7} y="228" width="14" height="10" rx="2" fill="#FFE2B8" />
      {name && (
        <g>
          <rect x={x - 38} y="262" width="76" height="28" rx="7" fill={NAVY} /><rect x={x - 35} y="265" width="70" height="22" rx="5" fill="none" stroke="#FFFFFF" strokeWidth="1" opacity="0.5" />
          <text x={x + 8} y="281" textAnchor="middle" fontSize="13" fontWeight="800" fill="#FFFFFF" className="font-display">{lang === 'ar' ? 'شارع طلة' : 'Talla St.'}</text>
          <path d={`M${x - 29} 276 Q${x - 22} 268 ${x - 15} 276 Q${x - 22} 284 ${x - 29} 276 Z`} fill="#FFFFFF" /><circle cx={x - 22} cy="276" r="2.6" fill={ORANGE} />
        </g>
      )}
    </g>
  );
}

/** clothes rail on the pavement, in front of a shop */
function Rack({ x }) {
  const cols = [ORANGE, NAVY, '#F9B58F', '#6C7A99', '#FFFFFF', ORANGE];
  return (
    <g transform={`translate(${x},548)`}>
      <ellipse cx="0" cy="2" rx="36" ry="4" fill={NAVY} opacity="0.12" />
      <path d="M-30 0 L-26 -62 M30 0 L26 -62" stroke="#7C869A" strokeWidth="3" strokeLinecap="round" /><path d="M-34 -62 H34" stroke="#7C869A" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M-30 0 L-38 2 M30 0 L38 2" stroke="#7C869A" strokeWidth="3" strokeLinecap="round" />
      {cols.map((c, i) => (
        <g key={i} transform={`translate(${-25 + i * 10},-62)`}><path d="M0 0 L-4 5 M0 0 L4 5" stroke="#7C869A" strokeWidth="1" /><path d="M-6 5 L6 5 L5 36 L-5 36 Z" fill={c} stroke={c === '#FFFFFF' ? '#D9DEE8' : 'none'} /></g>
      ))}
    </g>
  );
}

/** A-frame sale board */
function SaleBoard({ x, lang }) {
  return (
    <g transform={`translate(${x},550)`}>
      <ellipse cx="0" cy="2" rx="24" ry="4" fill={NAVY} opacity="0.12" />
      <path d="M-18 0 L-10 -58 H10 L18 0" fill="none" stroke={NAVY} strokeWidth="3" strokeLinejoin="round" />
      <path d="M-13 -6 L-8 -52 H8 L13 -6 Z" fill="#FFFFFF" stroke={NAVY} strokeWidth="1.5" />
      <text y="-34" textAnchor="middle" fontSize="11" fontWeight="800" fill={ORANGE} className="font-display">{lang === 'ar' ? 'تخفيضات' : 'SALE'}</text>
      <text y="-18" textAnchor="middle" fontSize="13" fontWeight="800" fill={NAVY} className="font-display" direction="ltr">-50%</text>
    </g>
  );
}

function Bench({ x }) {
  return (
    <g transform={`translate(${x},550)`}>
      <ellipse cx="0" cy="2" rx="44" ry="5" fill={NAVY} opacity="0.12" />
      <rect x="-40" y="-34" width="80" height="6" rx="3" fill={ORANGE} /><rect x="-40" y="-24" width="80" height="6" rx="3" fill={ORANGE} />
      <rect x="-40" y="-14" width="80" height="7" rx="3" fill="#F9B58F" />
      <rect x="-36" y="-8" width="5" height="9" fill={NAVY} /><rect x="31" y="-8" width="5" height="9" fill={NAVY} /><rect x="-36" y="-34" width="5" height="22" fill={NAVY} /><rect x="31" y="-34" width="5" height="22" fill={NAVY} />
    </g>
  );
}

function Bin({ x }) {
  return (
    <g transform={`translate(${x},550)`}>
      <ellipse cx="0" cy="2" rx="14" ry="3" fill={NAVY} opacity="0.12" />
      <path d="M-11 -34 L11 -34 L9 0 L-9 0 Z" fill="#6C7A99" /><rect x="-13" y="-39" width="26" height="6" rx="3" fill={NAVY} /><path d="M-4 -26 V-8 M0 -26 V-8 M4 -26 V-8" stroke="#FFFFFF" strokeWidth="1.2" opacity="0.5" />
    </g>
  );
}

function Cat({ x }) {
  return (
    <g transform={`translate(${x},550)`}>
      <ellipse cx="0" cy="1" rx="14" ry="3" fill={NAVY} opacity="0.12" />
      <path d="M-10 0 Q-14 -14 -4 -18 L-4 -26 L0 -22 L6 -22 L10 -26 L10 -16 Q16 -8 12 0 Z" fill="#F9B58F" /><path d="M12 -2 Q26 -2 24 -16" stroke="#F9B58F" strokeWidth="4" fill="none" strokeLinecap="round" />
      <circle cx="-1" cy="-18" r="1.3" fill={NAVY} /><circle cx="5" cy="-18" r="1.3" fill={NAVY} />
    </g>
  );
}

function Tuktuk({ x, flip }) {
  return (
    <g transform={`translate(${x},652) scale(${flip ? -1 : 1},1)`}>
      <ellipse cx="38" cy="2" rx="46" ry="5" fill={NAVY} opacity="0.14" />
      <rect x="4" y="-72" width="3" height="30" fill={NAVY} /><rect x="66" y="-72" width="3" height="30" fill={NAVY} />
      <path d="M-2 -70 Q36 -84 76 -70 L74 -64 Q36 -76 0 -64 Z" fill={NAVY} />
      <path d="M0 -44 Q2 -60 20 -62 L26 -62 L26 -40 Z" fill="#DCEAF4" stroke={NAVY} strokeWidth="2" />
      <path d="M-4 -14 Q-6 -34 8 -40 L28 -42 L74 -42 Q82 -40 82 -26 L82 -14 Z" fill={ORANGE} />
      <rect x="30" y="-40" width="40" height="12" rx="3" fill="#FFFFFF" opacity="0.9" />
      <circle cx="2" cy="-30" r="3.4" fill="#FFE2B8" />
      <circle cx="8" cy="-8" r="9" fill={NAVY} /><circle cx="8" cy="-8" r="3.5" fill="#C9CBD4" />
      <circle cx="68" cy="-8" r="9" fill={NAVY} /><circle cx="68" cy="-8" r="3.5" fill="#C9CBD4" />
    </g>
  );
}

function Birds() {
  return (
    <g fill="none" stroke={NAVY} strokeWidth="1.8" strokeLinecap="round" opacity="0.55">
      <g><path d="M0 0 q6 -7 12 0 q6 -7 12 0" /><animateTransform attributeName="transform" type="translate" values="260 110; 330 96; 260 110" dur="14s" repeatCount="indefinite" /></g>
      <g><path d="M0 0 q5 -6 10 0 q5 -6 10 0" /><animateTransform attributeName="transform" type="translate" values="1010 92; 1070 106; 1010 92" dur="17s" repeatCount="indefinite" /></g>
      <g><path d="M0 0 q4 -5 8 0 q4 -5 8 0" /><animateTransform attributeName="transform" type="translate" values="1330 126; 1380 114; 1330 126" dur="12s" repeatCount="indefinite" /></g>
    </g>
  );
}

function Skyline() {
  const tints = ['#F7DFCB', '#F1D6C0', '#EDCFB8'];
  const blocks = [[0, 118, 130], [130, 96, 150], [270, 126, 120], [420, 104, 140], [600, 124, 110], [940, 100, 130], [1080, 130, 110], [1210, 110, 150], [1380, 122, 110], [1500, 98, 100]];
  return (
    <g>
      {blocks.map(([x, top, w], i) => (
        <g key={i}>
          <rect x={x} y={top} width={w} height={480 - top} fill={tints[i % 3]} />
          {Array.from({ length: Math.floor((480 - top - 60) / 36) }, (_, r) => Array.from({ length: Math.floor(w / 34) }, (_, c) => (
            <rect key={`${r}-${c}`} x={x + 10 + c * 34} y={top + 14 + r * 36} width="14" height="20" rx="2" fill={(r * 3 + c + i) % 4 === 0 ? '#FFE9B8' : '#FFFFFF'} opacity={(r * 3 + c + i) % 4 === 0 ? 0.95 : 0.55} />
          )))}
        </g>
      ))}
      {/* mosque: a landmark that says "this is a real neighbourhood" */}
      <g>
        <rect x="1158" y="70" width="16" height="100" fill="#F5DCC7" /><rect x="1153" y="96" width="26" height="6" rx="2" fill="#E6C8AE" />
        <path d="M1158 70 L1166 44 L1174 70 Z" fill="#E6C8AE" /><circle cx="1166" cy="41" r="3.4" fill={ORANGE} />
        <rect x="1040" y="118" width="112" height="70" fill="#F3D9C4" /><path d="M1050 118 Q1096 62 1142 118 Z" fill="#E9CDB6" /><rect x="1094.5" y="52" width="3" height="20" fill="#E9CDB6" /><circle cx="1096" cy="50" r="3.4" fill={ORANGE} />
      </g>
    </g>
  );
}

function swag(x0, x1, y0, sag, n, colors) {
  return Array.from({ length: n }, (_, i) => {
    const t = (i + 0.5) / n;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + 2 * sag * t * (1 - t);
    return { x, y, c: colors[i % colors.length] };
  });
}

export default function StreetScene({ labels = {}, lang = 'ar', className = '' }) {
  const colors = [ORANGE, NAVY, '#FFC9A3'];
  const swags = [[-10, 540, 92, 34], [540, 1070, 92, 34], [1070, 1610, 92, 34]];
  return (
    <svg viewBox="0 30 1600 640" role="img" aria-label={lang === 'ar' ? 'شارع محلات الملابس في بنها' : 'A street of clothing shops in Banha'} className={className}>
      <defs>
        <linearGradient id="st-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFF5EC" /><stop offset="0.45" stopColor="#FFE8D4" /><stop offset="1" stopColor="#FFF2E6" /></linearGradient>
        <radialGradient id="st-lamp" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#FFD9A8" stopOpacity="0.8" /><stop offset="1" stopColor="#FFD9A8" stopOpacity="0" /></radialGradient>
      </defs>
      <rect x="0" y="30" width={W} height="640" fill="url(#st-sky)" />
      <circle cx="170" cy="130" r="86" fill="#FFD2A8" opacity="0.28" /><circle cx="170" cy="130" r="46" fill="#FFC592" opacity="0.85" />
      <g fill="#FFFFFF" opacity="0.85">
        <g><ellipse cx="520" cy="84" rx="62" ry="14" /><ellipse cx="556" cy="72" rx="36" ry="14" /><animateTransform attributeName="transform" type="translate" values="0 0; 70 0; 0 0" dur="38s" repeatCount="indefinite" /></g>
        <g><ellipse cx="1280" cy="70" rx="70" ry="15" /><ellipse cx="1318" cy="57" rx="38" ry="15" /><animateTransform attributeName="transform" type="translate" values="0 0; -80 0; 0 0" dur="46s" repeatCount="indefinite" /></g>
        <g><ellipse cx="930" cy="62" rx="48" ry="11" /><ellipse cx="956" cy="52" rx="26" ry="10" /><animateTransform attributeName="transform" type="translate" values="0 0; 50 0; 0 0" dur="30s" repeatCount="indefinite" /></g>
      </g>
      <Birds />
      <Skyline />

      {SHOPS.map((shop) => <Shop key={shop.dept} shop={shop} label={labels[shop.dept] || (lang === 'ar' ? shop.ar : shop.en)} lang={lang} />)}

      {/* bunting across the street: the market is celebrating */}
      {swags.map(([x0, x1, y0, sag], si) => (
        <g key={si}>
          <path d={`M${x0} ${y0} Q${(x0 + x1) / 2} ${y0 + sag * 2} ${x1} ${y0}`} fill="none" stroke={NAVY} strokeWidth="1.6" opacity="0.45" />
          {swag(x0, x1, y0, sag, 17, colors).map((f, i) => <path key={i} d={`M${f.x - 9} ${f.y} L${f.x + 9} ${f.y} L${f.x} ${f.y + 24} Z`} fill={f.c} />)}
        </g>
      ))}

      {/* pavement, curb, road */}
      <rect y="480" width={W} height="86" fill="#EFE5D8" />
      {Array.from({ length: 27 }, (_, i) => <rect key={i} x={i * 62 - 10} y="480" width="2" height="86" fill="#D9CCBC" opacity="0.7" />)}
      <rect y="514" width={W} height="2" fill="#D9CCBC" opacity="0.7" />
      <rect y="566" width={W} height="12" fill="#D2C5B4" /><rect y="566" width={W} height="3" fill="#FFFFFF" opacity="0.5" />
      <rect y="578" width={W} height="92" fill="#C9C0B4" />
      {Array.from({ length: 15 }, (_, i) => <rect key={i} x={i * 112 + 24} y="618" width="58" height="5" rx="2.5" fill="#F7F0E4" />)}

      <Tree x={469} /><Tree x={921} /><Tree x={1373} />
      <Lamp x={243} lang={lang} /><Lamp x={695} name lang={lang} /><Lamp x={1147} lang={lang} />
      <Plant x={20} /><Plant x={1580} /><Plant x={410} /><Plant x={1030} />

      <Rack x={96} /><SaleBoard x={800} lang={lang} /><Bench x={1262} /><Bin x={1100} /><Cat x={1052} />

      {/* shoppers */}
      <Person x={190} s={1.08} top={ORANGE} bottom="#33466B" hair="#2B2B33" woman bag={NAVY} />
      <Person x={348} s={1.12} top="#33466B" bottom={NAVY} hair="#3A2A22" bag={ORANGE} flip />
      <Person x={600} s={1.04} top="#FFFFFF" bottom="#6C7A99" hair="#6B3F2A" woman bag={ORANGE} />
      <Person x={552} s={0.62} top={ORANGE} bottom={NAVY} hair="#2B2B33" woman />
      <g stroke="#9AA3B2" strokeWidth="1" fill="none"><path d="M566 482 Q570 500 560 520" /></g><ellipse cx="566" cy="472" rx="9" ry="11" fill={ORANGE} /><path d="M566 483 l-2 4 h4 z" fill={ORANGE} />
      <Person x={1000} s={1.1} top="#6C7A99" bottom={NAVY} hair="#2B2B33" flip />
      <Person x={1312} s={1.04} top={NAVY} bottom="#F9B58F" hair="#3A2A22" woman bag={ORANGE} flip />
      <Person x={1500} s={1.08} top="#FFFFFF" bottom={NAVY} hair="#2B2B33" bag={NAVY} />
      <Person x={1548} s={1.0} top={ORANGE} bottom="#6C7A99" hair="#6B3F2A" woman />

      <Tuktuk x={330} /><Tuktuk x={1180} flip />
    </svg>
  );
}

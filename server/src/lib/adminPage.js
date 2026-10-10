/** Platform admin page at /admin. Talks to /api/admin with the key typed in (kept in memory only). */
export const ADMIN_HTML = `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="icon" href="/favicon.svg"><title>Banha Outfit · الإدارة</title>
<style>
:root{--gold:#C9A24D;--ink:#141416}
body{font-family:system-ui,Tahoma,sans-serif;background:#f4f2ee;margin:0;padding:20px;color:#1b1b1b}
header{display:flex;align-items:center;gap:10px}header img{width:40px;height:40px}
h1{font-size:20px;margin:0}h2{font-size:16px;margin:0 0 12px}.muted{color:#777;font-size:13px}
.card{background:#fff;border-radius:14px;padding:16px;margin-top:16px;box-shadow:0 1px 3px rgba(0,0,0,.06);overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:14px;min-width:900px}td,th{padding:9px 6px;border-bottom:1px solid #eee;text-align:start;vertical-align:middle}
.grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(200px,1fr))}
label{font-size:13px;display:grid;gap:4px}
input,select{padding:8px 10px;border:1px solid #ccc;border-radius:8px;font:inherit}
input.num{width:56px;padding:6px}
button{padding:6px 11px;border-radius:8px;border:0;background:var(--ink);color:#fff;cursor:pointer;font:inherit;font-size:13px;margin:2px}
.ok{background:#128C7E}.off{background:#9a9a9a}.gold{background:var(--gold);color:#111}.danger{background:#b00020}
.err{color:#b00020;margin-top:8px}.good{color:#0d6e55;margin-top:8px;word-break:break-all}
.link{background:#f7f3e8;border:1px dashed var(--gold);border-radius:10px;padding:10px;margin-top:10px;word-break:break-all;font-size:13px}
</style></head><body>
<header><img src="/favicon.svg" alt=""><div><h1>Banha Outfit · لوحة الإدارة</h1><div class="muted" id="status"></div></div></header>

<div class="card">
  <label>مفتاح الإدارة <input id="key" type="password" autocomplete="off" style="max-width:320px"></label>
  <button id="load">دخول</button>
  <div class="err" id="err"></div>
  <div class="link" id="linkBox" hidden></div>
</div>

<div class="card" id="createBox" hidden>
  <h2>إضافة محل جديد</h2>
  <form id="createForm" class="grid">
    <label>اسم المحل<input name="store_name" required minlength="2"></label>
    <label>اسم الصاحب<input name="owner_name" required minlength="2"></label>
    <label>إيميل الدخول<input name="email" type="email" required></label>
    <label>رقم التليفون<input name="phone" required pattern="01[0125][0-9]{8}" inputmode="tel" placeholder="01xxxxxxxxx"></label>
    <label>واتساب المحل (لو مختلف)<input name="whatsapp" pattern="01[0125][0-9]{8}" inputmode="tel"></label>
    <label>العنوان<input name="address" placeholder="شارع ...، بنها"></label>
    <label>لينك اللوكيشن (جوجل ماب)<input name="map_url" type="url" placeholder="https://maps.app.goo.gl/..."></label>
    <label>بيفتح الساعة<input name="opens_at" type="time" value="10:00"></label>
    <label>بيقفل الساعة<input name="closes_at" type="time" value="23:00"></label>
    <fieldset style="border:0;padding:0;margin:0"><legend>أقسام المحل (اختار واحد أو أكتر)</legend><div style="display:flex;flex-wrap:wrap;gap:8px 14px;margin-top:6px"><label class="chk"><input type="checkbox" name="dept" value="women"> حريمي</label><label class="chk"><input type="checkbox" name="dept" value="men"> رجالي</label><label class="chk"><input type="checkbox" name="dept" value="kids"> أطفال</label><label class="chk"><input type="checkbox" name="dept" value="shoes"> كوتشيات وأحذية</label><label class="chk"><input type="checkbox" name="dept" value="bags"> شنط</label><label class="chk"><input type="checkbox" name="dept" value="hijab"> طرح وحجاب</label><label class="chk"><input type="checkbox" name="dept" value="abaya"> عبايات</label><label class="chk"><input type="checkbox" name="dept" value="jalabiya"> جلاليب</label><label class="chk"><input type="checkbox" name="dept" value="underwear"> ملابس داخلية</label><label class="chk"><input type="checkbox" name="dept" value="wedding_dress"> فساتين أفراح</label><label class="chk"><input type="checkbox" name="dept" value="wedding_suit"> بدل أفراح</label><label class="chk"><input type="checkbox" name="dept" value="sports"> رياضي</label><label class="chk"><input type="checkbox" name="dept" value="denim"> جينز</label><label class="chk"><input type="checkbox" name="dept" value="accessories"> إكسسوارات</label></div></fieldset>
    <label style="align-content:end"><span><input type="checkbox" name="auto_whatsapp"> إشعار واتساب تلقائي</span></label>
    <div style="align-self:end"><button type="submit" class="gold">إنشاء المحل + لينك التفعيل</button></div>
  </form>
  <div class="muted">صاحب المحل بيختار الباسورد بنفسه من لينك التفعيل (صالح 7 أيام ولمرة واحدة).</div>
  <div class="err" id="createErr"></div>
</div>

<div class="card" id="listBox" hidden>
  <h2>المحلات</h2>
  <table>
    <thead><tr><th>ترتيب</th><th>المحل</th><th>الصاحب</th><th>منتجات</th><th>طلبات</th><th>في الرئيسية</th><th>مميز</th><th>واتساب تلقائي</th><th>إجراءات</th></tr></thead>
    <tbody id="rows"></tbody>
  </table>
</div>

<div class="card" id="delivBox" hidden>
  <h2>🚚 طلبات التوصيل علينا</h2>
  <div class="muted">الطلبات اللي المحل حوّلها لنا أو مفعّل "بنها أوتفيت توصّل". نستلم لما الحالة "جاهز"، وبعدها نسلّم للعميل ونحصّل المبلغ (كاش).</div>
  <table><thead><tr><th>الطلب</th><th>المحل (الاستلام)</th><th>العميل (التسليم)</th><th>نحصّل</th><th>الحالة</th><th>إجراء</th></tr></thead><tbody id="delivRows"></tbody></table>
  <div class="muted" id="delivEmpty" hidden>مفيش طلبات توصيل دلوقتي.</div>
</div>

<div class="card" id="prodBox" hidden>
  <h2 id="prodTitle"></h2>
  <div class="muted">المنتجات المثبتة بتظهر الأول في صفحة المحل.</div>
  <table><thead><tr><th>المنتج</th><th>السعر</th><th>المخزون</th><th>مثبت</th></tr></thead><tbody id="prodRows"></tbody></table>
</div>

<script>
const $ = (id) => document.getElementById(id);
let key = '';
async function call(path, opts = {}) {
  const res = await fetch('/api/admin' + path, { method: opts.method || 'GET', body: opts.body ? JSON.stringify(opts.body) : undefined,
    headers: { 'Content-Type': 'application/json', 'x-admin-key': key } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || res.statusText);
  return data;
}
const fail = (e) => { $('err').textContent = e.message; };
function cell(tr, text) { const td = document.createElement('td'); if (text !== undefined) td.textContent = text; tr.appendChild(td); return td; }
function btn(label, cls, onclick) { const b = document.createElement('button'); b.textContent = label; b.className = cls || ''; b.onclick = onclick; return b; }
function toggle(td, s, field, on, off, cls) {
  const b = btn('', '', async () => {
    try { await call('/stores/' + s.slug, { method: 'PATCH', body: { [field]: !s[field] } }); s[field] = !s[field]; paint(); } catch (e) { fail(e); }
  });
  const paint = () => { b.textContent = s[field] ? on : off; b.className = s[field] ? cls : 'off'; };
  paint(); td.appendChild(b);
}
function showLink(title, url, expires) {
  const box = $('linkBox'); box.hidden = false;
  box.textContent = title + ': ' + url + (expires ? '  (ينتهي ' + new Date(expires).toLocaleDateString('ar-EG') + ')' : '');
  try { navigator.clipboard.writeText(url); box.textContent += ' ✔ اتنسخ'; } catch {}
  box.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function paintRows(stores) {
  const tb = $('rows'); tb.innerHTML = '';
  for (const s of stores) {
    const tr = document.createElement('tr');
    const ord = document.createElement('input'); ord.type = 'number'; ord.className = 'num'; ord.value = s.sort_order; ord.min = 0;
    ord.onchange = async () => { try { await call('/stores/' + s.slug, { method: 'PATCH', body: { sort_order: Number(ord.value) } }); s.sort_order = Number(ord.value); } catch (e) { fail(e); } };
    cell(tr).appendChild(ord);
    cell(tr, s.name_ar + ' (' + s.slug + ')');
    cell(tr, s.owner_name + ' · ' + s.owner_email);
    cell(tr, s.products_count);
    cell(tr, s.orders_count);
    s.visible = !s.hidden;
    const vis = cell(tr);
    const vb = btn('', '', async () => {
      try { await call('/stores/' + s.slug, { method: 'PATCH', body: { hidden: s.visible } }); s.visible = !s.visible; pv(); } catch (e) { fail(e); }
    });
    const pv = () => { vb.textContent = s.visible ? 'ظاهر' : 'مخفي'; vb.className = s.visible ? 'ok' : 'off'; };
    pv(); vis.appendChild(vb);
    toggle(cell(tr), s, 'featured', 'مميز ★', 'عادي', 'gold');
    toggle(cell(tr), s, 'auto_whatsapp', 'مفعّل', 'موقف', 'ok');
    const act = cell(tr);
    act.appendChild(btn('المنتجات', '', () => loadProducts(s)));
    act.appendChild(btn('لينك التفعيل', 'gold', async () => {
      try { const r = await call('/stores/' + s.slug + '/setup-link', { method: 'POST', body: {} }); showLink('لينك تفعيل ' + s.name_ar, r.url, r.expires); } catch (e) { fail(e); }
    }));
    act.appendChild(btn('ادخل لوحته', '', async () => {
      try { const { token } = await call('/stores/' + s.slug + '/login-as', { method: 'POST', body: {} }); localStorage.setItem('souqna.token', token); window.open('/dashboard/products', '_blank'); } catch (e) { fail(e); }
    }));
    act.appendChild(btn('صفحته', '', () => window.open('/s/' + s.slug, '_blank')));
    act.appendChild(btn('حذف', 'danger', async () => {
      const typed = prompt('الحذف نهائي ومش هيترجع (المنتجات والطلبات كلها). اكتب ' + s.slug + ' للتأكيد:');
      if (typed !== s.slug) return;
      try { await call('/stores/' + s.slug, { method: 'DELETE', body: { confirm: typed } }); await load(); } catch (e) { fail(e); }
    }));
    tb.appendChild(tr);
  }
}
async function loadProducts(s) {
  try {
    const { products } = await call('/stores/' + s.slug + '/products');
    $('prodTitle').textContent = 'منتجات ' + s.name_ar;
    const tb = $('prodRows'); tb.innerHTML = '';
    for (const p of products) {
      const tr = document.createElement('tr');
      cell(tr, p.name_ar); cell(tr, p.price + ' ج.م'); cell(tr, p.stock);
      const b = btn('', '', async () => {
        try { await call('/stores/' + s.slug + '/products/' + p.id, { method: 'PATCH', body: { featured: !p.featured } }); p.featured = !p.featured; paint(); } catch (e) { fail(e); }
      });
      const paint = () => { b.textContent = p.featured ? 'مثبت 📌' : 'تثبيت'; b.className = p.featured ? 'gold' : 'off'; };
      paint(); cell(tr).appendChild(b); tb.appendChild(tr);
    }
    $('prodBox').hidden = false; $('prodBox').scrollIntoView({ behavior: 'smooth' });
  } catch (e) { fail(e); }
}
const STATUS_AR = { pending: 'جديد (المحل لسه مأكدش)', confirmed: 'اتأكد — المحل بيجهزه', processing: 'جاهز للاستلام ✅', shipped: 'معانا في الطريق' };
async function loadDeliveries() {
  const { orders } = await call('/deliveries');
  const tb = $('delivRows'); tb.innerHTML = '';
  $('delivEmpty').hidden = orders.length > 0;
  for (const o of orders) {
    const tr = document.createElement('tr');
    cell(tr, '#' + o.number);
    cell(tr, o.store_name + ' · ' + (o.store_phone || '') + ' · ' + (o.store_address || ''));
    cell(tr, o.customer_name + ' · ' + o.phone + ' · ' + [o.governorate, o.city, o.address].filter(Boolean).join('، '));
    cell(tr, o.total + ' ج.م');
    cell(tr, STATUS_AR[o.status] || o.status);
    const td = cell(tr);
    if (o.status === 'processing') td.appendChild(btn('استلمناه من المحل', 'gold', async () => { try { await call('/orders/' + o.id + '/status', { method: 'PATCH', body: { status: 'shipped' } }); await loadDeliveries(); } catch (e) { fail(e); } }));
    if (o.status === 'shipped') td.appendChild(btn('تم التسليم للعميل', 'ok', async () => { try { await call('/orders/' + o.id + '/status', { method: 'PATCH', body: { status: 'delivered' } }); await loadDeliveries(); } catch (e) { fail(e); } }));
    tb.appendChild(tr);
  }
  $('delivBox').hidden = false;
}
async function load() {
  $('err').textContent = '';
  const st = await call('/status');
  $('status').textContent = 'واتساب API: ' + (st.whatsappConfigured ? 'متوصل' : 'غير متوصل') + ' · قالب: ' + st.template + ' · التسجيل العام: ' + (st.registrationOpen ? 'مفتوح' : 'مقفول');
  paintRows((await call('/stores')).stores);
  $('createBox').hidden = false; $('listBox').hidden = false;
  await loadDeliveries();
}
$('load').onclick = async () => {
  key = $('key').value.trim();
  try { await load(); } catch (e) { fail(e); $('listBox').hidden = true; $('createBox').hidden = true; }
};
$('createForm').onsubmit = async (e) => {
  e.preventDefault();
  $('createErr').textContent = '';
  const f = new FormData(e.target);
  const body = Object.fromEntries([...f.entries()].filter(([k, v]) => v !== '' && k !== 'auto_whatsapp' && k !== 'dept'));
  body.departments = f.getAll('dept');
  if (!body.departments.length) { $('createErr').textContent = 'اختار قسم واحد على الأقل'; return; }
  body.auto_whatsapp = f.get('auto_whatsapp') === 'on';
  try {
    const r = await call('/stores', { method: 'POST', body });
    e.target.reset(); await load();
    showLink('تم إنشاء ' + body.store_name + ' — ابعت اللينك ده لصاحب المحل', r.setup.url, r.setup.expires);
  } catch (err) { $('createErr').textContent = err.message; }
};
</script></body></html>`;

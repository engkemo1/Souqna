import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Info, X } from 'lucide-react';

// One short line per admin page: what it is for and what to do here. Keyed by path (and ?section= for the system page).
const HELP = {
  '/admin': 'ملخص اليوم: الطلبات والمحلات والتنبيهات اللي محتاجة تصرف منك. ابدأ من هنا كل يوم.',
  '/admin/stores': 'كل المحلات المسجلة. تقدر تفعّل المحل أو توقفه، وتدخل على إدارته وتشوف حالته.',
  '/admin/subscriptions': 'باقات اشتراك المحلات: مين مشترك، وإمتى بيخلص، وتجديد أو تعديل الباقة.',
  '/admin/departments': 'أقسام السوق الرئيسية. وافق على طلبات الأقسام الجديدة أو ارفضها، ورتّب الموجود.',
  '/admin/image-library': 'مكتبة الصور اللي بتظهر على الأقسام. ارفع صورة أو غيّر اللي موجودة.',
  '/admin/coupons': 'كوبونات الخصم بتاعة المنصة. اعمل كوبون جديد، حدد قيمته ومدته، أو وقّفه.',
  '/admin/ads': 'بانر الصفحة الرئيسية القديم. لإعلانات المحلات والعروض المميزة استخدم صفحة "الإعلانات والعروض المميزة".',
  '/admin/featured': 'الإعلانات والعروض المميزة: اعمل حملة (إعلان مخصص أو ترويج لعرض محل) واختار مكانها وموعدها، وتابع المشاهدات والنقرات. الحملة المسودة أو الموقوفة أو المنتهية مبتظهرش للعملاء.',
  '/admin/buyers': 'حسابات العملاء المسجلين وبياناتهم الأساسية.',
  '/admin/photos': 'آخر الصور اللي المحلات رفعتها، للمراجعة السريعة.',
  '/admin/orders': 'كل الطلبات على المنصة. ابحث برقم الطلب أو المحل وافتح التفاصيل.',
  '/admin/deliveries': 'طلبات التوصيل علينا: اللي مفتوح واللي جاهز للاستلام وتعيين المندوب.',
  '/admin/delivery-zones': 'مناطق الاستلام والخصم: حدد المناطق اللي بنغطيها وقواعد الخصم فيها.',
  '/admin/delivery-rates': 'رسوم التوصيل لكل منطقة. عدّل السعر وهيتطبق على الطلبات الجديدة.',
  '/admin/delivery-people': 'أفراد الدليفري: أضف مندوب أو اوقف مندوب أو راجع بياناته.',
  '/admin/couriers': 'حساب المندوبين: اللي حصّلوه واللي لسه عليهم، وتسوية الحسابات.',
  '/admin/services': 'طلبات الخدمات من المحلات (تصوير وتصميم بنر وغلاف). افتح الطلب ورد عليه.',
  '/admin/sourcing': 'طلبات "من برّه": عملاء بيطلبوا حاجة مش موجودة، تابعها وردّ عليها.',
  '/admin/alerts': 'التنبيهات اللي محتاجة متابعة: طلبات متأخرة ومشاكل تشغيل. اتعامل معاها من فوق لتحت.',
  '/admin/growth': 'النمو وصحة الكتالوج: الأكثر طلباً، مشاكل SEO، المنتجات الناقصة، وشرائح العملاء مع تصدير CSV.',
  '/admin/traffic': 'زيارات الموقع: مين دخل منين وإيه الصفحات الأكتر مشاهدة.',
  '/admin/insights': 'تحليلات السوق: المبيعات والمحلات الأفضل والاتجاهات خلال فترة تختارها.',
  '/admin/campaigns': 'حملات الإعلان والإحالة وأثرها على الطلبات.',
  '/admin/reports': 'تقارير جاهزة للمبيعات والعمولات تقدر تراجعها وتصدّرها.',
  '/admin/audit': 'سجل كل حركة إدارية اتعملت ومين عملها وإمتى. للمراجعة والمتابعة.',
};
const SYSTEM = {
  cashier: 'ربط الكاشير: حالة الأجهزة المربوطة والمزامنة مع المحلات.',
  moda: 'المساعد الذكي: إعدادات ومتابعة جودة ردوده على العملاء.',
  visual: 'البحث المرئي: حالة النموذج ونتايج التجارب.',
  security: 'السيرفر والنسخ الاحتياطي: صحة السيرفر وآخر نسخة احتياطية واستخدام المساحة.',
};

export function helpFor(pathname, search = '') {
  const p = pathname.replace(/\/+$/, '') || '/admin';
  if (p === '/admin/system') return SYSTEM[new URLSearchParams(search).get('section') || 'security'] || null;
  return HELP[p] || null;
}

export default function PageHelp() {
  const { pathname, search } = useLocation();
  const text = helpFor(pathname, search);
  const key = `bo.help.${pathname}${pathname === '/admin/system' ? search : ''}`;
  const [hidden, setHidden] = useState(false);
  useEffect(() => { try { setHidden(localStorage.getItem(key) === '1'); } catch { setHidden(false); } }, [key]);
  if (!text) return null;
  const hide = (v) => { setHidden(v); try { v ? localStorage.setItem(key, '1') : localStorage.removeItem(key); } catch { /* ignore */ } };
  if (hidden) return (
    <button type="button" onClick={() => hide(false)} className="mb-3 inline-flex items-center gap-1.5 text-xs text-muted hover:text-fg"><Info className="h-3.5 w-3.5" />اعرض الشرح</button>
  );
  return (
    <div role="note" className="mb-5 flex items-start gap-3 rounded-2xl border border-line bg-elevated px-4 py-3 text-sm leading-relaxed text-muted">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
      <p className="min-w-0 flex-1">{text}</p>
      <button type="button" aria-label="إخفاء الشرح" onClick={() => hide(true)} className="grid h-6 w-6 shrink-0 place-items-center rounded-full hover:bg-fg/[0.06]"><X className="h-3.5 w-3.5" /></button>
    </div>
  );
}

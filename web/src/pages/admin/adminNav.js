import { BarChart3, Ticket, Camera, Tags, LayoutDashboard, Store, ShoppingBag, Truck, MapPin, Wallet, PackagePlus, Package, Users, Megaphone, ScanSearch, Sparkles, CreditCard, Eye, TrendingUp, AlertTriangle, History, MessageCircle, Shirt, BookOpen, Wrench, Images, Film, Banknote, Bike, Activity, MessagesSquare, GraduationCap, Plug, Server } from 'lucide-react';

/**
 * Single source of truth for the admin sidebar AND the in-app guide (/admin/guide).
 * `desc` = one plain sentence: what this section is for. Shown as a tooltip and on the guide page.
 * `badge` keys come from /admin/notifications (see useDeliveryAlerts in AdminApp).
 * Routes are unchanged from before; only grouping, labels and descriptions were reorganised.
 */
export const NAV_GROUPS = [
  { label: 'الرئيسية', items: [
    { to: '/admin', end: true, icon: LayoutDashboard, label: 'نظرة عامة', desc: 'ملخص النهارده: الطلبات والمحلات وأي حاجة محتاجة تصرف منك. ابدأ من هنا كل يوم.' },
    { to: '/admin/alerts', icon: AlertTriangle, label: 'التنبيهات والمتابعة', desc: 'طلبات متأخرة ومشاكل تشغيل لازم تتعامل معاها.' },
    { to: '/admin/guide', icon: BookOpen, label: 'دليل اللوحة', desc: 'شرح كل قسم في اللوحة بيعمل إيه ومتى تستخدمه.' },
  ] },
  { label: 'الطلبات', items: [
    { to: '/admin/orders', icon: ShoppingBag, label: 'الطلبات', desc: 'كل أوردرات المنصة. ابحث برقم الطلب أو المحل وافتح التفاصيل.' },
    { to: '/admin/deliveries', icon: Truck, label: 'التوصيل', badge: 'open', desc: 'طلبات التوصيل علينا: الجاهز للاستلام وتعيين المندوب.' },
    { to: '/admin/sourcing', icon: PackagePlus, label: 'طلبات من برّه', badge: 'sourcing', desc: 'عميل طلب حاجة مش موجودة في بنها: ابعتله السعر وجيبهاله.' },
    { to: '/admin/custom-requests', icon: Shirt, label: 'تصميمات مخصصة', badge: 'custom', desc: 'طلبات تصميم ملابس على الطلب (تخرّج، شركات، سبوع، فساتين…): كلّم العميل واتفق على السعر.' },
    { to: '/admin/services', icon: Wrench, label: 'خدمات المحلات', badge: 'services', desc: 'طلبات المحلات علينا: تصوير، تصميم بنر وغلاف. افتح الطلب ورد عليه.' },
  ] },
  { label: 'المحلات والمنتجات', items: [
    { to: '/admin/stores', icon: Store, label: 'المحلات', desc: 'كل المحلات المسجلة: فعّل المحل أو أوقفه وادخل على إدارته.' },
    { to: '/admin/subscriptions', icon: CreditCard, label: 'اشتراكات المحلات', desc: 'باقات الاشتراك: مين مشترك وإمتى بيخلص وتجديد الباقة.' },
    { to: '/admin/products', icon: Package, label: 'المنتجات والمعاينة', badge: 'products', desc: 'كل المنتجات ومراجعتها: فلتر بالمشكلة (قسم غلط، صورة ضعيفة، اسم مش واضح) وعدّل أو اعتمد.' },
    { to: '/admin/departments', icon: Tags, label: 'الأقسام', badge: 'depts', desc: 'أقسام السوق: وافق على الأقسام الجديدة أو ارفضها ورتّب الموجود.' },
    { to: '/admin/image-library', icon: Images, label: 'مكتبة صور الأقسام', desc: 'الصور اللي بتظهر على الأقسام: ارفع صورة أو غيّر اللي موجودة.' },
    { to: '/admin/photos', icon: Camera, label: 'أحدث الصور', desc: 'آخر صور رفعتها المحلات للمراجعة السريعة.' },
    { to: '/admin/stories', icon: Film, label: 'ستوري المحلات', desc: 'ستوريز المحلات: راجع اللي اتنشر وامسح اللي مش مناسب.' },
  ] },
  { label: 'العملاء والتسويق', items: [
    { to: '/admin/buyers', icon: Users, label: 'العملاء والحسابات', desc: 'حسابات العملاء المسجلين وبياناتهم الأساسية.' },
    { to: '/admin/coupons', icon: Ticket, label: 'الكوبونات', desc: 'كوبونات خصم المنصة: اعمل كوبون وحدد قيمته ومدته أو وقّفه.' },
    { to: '/admin/featured', icon: Sparkles, label: 'الإعلانات', desc: 'كل الإعلانات في صفحة واحدة: اختار نوع الإعلان (مخصص، عرض محل، معلن خارجي)، وشكله، ومكانه، وإيه اللي يحصل لما العميل يضغط عليه.' },
    { to: '/admin/campaigns', icon: Megaphone, label: 'حملات الإحالة', desc: 'حملات الإعلان والإحالة وأثرها على الطلبات.' },
  ] },
  { label: 'شبكة التوصيل', items: [
    { to: '/admin/delivery-zones', icon: MapPin, label: 'مناطق الاستلام والخصم', desc: 'المناطق اللي بنغطيها وقواعد الخصم فيها.' },
    { to: '/admin/delivery-rates', icon: Banknote, label: 'رسوم المناطق', desc: 'سعر التوصيل لكل منطقة. أي تعديل بيتطبق على الطلبات الجديدة.' },
    { to: '/admin/delivery-people', icon: Bike, label: 'أفراد الدليفري', desc: 'المندوبين: أضف مندوب أو أوقفه أو راجع بياناته.' },
    { to: '/admin/couriers', icon: Wallet, label: 'حساب المندوبين', desc: 'اللي حصّلوه واللي لسه عليهم وتسوية الحسابات.' },
  ] },
  { label: 'التحليلات والتقارير', items: [
    { to: '/admin/growth', icon: TrendingUp, label: 'النمو وصحة الكتالوج', desc: 'الأكثر طلباً، مشاكل SEO، المنتجات الناقصة، وشرائح العملاء مع تصدير CSV.' },
    { to: '/admin/traffic', icon: Eye, label: 'الزيارات', desc: 'مين دخل الموقع منين وإيه الصفحات الأكتر مشاهدة.' },
    { to: '/admin/insights', icon: Activity, label: 'تحليلات السوق', desc: 'المبيعات والمحلات الأفضل والاتجاهات في فترة تختارها.' },
    { to: '/admin/reports', icon: BarChart3, label: 'التقارير', desc: 'تقارير جاهزة للمبيعات والعمولات تراجعها وتصدّرها.' },
    { to: '/admin/audit', icon: History, label: 'سجل الحركات', desc: 'كل حركة إدارية اتعملت ومين عملها وإمتى.' },
  ] },
  { label: 'الذكاء الاصطناعي', items: [
    { to: '/admin/system?section=moda', icon: Sparkles, label: 'المساعد الذكي', desc: 'إعدادات المساعد (تويلا) ومتابعة جودة ردوده على العملاء.' },
    { to: '/admin/stylist-log', icon: MessagesSquare, label: 'أسئلة تويلا وسرعتها', desc: 'اللي العملاء سألوه لتويلا وسرعة الرد.' },
    { to: '/admin/stylist/training', icon: GraduationCap, label: 'تدريب تويلا وقواعدها', desc: 'علّم تويلا قواعد وتصحيحات عشان ردودها تتحسن.' },
    { to: '/admin/system?section=visual', icon: ScanSearch, label: 'البحث المرئي', desc: 'البحث بالصورة: حالة النموذج، نتايج التجارب، وإبلاغات «مش شبه».' },
  ] },
  { label: 'الربط والإعدادات', items: [
    { to: '/admin/system?section=whatsapp', icon: MessageCircle, label: 'واتساب', desc: 'ربط واتساب (Meta): رسايل الأوردرات والتكلفة والاختبار.' },
    { to: '/admin/system?section=cashier', icon: Plug, label: 'ربط الكاشير', desc: 'حالة أجهزة الكاشير المربوطة والمزامنة مع المحلات.' },
    { to: '/admin/system?section=security', icon: Server, label: 'السيرفر والنسخ', desc: 'صحة السيرفر والنسخ الاحتياطي واستخدام المساحة.' },
  ] },
];

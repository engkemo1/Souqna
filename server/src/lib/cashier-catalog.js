/**
 * Catalogue of cashier / POS systems a store can be linked to.
 * `connector` says how far the integration is implemented:
 *   'planned' – listed so the admin can record the store's system; no direct connector code yet
 *   'ready'   – the cashier path is implemented (native POS, file import, or store API key)
 * Nothing here syncs data by itself: when a connector is built, flip its `connector`
 * value and add its adapter. IDs are stored in store_cashier_links.cashier_id, never rename them.
 */
export const CASHIER_SYSTEMS = [
  { id: 'twist', name: 'كاشير Twist (إضافي)', kind: 'native', connector: 'ready', note: 'كاشير Souqna المدمج: بيع ومخزون وورديات' },
  { id: 'file_import', name: 'استيراد ملف Excel / CSV', kind: 'file', connector: 'ready', note: 'يصلح لأي برنامج بيصدّر منتجات ومخزون' },
  { id: 'api_key', name: 'مفتاح ربط API', kind: 'api_key', connector: 'ready', note: 'الكاشير أو مبرمجه يبعت المخزون والمبيعات لمفتاح خاص بالمحل' },
  { id: 'odoo', name: 'Odoo', kind: 'api', connector: 'planned', note: 'له API رسمي موثّق' },
  { id: 'qoyod', name: 'قيود (Qoyod)', kind: 'api', connector: 'planned', note: 'له API وتوثيق' },
  { id: 'daftra', name: 'دفترة (Daftra)', kind: 'api', connector: 'planned', note: 'يتأكد من التوثيق قبل التنفيذ' },
  { id: 'dexef', name: 'دفيف (Dexef)', kind: 'api', connector: 'planned', note: 'بوابة مطورين مذكورة، والتقارير تتصدّر Excel' },
  { id: 'loyverse', name: 'Loyverse', kind: 'api', connector: 'planned', note: 'يتأكد من التوثيق قبل التنفيذ' },
  { id: 'foodics', name: 'Foodics', kind: 'api', connector: 'planned', note: 'يتأكد من التوثيق قبل التنفيذ' },
  { id: 'mahaal', name: 'محل (Mahaal)', kind: 'file', connector: 'planned', note: 'لا يوجد API مذكور، يبدأ بالملفات' },
  { id: 'other', name: 'برنامج آخر', kind: 'file', connector: 'planned', note: 'اكتب اسم البرنامج في الملاحظة' },
];

export const CASHIER_IDS = CASHIER_SYSTEMS.map((c) => c.id);
export const CASHIER_LINK_STATUSES = ['none', 'pending', 'active', 'paused'];

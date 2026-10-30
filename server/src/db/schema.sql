PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'owner',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stores (
  id INTEGER PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id),
  slug TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL,
  name_ar TEXT NOT NULL, name_en TEXT NOT NULL,
  tagline_ar TEXT, tagline_en TEXT,
  description_ar TEXT, description_en TEXT,
  category TEXT NOT NULL DEFAULT 'mixed',
  departments TEXT NOT NULL DEFAULT '',
  return_days INTEGER NOT NULL DEFAULT 3,
  delivery_mode TEXT NOT NULL DEFAULT 'store',
  city TEXT NOT NULL DEFAULT 'Banha',
  address_ar TEXT, address_en TEXT,
  phone TEXT, whatsapp TEXT, instagram TEXT, facebook TEXT, tiktok TEXT,
  auto_whatsapp INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  delivery_zone TEXT NOT NULL DEFAULT '',
  search_indexable INTEGER NOT NULL DEFAULT 1,
  map_url TEXT,
  opens_at TEXT, closes_at TEXT, day_off INTEGER,
  hero_mode TEXT NOT NULL DEFAULT 'auto',
  logo_media_id INTEGER, cover_media_id INTEGER,
  logo_initials TEXT NOT NULL DEFAULT '', logo_color TEXT NOT NULL DEFAULT '#1B1B1B',
  theme_json TEXT NOT NULL DEFAULT '{}',
  customization_json TEXT NOT NULL DEFAULT '{}',
  rating REAL NOT NULL DEFAULT 0, rating_count INTEGER NOT NULL DEFAULT 0,
  featured INTEGER NOT NULL DEFAULT 0,
  offer_badge_ar TEXT, offer_badge_en TEXT,
  shipping_fee INTEGER NOT NULL DEFAULT 50,
  free_shipping_over INTEGER NOT NULL DEFAULT 1500,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS media (
  id INTEGER PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'product',
  key TEXT NOT NULL,
  width INTEGER NOT NULL, height INTEGER NOT NULL,
  sizes TEXT NOT NULL,            -- JSON array of generated size names
  original_ext TEXT NOT NULL,
  bytes INTEGER NOT NULL DEFAULT 0,
  color TEXT, lqip TEXT, alt TEXT,
  attached INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name_ar TEXT NOT NULL, name_en TEXT NOT NULL,
  media_id INTEGER REFERENCES media(id) ON DELETE SET NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  UNIQUE(store_id, slug)
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name_ar TEXT NOT NULL, name_en TEXT NOT NULL,
  description_ar TEXT, description_en TEXT,
  price INTEGER NOT NULL,
  compare_at_price INTEGER,
  cost INTEGER,
  sku TEXT,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active',
  featured INTEGER NOT NULL DEFAULT 0,
  is_new INTEGER NOT NULL DEFAULT 0,
  colors_json TEXT NOT NULL DEFAULT '[]',
  sizes_json TEXT NOT NULL DEFAULT '[]',
  track_stock INTEGER NOT NULL DEFAULT 1,
  stock INTEGER NOT NULL DEFAULT 0,
  low_stock_at INTEGER NOT NULL DEFAULT 5,
  sold_count INTEGER NOT NULL DEFAULT 0,
  views INTEGER NOT NULL DEFAULT 0,
  rating REAL NOT NULL DEFAULT 0,
  rating_count INTEGER NOT NULL DEFAULT 0,
  seo_title TEXT, seo_description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  moda_key TEXT,
  UNIQUE(store_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_products_store ON products(store_id, status, created_at);

CREATE TABLE IF NOT EXISTS product_media (
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  is_primary INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, media_id)
);

CREATE TABLE IF NOT EXISTS variants (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  color TEXT, size TEXT,
  sku TEXT,
  stock INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_variants_product ON variants(product_id);

CREATE TABLE IF NOT EXISTS banners (
  id INTEGER PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  media_id INTEGER REFERENCES media(id) ON DELETE SET NULL,
  mobile_media_id INTEGER REFERENCES media(id) ON DELETE SET NULL,
  eyebrow_ar TEXT, eyebrow_en TEXT,
  title_ar TEXT, title_en TEXT,
  subtitle_ar TEXT, subtitle_en TEXT,
  cta_ar TEXT, cta_en TEXT,
  link TEXT,
  align TEXT NOT NULL DEFAULT 'start',
  tone TEXT NOT NULL DEFAULT 'dark',
  mirror_rtl INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS homepage_ads (
  id INTEGER PRIMARY KEY,
  image_url TEXT NOT NULL,
  title_ar TEXT NOT NULL, title_en TEXT NOT NULL,
  subtitle_ar TEXT NOT NULL DEFAULT '', subtitle_en TEXT NOT NULL DEFAULT '',
  cta_ar TEXT NOT NULL DEFAULT '', cta_en TEXT NOT NULL DEFAULT '',
  link TEXT NOT NULL DEFAULT '/search',
  starts_at TEXT, ends_at TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_homepage_ads_live ON homepage_ads(active, position, id);

CREATE TABLE IF NOT EXISTS offers (
  id INTEGER PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  type TEXT NOT NULL,                 -- percentage | fixed | free_shipping
  code TEXT,
  title_ar TEXT NOT NULL, title_en TEXT NOT NULL,
  value INTEGER NOT NULL DEFAULT 0,
  min_subtotal INTEGER NOT NULL DEFAULT 0,
  starts_at TEXT, ends_at TEXT,
  usage_limit INTEGER,
  usage_count INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT,
  governorate TEXT, city TEXT, address TEXT,
  orders_count INTEGER NOT NULL DEFAULT 0,
  total_spent INTEGER NOT NULL DEFAULT 0,
  last_order_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(store_id, phone)
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  number TEXT NOT NULL UNIQUE,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL, phone TEXT NOT NULL,
  governorate TEXT, city TEXT, address TEXT, notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  delivery_by TEXT NOT NULL DEFAULT 'store',
  delivery_group TEXT,
  delivery_route_id TEXT,
  delivery_mode TEXT NOT NULL DEFAULT 'pooled' CHECK (delivery_mode IN ('pooled','split')),
  delivery_fee_status TEXT NOT NULL DEFAULT 'confirmed' CHECK (delivery_fee_status IN ('pending','offered','confirmed','rejected')),
  handoff_at TEXT,
  payment_method TEXT NOT NULL DEFAULT 'cod',
  subtotal INTEGER NOT NULL, discount INTEGER NOT NULL DEFAULT 0,
  shipping INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL,
  delivery_fee_quote INTEGER CHECK (delivery_fee_quote IS NULL OR delivery_fee_quote >= 0),
  shipping_free INTEGER NOT NULL DEFAULT 0,
  courier_cost INTEGER,
  delivery_person_id INTEGER,
  delivery_sponsor_share INTEGER NOT NULL DEFAULT 0 CHECK (delivery_sponsor_share >= 0),
  delivery_sponsor_collected INTEGER NOT NULL DEFAULT 0 CHECK (delivery_sponsor_collected IN (0,1)),
  coupon_code TEXT,
  platform_discount INTEGER NOT NULL DEFAULT 0,
  track_token TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_orders_store ON orders(store_id, created_at);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  variant_id INTEGER,
  name_ar TEXT NOT NULL, name_en TEXT NOT NULL,
  media_id INTEGER,
  color TEXT, size TEXT,
  price INTEGER NOT NULL, qty INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_items_order ON order_items(order_id);

CREATE TABLE IF NOT EXISTS order_events (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL, note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS store_visits (
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  visits INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (store_id, day)
);

-- Daily, page-level aggregate only. No visitor identifiers are retained.
CREATE TABLE IF NOT EXISTS store_page_views (
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  path TEXT NOT NULL,
  page_type TEXT NOT NULL DEFAULT 'page',
  views INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (store_id, day, path)
);

CREATE TABLE IF NOT EXISTS departments (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name_ar TEXT NOT NULL, name_en TEXT NOT NULL,
  sizes_json TEXT NOT NULL DEFAULT '[]',
  sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS service_requests (
  id INTEGER PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'photoshoot',
  plan TEXT NOT NULL DEFAULT 'once',
  items_count INTEGER,
  preferred_date TEXT,
  phone TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  admin_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_service_requests_status ON service_requests(status, created_at);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS store_subscriptions (
  store_id INTEGER PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
  monthly_fee_override INTEGER CHECK (monthly_fee_override IS NULL OR monthly_fee_override >= 0),
  covered_through TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS subscription_periods (
  id INTEGER PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('paid','free')),
  months INTEGER NOT NULL CHECK (months > 0),
  amount INTEGER NOT NULL DEFAULT 0 CHECK (amount >= 0),
  covered_from TEXT NOT NULL,
  covered_through TEXT NOT NULL,
  payment_method TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_subscription_periods_store ON subscription_periods(store_id, id DESC);

CREATE TABLE IF NOT EXISTS delivery_rates (
  id INTEGER PRIMARY KEY,
  governorate TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT '',
  fee INTEGER NOT NULL CHECK (fee >= 0 AND fee <= 5000),
  distance_km REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(governorate, city)
);

CREATE TABLE IF NOT EXISTS delivery_people (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_push_store ON push_subscriptions(store_id);

-- Coupons funded by the platform (Banha Outfit), usable at any store. The discount is recorded per order
-- (orders.platform_discount) so the platform can reimburse stores.
CREATE TABLE IF NOT EXISTS platform_coupons (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,                 -- percentage | fixed | free_shipping
  value INTEGER NOT NULL DEFAULT 0,
  max_discount INTEGER,               -- cap for percentage coupons
  min_subtotal INTEGER NOT NULL DEFAULT 0,
  first_order_only INTEGER NOT NULL DEFAULT 0,
  per_phone_limit INTEGER NOT NULL DEFAULT 1,
  title_ar TEXT NOT NULL, title_en TEXT NOT NULL,
  starts_at TEXT, ends_at TEXT,
  usage_limit INTEGER,
  usage_count INTEGER NOT NULL DEFAULT 0,
  promoted INTEGER NOT NULL DEFAULT 0,  -- show on the marketplace home
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Visual search: one image embedding per product (its primary photo), tagged with the model that produced it.
CREATE TABLE IF NOT EXISTS product_vectors (
  product_id INTEGER PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  media_id INTEGER NOT NULL,
  model TEXT NOT NULL,
  vec BLOB NOT NULL
);

-- Visual search vectors, one row per (product, model, slot): several catalogue photos per product ('m<mediaId>'), several models side by side
-- (the colour model is always kept as a safety net), and later vectors learned from customers ('c<n>'). `hist` = colour histogram of that photo.
CREATE TABLE IF NOT EXISTS visual_vectors (
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  slot TEXT NOT NULL,
  media_id INTEGER,
  vec BLOB NOT NULL,
  hist BLOB,
  PRIMARY KEY (product_id, model, slot)
);
CREATE INDEX IF NOT EXISTS idx_visual_vectors_model ON visual_vectors(model);

-- Visual search: dominant-colour histogram of each product's primary photo (re-ranks / vetoes colour mismatches).
CREATE TABLE IF NOT EXISTS product_colors (
  product_id INTEGER PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  media_id INTEGER NOT NULL,
  hist BLOB NOT NULL
);

-- Visual search demand log: one row per detected piece of every photo search. No photo and no IP are stored —
-- `visitor` is a daily-salted hash, only used to count distinct people. Powers the "what are people looking for?" reports.
CREATE TABLE IF NOT EXISTS visual_searches (
  id INTEGER PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  visitor TEXT NOT NULL,
  model TEXT NOT NULL,
  family TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '',
  department TEXT NOT NULL DEFAULT '',
  found INTEGER NOT NULL,
  results INTEGER NOT NULL DEFAULT 0,
  best REAL
);
CREATE INDEX IF NOT EXISTS idx_visual_searches_found ON visual_searches(found, created_at);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  rating INTEGER NOT NULL,
  comment TEXT,
  media_ids TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'published',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(order_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_reviews_store ON reviews(store_id, created_at);

-- "Not in Banha? We get it for you": platform-level sourcing requests (inspection before handover is part of the promise)
CREATE TABLE IF NOT EXISTS sourcing_requests (
  id INTEGER PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  track_token TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL, details TEXT, link TEXT, size TEXT, color TEXT, budget INTEGER,
  photo TEXT,
  name TEXT NOT NULL, phone TEXT NOT NULL, governorate TEXT, city TEXT, address TEXT NOT NULL,
  source TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  quote_price INTEGER,
  admin_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sourcing_status ON sourcing_requests(status, created_at);

-- Optional shopper accounts (mobile + password). Browsing and checkout never require one.
CREATE TABLE IF NOT EXISTS buyers (
  id INTEGER PRIMARY KEY,
  phone TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS buyer_notifications (
  id INTEGER PRIMARY KEY,
  buyer_id INTEGER NOT NULL REFERENCES buyers(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT, url TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_bn_buyer ON buyer_notifications(buyer_id, read, id);
CREATE TABLE IF NOT EXISTS buyer_push (
  id INTEGER PRIMARY KEY,
  buyer_id INTEGER NOT NULL REFERENCES buyers(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL, auth TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS buyer_watches (
  buyer_id INTEGER NOT NULL REFERENCES buyers(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (buyer_id, product_id)
);
CREATE TABLE IF NOT EXISTS buyer_follows (
  buyer_id INTEGER NOT NULL REFERENCES buyers(id) ON DELETE CASCADE,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (buyer_id, store_id)
);
CREATE TABLE IF NOT EXISTS buyer_stylist_chats (
  id INTEGER PRIMARY KEY,
  buyer_id INTEGER NOT NULL REFERENCES buyers(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'محادثة مودة',
  messages_json TEXT NOT NULL,
  session_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_bsc_buyer_updated ON buyer_stylist_chats(buyer_id, updated_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS shared_looks (
  token TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  items_json TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'look',  -- 'look' (from Moda) | 'visual' (results of a photo search)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Which cashier/POS system each store uses (set by the platform admin). Recording only: no sync runs from this table yet.
CREATE TABLE IF NOT EXISTS store_cashier_links (
  store_id INTEGER PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
  cashier_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('none','pending','active','paused')),
  note TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A store's private key for pushing stock/sales from its own cashier. Only a SHA-256 hash is stored.
CREATE TABLE IF NOT EXISTS store_cashier_keys (
  store_id INTEGER PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT
);
-- One row per file import or API call, so the admin can see what changed and what failed.
CREATE TABLE IF NOT EXISTS cashier_sync_log (
  id INTEGER PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  source TEXT NOT NULL,            -- 'file' | 'api'
  kind TEXT NOT NULL,              -- 'stock' | 'sale' | 'return'
  ok INTEGER NOT NULL DEFAULT 1,
  matched INTEGER NOT NULL DEFAULT 0,
  updated INTEGER NOT NULL DEFAULT 0,
  unmatched INTEGER NOT NULL DEFAULT 0,
  message TEXT NOT NULL DEFAULT '',
  details_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cashier_sync_log_store ON cashier_sync_log(store_id, id DESC);
-- Sales/returns already applied, keyed by the cashier's own id so a retry never deducts stock twice.
CREATE TABLE IF NOT EXISTS cashier_events (
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  request_hash TEXT,
  result_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (store_id, external_id)
);

-- Payments for the cashier add-on (independent of the main Twist subscription).
CREATE TABLE IF NOT EXISTS cashier_subscription_periods (
  id INTEGER PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  months INTEGER NOT NULL CHECK (months > 0),
  amount INTEGER NOT NULL DEFAULT 0 CHECK (amount >= 0),
  covered_from TEXT NOT NULL,
  covered_through TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cashier_sub_store ON cashier_subscription_periods(store_id, id DESC);

-- ---------------------------------------------------------------- Twist cashier (POS)
-- Invoices are never edited or deleted. A return is its own record.
CREATE TABLE IF NOT EXISTS pos_sales (
  id INTEGER PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  uuid TEXT NOT NULL,                       -- made on the device, so a retry never makes a second invoice
  number INTEGER NOT NULL,                  -- official invoice number, per store, assigned by the server
  local_no TEXT NOT NULL DEFAULT '',        -- the temporary number printed while offline
  subtotal INTEGER NOT NULL,
  discount INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL,
  paid INTEGER NOT NULL,
  change_due INTEGER NOT NULL DEFAULT 0,
  cashier_name TEXT NOT NULL DEFAULT '',
  customer_name TEXT NOT NULL DEFAULT '',
  customer_phone TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  device_at TEXT NOT NULL,                  -- when the sale really happened (device clock)
  shift_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(store_id, uuid),
  UNIQUE(store_id, number)
);
CREATE INDEX IF NOT EXISTS idx_pos_sales_day ON pos_sales(store_id, device_at);

-- A cashier device has its own register and cash drawer session. Shifts are never deleted.
CREATE TABLE IF NOT EXISTS pos_registers (
  id INTEGER PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  device_key TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'الكاشير الرئيسي',
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(store_id, device_key)
);
CREATE TABLE IF NOT EXISTS pos_shifts (
  id INTEGER PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  register_id INTEGER NOT NULL REFERENCES pos_registers(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open','closed')),
  opening_cash INTEGER NOT NULL DEFAULT 0 CHECK (opening_cash >= 0),
  opened_by TEXT NOT NULL DEFAULT '',
  opened_at TEXT NOT NULL DEFAULT (datetime('now')),
  closed_by TEXT NOT NULL DEFAULT '',
  closed_at TEXT,
  counted_cash INTEGER,
  expected_cash INTEGER,
  difference INTEGER,
  note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_pos_shifts_register ON pos_shifts(store_id, register_id, id DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_one_open_shift_per_register ON pos_shifts(register_id) WHERE state='open';
CREATE TABLE IF NOT EXISTS pos_cash_movements (
  id INTEGER PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  shift_id INTEGER NOT NULL REFERENCES pos_shifts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('in','out')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  reason TEXT NOT NULL,
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pos_cash_movements_shift ON pos_cash_movements(shift_id, id);

CREATE TABLE IF NOT EXISTS pos_sale_items (
  id INTEGER PRIMARY KEY,
  sale_id INTEGER NOT NULL REFERENCES pos_sales(id) ON DELETE CASCADE,
  product_id INTEGER, variant_id INTEGER,
  name TEXT NOT NULL, color TEXT NOT NULL DEFAULT '', size TEXT NOT NULL DEFAULT '',
  sku TEXT NOT NULL DEFAULT '', barcode TEXT NOT NULL DEFAULT '',
  price INTEGER NOT NULL, qty INTEGER NOT NULL, discount INTEGER NOT NULL DEFAULT 0,
  returned_qty INTEGER NOT NULL DEFAULT 0,
  no_return INTEGER NOT NULL DEFAULT 0,
  return_until TEXT,
  oversold INTEGER NOT NULL DEFAULT 0       -- 1 = stock on the server was lower than what was sold
);
CREATE INDEX IF NOT EXISTS idx_pos_items_sale ON pos_sale_items(sale_id);

CREATE TABLE IF NOT EXISTS pos_payments (
  id INTEGER PRIMARY KEY,
  sale_id INTEGER NOT NULL REFERENCES pos_sales(id) ON DELETE CASCADE,
  method TEXT NOT NULL CHECK (method IN ('cash','card','wallet')),
  amount INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS pos_returns (
  id INTEGER PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  sale_id INTEGER NOT NULL REFERENCES pos_sales(id) ON DELETE CASCADE,
  uuid TEXT NOT NULL,
  refund INTEGER NOT NULL,
  method TEXT NOT NULL DEFAULT 'cash',
  reason TEXT NOT NULL DEFAULT '',
  cashier_name TEXT NOT NULL DEFAULT '',
  shift_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(store_id, uuid)
);
CREATE TABLE IF NOT EXISTS pos_return_items (
  id INTEGER PRIMARY KEY,
  return_id INTEGER NOT NULL REFERENCES pos_returns(id) ON DELETE CASCADE,
  sale_item_id INTEGER NOT NULL REFERENCES pos_sale_items(id) ON DELETE CASCADE,
  qty INTEGER NOT NULL, amount INTEGER NOT NULL,
  defective INTEGER NOT NULL DEFAULT 0
);

-- Every stock change made by the cashier, so a number can always be explained.
CREATE TABLE IF NOT EXISTS stock_movements (
  id INTEGER PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL, variant_id INTEGER,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,                     -- 'pos_sale' | 'pos_return'
  ref TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_stock_mov ON stock_movements(store_id, id DESC);
CREATE TABLE IF NOT EXISTS pos_stock_receipts (
  id INTEGER PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  uuid TEXT NOT NULL,
  product_id INTEGER NOT NULL,
  variant_id INTEGER,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(store_id, uuid)
);

-- Explicitly approved, store-private corrections to product photo suggestions.
CREATE TABLE IF NOT EXISTS pos_ai_product_lessons (
  id INTEGER PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  suggested_json TEXT NOT NULL,
  corrected_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pos_ai_product_lessons_store ON pos_ai_product_lessons(store_id, id DESC);

-- ---------------------------------------------------------------- promotions (العروض والخصومات)
-- Store-level promotional offers evaluated by lib/promotions/engine.js. The legacy `offers` table above is the coupon-code system and is untouched.
-- rules_json is the single source of truth for what an offer does; promotion_targets is a derived index (rebuilt on every save) so
-- "which offers include this product / category" is one indexed lookup.
CREATE TABLE IF NOT EXISTS promotions (
  id INTEGER PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name_ar TEXT NOT NULL, name_en TEXT,
  description_ar TEXT, description_en TEXT,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused')),
  priority INTEGER NOT NULL DEFAULT 0,
  stacking TEXT NOT NULL DEFAULT 'per_product' CHECK (stacking IN ('exclusive','per_product','stackable')),
  stack_with_coupons INTEGER NOT NULL DEFAULT 1,
  image_media_id INTEGER REFERENCES media(id) ON DELETE SET NULL,
  template_key TEXT,
  starts_at TEXT, ends_at TEXT,                         -- Cairo wall-clock 'YYYY-MM-DDTHH:MM'
  daily_from TEXT, daily_to TEXT,                       -- optional daily window 'HH:MM' (Cairo); from > to wraps past midnight
  days_mask INTEGER NOT NULL DEFAULT 127,               -- bit 0 = Sunday ... bit 6 = Saturday
  usage_limit INTEGER,                                  -- total orders that may use it
  per_customer_limit INTEGER,                           -- per phone number
  audience TEXT NOT NULL DEFAULT 'all' CHECK (audience IN ('all','new','returning','phones')),
  audience_phones_json TEXT NOT NULL DEFAULT '[]',
  rules_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_promotions_store ON promotions(store_id, status);

CREATE TABLE IF NOT EXISTS promotion_targets (
  promotion_id INTEGER NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('qualify','reward','exclude','gift')),
  target_type TEXT NOT NULL CHECK (target_type IN ('all','product','category')),
  target_id INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (promotion_id, role, target_type, target_id)
);
CREATE INDEX IF NOT EXISTS idx_promo_targets_lookup ON promotion_targets(target_type, target_id);

-- What each order actually received (a snapshot, so editing or deleting an offer later never rewrites history).
CREATE TABLE IF NOT EXISTS order_promotions (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  promotion_id INTEGER REFERENCES promotions(id) ON DELETE SET NULL,
  store_id INTEGER NOT NULL,
  name_ar TEXT NOT NULL, name_en TEXT,
  type TEXT NOT NULL,
  discount INTEGER NOT NULL DEFAULT 0,
  applications INTEGER NOT NULL DEFAULT 1,
  detail_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_order_promos_promo ON order_promotions(promotion_id);
CREATE INDEX IF NOT EXISTS idx_order_promos_order ON order_promotions(order_id);

-- Impressions/clicks for offer performance (daily aggregate, no visitor identifiers).
CREATE TABLE IF NOT EXISTS promotion_views (
  promotion_id INTEGER NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (promotion_id, day)
);

-- Shared promotional image library: one image per (offer type, product category) pair, stored ONCE in the existing photo storage
-- (R2 when configured, otherwise the media folder) under offer-templates/ and reused by every store. Only references live here.
-- category_key 'general' is the neutral fallback; new product categories are just new rows in offer_image_categories (no code change).
CREATE TABLE IF NOT EXISTS offer_image_categories (
  key TEXT PRIMARY KEY,
  name_ar TEXT NOT NULL, name_en TEXT NOT NULL,
  department_slugs_json TEXT NOT NULL DEFAULT '[]',   -- department slugs (or their parents) whose products use this category's images
  sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS offer_templates (
  offer_type TEXT NOT NULL,
  category_key TEXT NOT NULL DEFAULT 'general',
  file TEXT NOT NULL,                     -- object name under offer-templates/, content-hashed so a new design busts caches
  sha256 TEXT NOT NULL,
  remote INTEGER NOT NULL DEFAULT 0,      -- 1 = stored in R2
  width INTEGER, height INTEGER, bytes INTEGER,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (offer_type, category_key)
);

-- Who changed which offer and when (kept after the offer is deleted).
CREATE TABLE IF NOT EXISTS promotion_audit (
  id INTEGER PRIMARY KEY,
  store_id INTEGER NOT NULL,
  promotion_id INTEGER,
  promotion_name TEXT,
  action TEXT NOT NULL,            -- created | updated | activated | paused | drafted | duplicated | deleted
  actor_id INTEGER, actor_name TEXT,
  detail_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_promo_audit_store ON promotion_audit(store_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_promo_audit_promo ON promotion_audit(promotion_id, id DESC);

-- Online-order returns: what was handed back, what was refunded (net of the offer discount) and whether it went back on the shelf.
CREATE TABLE IF NOT EXISTS order_returns (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  store_id INTEGER NOT NULL,
  order_item_id INTEGER NOT NULL,
  qty INTEGER NOT NULL,
  refund INTEGER NOT NULL DEFAULT 0,
  restocked INTEGER NOT NULL DEFAULT 1,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_order_returns_order ON order_returns(order_id);

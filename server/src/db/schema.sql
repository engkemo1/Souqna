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
  delivery_mode TEXT NOT NULL DEFAULT 'store',
  city TEXT NOT NULL DEFAULT 'Banha',
  address_ar TEXT, address_en TEXT,
  phone TEXT, whatsapp TEXT, instagram TEXT, facebook TEXT,
  auto_whatsapp INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  map_url TEXT,
  opens_at TEXT, closes_at TEXT, day_off INTEGER,
  hero_mode TEXT NOT NULL DEFAULT 'auto',
  logo_media_id INTEGER, cover_media_id INTEGER,
  theme_json TEXT NOT NULL DEFAULT '{}',
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
  handoff_at TEXT,
  payment_method TEXT NOT NULL DEFAULT 'cod',
  subtotal INTEGER NOT NULL, discount INTEGER NOT NULL DEFAULT 0,
  shipping INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL,
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

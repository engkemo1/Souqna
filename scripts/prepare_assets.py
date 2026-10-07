#!/usr/bin/env python3
"""
Builds server/seed-assets/ from two open-source photo sets:
  * Magento 2 sample data (Luma studio photography, AFL-3.0)  -> SRC_M2
  * Sylius fixtures (lifestyle photography, MIT)              -> SRC_SY

Outputs product photos, banner/cover composites, logos and catalog.json,
which `npm run seed` then pushes through the real media pipeline.
Run once; the generated folder is committed so seeding works offline.
"""
import json, os, random, shutil, sys
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFont, ImageFilter
from fontTools.ttLib import TTFont

random.seed(7)
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'server' / 'seed-assets'
SRC_M2 = Path(sys.argv[1]) / 'pub/media/catalog/product'
SRC_SY = Path(sys.argv[2]) / 'src/Sylius/Bundle/CoreBundle/Resources/fixtures'
FONTS = ROOT / 'node_modules/@fontsource'

shutil.rmtree(OUT, ignore_errors=True)
(OUT / 'products').mkdir(parents=True)
(OUT / 'banners').mkdir()
(OUT / 'covers').mkdir()
(OUT / 'logos').mkdir()

def ttf(woff, name):
    dst = OUT.parent / '.cache-fonts' / name
    dst.parent.mkdir(exist_ok=True)
    if not dst.exists():
        f = TTFont(woff); f.flavor = None; f.save(dst)
    return str(dst)

SERIF = ttf(FONTS / 'playfair-display/files/playfair-display-latin-600-normal.woff', 'playfair600.ttf')

COLORS = {
    'black':  ('#1C1C1E', 'أسود', 'Black'),
    'gray':   ('#8E9096', 'رمادي', 'Grey'),
    'orange': ('#E07A3A', 'برتقالي', 'Orange'),
    'purple': ('#6C4E8C', 'بنفسجي', 'Purple'),
    'red':    ('#B3343A', 'أحمر', 'Red'),
    'blue':   ('#30558F', 'أزرق', 'Blue'),
    'green':  ('#3F7A55', 'أخضر', 'Green'),
    'white':  ('#F4F3EF', 'أبيض', 'White'),
    'yellow': ('#E2C044', 'أصفر', 'Yellow'),
    'brown':  ('#7A5634', 'بني', 'Brown'),
    'navy':   ('#1F2B4D', 'كحلي', 'Navy'),
    'sage':   ('#8DB5A0', 'زيتي فاتح', 'Sage'),
    'burgundy': ('#6E2433', 'نبيتي', 'Burgundy'),
    'cream':  ('#EDE6D6', 'كريمي', 'Cream'),
    'olive':  ('#4E5A3A', 'زيتي', 'Olive'),
    'sky':    ('#9CCBE6', 'سماوي', 'Sky'),
    'charcoal': ('#36383D', 'فحمي', 'Charcoal'),
    'light-wash': ('#A9BED6', 'جينز فاتح', 'Light wash'),
    'mid-wash': ('#5F7FA8', 'جينز متوسط', 'Mid wash'),
    'beige':  ('#D9C6A5', 'بيج', 'Beige'),
    'plum':   ('#6B2350', 'برقوقي', 'Plum'),
    'forest': ('#2F4A3A', 'أخضر غامق', 'Forest'),
    'multi':  ('#D8834A', 'متعدد الألوان', 'Multicolour'),
    'ombre':  ('#E88A4B', 'متدرج', 'Ombré'),
}

def save(img, path, max_side=1400, q=66):
    # WebP keeps the repo small; the seed re-encodes everything through the real media pipeline anyway.
    img = img.convert('RGB')
    img.thumbnail((max_side, max_side), Image.LANCZOS)
    path = path.with_suffix('.webp')
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, 'WEBP', quality=q, method=6)
    return path

# ---------------------------------------------------------------- names

NAMES = {
  'mh': [('توب هودي بأزرار', 'Henley Hooded Top'), ('هودي أساسي', 'Essential Pullover Hoodie'), ('هودي سوستة خفيف', 'Lightweight Zip Hoodie'),
         ('هودي تدريب راجلان', 'Raglan Training Hoodie'), ('هودي فليس ناعم', 'Brushed Fleece Hoodie'), ('هودي بجيب كانجارو', 'Kangaroo Pocket Hoodie'),
         ('هودي تريكو مُبرقش', 'Heather Knit Hoodie'), ('هودي ألوان متداخلة', 'Colour-Block Hoodie'), ('هاف زيب رياضي', 'Performance Half-Zip'),
         ('هودي سوستة كاملة', 'Urban Full-Zip Hoodie'), ('هودي واسع مريح', 'Relaxed Fit Hoodie'), ('هودي مبطّن حراري', 'Thermal Lined Hoodie'), ('هودي قطن ويك إند', 'Weekend Cotton Hoodie')],
  'mj': [('جاكيت واقي رياح', 'Packable Windbreaker'), ('جاكيت سوفت شيل', 'Hybrid Softshell Jacket'), ('جاكيت منفوخ مبطّن', 'Quilted Puffer Jacket'),
         ('جاكيت تراك', 'Heritage Track Jacket'), ('جاكيت مطر بكابيشون', 'Hooded Rain Shell'), ('جاكيت بومبر', 'Classic Bomber Jacket'),
         ('جاكيت جري خفيف', 'Featherlight Run Jacket'), ('جاكيت كوتش مبطّن', 'Fleece-Lined Coach Jacket'), ('باركا شتوي', 'Insulated Winter Parka'),
         ('جاكيت فيلد', 'Utility Field Jacket'), ('جاكيت عاكس ليلي', 'Reflective Night Jacket')],
  'mp': [('جوجر سليم', 'Slim Fit Joggers'), ('بنطلون تراك', 'Tapered Track Pants'), ('جوجر كارجو', 'Cargo Joggers'), ('سويت بانتس فليس', 'Fleece Sweatpants'),
         ('بنطلون تدريب', 'Training Pants'), ('بنطلون واسع مريح', 'Relaxed Lounge Pants'), ('بنطلون تِك مطاط', 'Tech Stretch Pants'), ('جوجر ساق مستقيمة', 'Straight Leg Joggers'),
         ('جوجر بأستك', 'Ribbed Cuff Joggers'), ('بنطلون سفر خفيف', 'Lightweight Travel Pants'), ('بنطلون جري', 'Woven Running Pants'), ('سويت بانتس كلاسيك', 'Classic Sweatpants')],
  'wh': [('هودي درابيه', 'Draped Cowl Hoodie'), ('توب هودي خفيف', 'Lightweight Hooded Top'), ('هودي بفتحة رقبة', 'Split-Neck Hoodie'), ('هودي يوجا ناعم', 'Soft Yoga Hoodie'),
         ('هودي بأكمام راجلان', 'Raglan Sleeve Hoodie'), ('هودي فليس قصير', 'Cropped Fleece Hoodie'), ('هودي تريكو', 'Knit Lounge Hoodie'), ('هودي بسوستة جانبية', 'Side-Zip Hoodie'),
         ('هودي رياضي', 'Studio Active Hoodie'), ('هودي واسع', 'Oversized Hoodie'), ('هودي مبطّن', 'Brushed Lined Hoodie'), ('هودي يومي', 'Everyday Hoodie')],
  'wj': [('جاكيت بكشكشة', 'Ruched Zip Jacket'), ('جاكيت سوفت شيل', 'Softshell Jacket'), ('جاكيت جري', 'Run Jacket'), ('جاكيت منفوخ خفيف', 'Light Puffer Jacket'),
         ('جاكيت تريكو', 'Knit Zip Jacket'), ('جاكيت بياقة عالية', 'Funnel Neck Jacket'), ('جاكيت مطر', 'Rain Jacket'), ('جاكيت فليس', 'Fleece Jacket'),
         ('جاكيت هايبرد', 'Hybrid Jacket'), ('جاكيت بكابيشون', 'Hooded Jacket'), ('جاكيت يوجا', 'Yoga Wrap Jacket'), ('جاكيت سفر', 'Travel Jacket')],
  'wp': [('ليجن عالي الخصر', 'High-Rise Leggings'), ('بنطلون يوجا', 'Yoga Pants'), ('ليجن ضغط', 'Compression Leggings'), ('بنطلون واسع', 'Wide Leg Pants'),
         ('جوجر نسائي', 'Women’s Joggers'), ('بنطلون رياضي', 'Active Pants'), ('ليجن بجيوب', 'Pocket Leggings'), ('بنطلون تمارين', 'Studio Pants'),
         ('ليجن ريب', 'Ribbed Leggings'), ('بنطلون فلير', 'Flare Pants'), ('بنطلون مريح', 'Lounge Pants'), ('ليجن سيملس', 'Seamless Leggings'), ('بنطلون بأستك', 'Cuffed Pants')],
  'ms': [('تيشيرت رياضي', 'Performance Tee'), ('تيشيرت قطن', 'Cotton Crew Tee'), ('تيشيرت دراي فيت', 'Dri-Fit Training Tee'), ('تيشيرت بولو رياضي', 'Sport Polo Tee'),
         ('تيشيرت جري', 'Run Tee'), ('تيشيرت ألوان', 'Colour Block Tee'), ('تيشيرت مُبرقش', 'Heather Tee'), ('تيشيرت ضغط', 'Compression Tee'),
         ('تيشيرت خفيف', 'Featherweight Tee'), ('تيشيرت تمارين', 'Gym Tee'), ('تيشيرت بأكمام راجلان', 'Raglan Tee'), ('تيشيرت أساسي', 'Essential Tee')],
  'msh': [('شورت رياضي', 'Training Shorts'), ('شورت جري', 'Run Shorts'), ('شورت كارجو', 'Cargo Shorts'), ('شورت تمارين', 'Gym Shorts'), ('شورت مزدوج', '2-in-1 Shorts'),
          ('شورت قطن', 'Cotton Shorts'), ('شورت خفيف', 'Lightweight Shorts'), ('شورت بجيوب', 'Pocket Shorts'), ('شورت تراك', 'Track Shorts'), ('شورت كلاسيك', 'Classic Shorts'),
          ('شورت مطاط', 'Stretch Shorts'), ('شورت يومي', 'Everyday Shorts')],
  'ws': [('تيشيرت رياضي نسائي', 'Women’s Active Tee'), ('تيشيرت يوجا', 'Yoga Tee'), ('تيشيرت جري', 'Run Tee'), ('تيشيرت قطن', 'Cotton Tee'), ('تيشيرت خفيف', 'Breeze Tee'),
         ('تيشيرت رقبة V', 'V-Neck Tee'), ('تيشيرت تمارين', 'Studio Tee'), ('تيشيرت دراي فيت', 'Dri-Fit Tee'), ('تيشيرت مُبرقش', 'Heather Tee'), ('تيشيرت أساسي', 'Essential Tee'),
         ('تيشيرت واسع', 'Relaxed Tee'), ('تيشيرت بأكمام قصيرة', 'Short Sleeve Tee')],
}

PRICES = {'mh': (749, 1199), 'mj': (1290, 2490), 'mp': (549, 899), 'wh': (699, 1099), 'wj': (1190, 2190), 'wp': (499, 849), 'ms': (299, 499), 'msh': (299, 449), 'ws': (299, 479)}

DESC = {
  'mh': ('هودي مصنوع من قطن ممزوج بالبوليستر بملمس ناعم من الداخل. قصّة مريحة تناسب اللبس اليومي والخروجات، مع كابيشون مبطن ورباط قابل للتعديل. يُغسل في الغسالة على 30 درجة.',
         'A soft cotton-blend hoodie brushed on the inside for warmth. Easy, everyday fit with a lined hood and adjustable drawcords. Machine wash at 30°C.'),
  'mj': ('جاكيت عملي بخامة مقاومة للرياح والمياه الخفيفة، بجيوب بسوستة وأساور مرنة. مثالي لأيام الشتاء في بنها والسفر.',
         'A practical jacket with a wind- and shower-resistant shell, zip pockets and elastic cuffs. Built for winter days and weekend travel.'),
  'mp': ('بنطلون مريح بخامة مطاطة تتحرك معاك، بخصر أستك ورباط وجيوب جانبية عميقة. مناسب للجيم واللبس الكاجوال.',
         'Comfortable pants in a stretch fabric that moves with you — elastic drawcord waist and deep side pockets. Gym-to-street ready.'),
  'wh': ('هودي نسائي خفيف بقصّة أنيقة وخامة ناعمة على البشرة. مناسب للتمارين والخروجات الكاجوال.',
         'A lightweight women’s hoodie with a flattering cut and a soft-touch fabric — from studio to street.'),
  'wj': ('جاكيت نسائي بقصّة مُحكمة وخامة خفيفة تحمي من الهوا. بسوستة كاملة وجيوب جانبية.',
         'A tailored women’s jacket in a light, wind-resistant fabric with a full zip and side pockets.'),
  'wp': ('بنطلون نسائي بخامة مطاطة ومريحة طول اليوم، بخصر عالي يدي ثبات وراحة.',
         'All-day comfortable women’s pants in a four-way stretch fabric with a supportive high waist.'),
  'ms': ('تيشيرت بخامة تسحب العرق وتنشف بسرعة، خفيف ومريح للتمارين واللبس اليومي.',
         'A quick-dry, sweat-wicking tee that stays light and comfortable for training and everyday wear.'),
  'msh': ('شورت رياضي خفيف بخصر أستك وجيوب، مناسب للجري والجيم والصيف.',
          'Lightweight sports shorts with an elastic waist and pockets — for running, the gym and summer days.'),
  'ws': ('تيشيرت نسائي بخامة ناعمة وقصّة مريحة، بيحافظ على شكله بعد الغسيل.',
         'A soft women’s tee with a relaxed fit that keeps its shape wash after wash.'),
  'tee': ('تيشيرت قطن 100% تقيل (220 جرام) بقصّة أوفر سايز عصرية. خامة مصرية ممتازة وألوان ثابتة.',
          'A 100% heavyweight cotton tee (220 gsm) with a modern oversized cut. Premium Egyptian cotton with long-lasting colour.'),
  'jeans': ('جينز بقصّة مستقيمة وخامة دنيم قطن مع نسبة بسيطة من الليكرا للراحة. غسلة عصرية وتفاصيل خياطة متقنة.',
            'Straight-cut jeans in cotton denim with a touch of stretch for comfort. Modern wash and refined stitching.'),
  'shorts': ('شورت جينز بقصّة مريحة للصيف، بحواف نظيفة وغسلة فاتحة.',
             'Relaxed denim shorts for summer with clean hems and a light wash.'),
  'cap': ('طاقية تريكو دافية بخامة أكريليك ناعمة، مقاس واحد يناسب الجميع.',
          'A warm knit beanie in soft acrylic yarn. One size fits most.'),
}

def magento_products(prefix, type_key):
    folder = SRC_M2 / prefix[0] / prefix[1]
    files = sorted(p for p in folder.glob(f'{prefix}*.jpg') if p.name[len(prefix):len(prefix) + 2].isdigit())
    groups = {}
    for f in files:
        stem = f.stem
        code = stem.split('-')[0]
        if not code[len(prefix):].isdigit():
            continue
        color, view = stem.split('-', 1)[1].split('_', 1)
        groups.setdefault(code, {}).setdefault(color, []).append((view, f))
    out = []
    names = NAMES[type_key]
    for i, (code, colors) in enumerate(sorted(groups.items())):
        if i >= len(names):
            break
        # hero colour: the one with the most views
        hero = max(colors, key=lambda c: (len(colors[c]), c != 'white'))
        order = {'main': 0, 'alt1': 1, 'back': 2, 'alternate': 3, 'outfit': 4, 'side_a': 5, 'side_b': 6}
        imgs = [f for _, f in sorted(colors[hero], key=lambda x: order.get(x[0], 9))]
        others = [c for c in colors if c != hero and c in COLORS]
        for c in others:
            mains = [f for v, f in colors[c] if v == 'main']
            if mains:
                imgs.append(mains[0])
        out.append({'code': code, 'type': type_key, 'name': names[i], 'colors': [hero] + others, 'images': imgs[:6]})
    return out

def sylius_jeans():
    shorts = {1, 2, 3, 5, 8, 9}
    black = {6, 7}
    names = {
        1: ('شورت جينز فاتح', 'Light Wash Denim Shorts'), 2: ('شورت جينز ريلاكس', 'Relaxed Denim Shorts'), 3: ('شورت جينز كلاسيك', 'Classic Denim Shorts'),
        4: ('جينز مستقيم فاتح', 'Straight Leg Jeans — Light'), 5: ('شورت جينز صيفي', 'Summer Denim Shorts'), 6: ('بنطلون شينو أسود', 'Black Tapered Chinos'),
        7: ('بنطلون أسود سليم', 'Slim Black Trousers'), 8: ('شورت جينز متوسط', 'Mid Wash Denim Shorts'), 9: ('شورت جينز برمودا', 'Bermuda Denim Shorts'),
        10: ('جينز ريلاكس فيت', 'Relaxed Fit Jeans'), 11: ('جينز كلاسيك 90s', '90s Classic Jeans'), 12: ('جينز واسع', 'Wide Leg Jeans'),
        13: ('جينز مستقيم متوسط', 'Straight Leg Jeans — Mid'), 14: ('جينز بوت كت', 'Bootcut Jeans'),
    }
    out = []
    for i in range(1, 15):
        imgs = [SRC_SY / 'jeans/man' / f'jeans_{i:02d}_{v}.webp' for v in (1, 2, 3)]
        color = 'black' if i in black else ('light-wash' if i in (1, 2, 4, 5, 11, 12) else 'mid-wash')
        t = 'shorts' if i in shorts else 'jeans'
        out.append({'code': f'dj{i:02d}', 'type': t, 'name': names[i], 'colors': [color], 'images': imgs})
    return out

def sylius_tees():
    T = lambda n, v: SRC_SY / 't-shirts/man' / f't-shirt_{n:02d}_{v}.webp'
    sets = [
        ('black', ('تيشيرت أوفر سايز أسود', 'Oversized Heavyweight Tee — Black'), [T(3, 1), T(7, 1), T(1, 2), T(3, 3)]),
        ('white', ('تيشيرت أوفر سايز أبيض', 'Oversized Heavyweight Tee — White'), [T(2, 1), T(9, 1), T(4, 2), T(9, 3)]),
        ('yellow', ('تيشيرت قطن أصفر', 'Sunwashed Cotton Tee'), [T(1, 1), T(4, 1), T(1, 3)]),
        ('navy', ('تيشيرت كحلي كلاسيك', 'Classic Navy Tee'), [T(5, 1)]),
        ('sage', ('تيشيرت زيتي فاتح', 'Sage Garment-Dyed Tee'), [T(8, 1)]),
        ('ombre', ('تيشيرت متدرج سيرف', 'Surf Ombré Tee'), [T(10, 1), T(10, 2)]),
        ('burgundy', ('تيشيرت نبيتي', 'Burgundy Boxy Tee'), [T(3, 2), T(11, 2)]),
        ('olive', ('تيشيرت زيتي', 'Olive Relaxed Tee'), [T(6, 2)]),
        ('sky', ('تيشيرت سماوي', 'Sky Blue Tee'), [T(9, 2)]),
        ('charcoal', ('تيشيرت فحمي', 'Charcoal Everyday Tee'), [T(11, 1), T(6, 1)]),
        ('cream', ('تيشيرت كريمي', 'Cream Linen-Blend Tee'), [T(8, 3), T(9, 3)]),
    ]
    return [{'code': f'dt{i + 1:02d}', 'type': 'tee', 'name': n, 'colors': [c], 'images': imgs} for i, (c, n, imgs) in enumerate(sets)]

def sylius_caps():
    C = lambda n: (SRC_SY / 'caps' / f'cap_{n:02d}.webp') if (SRC_SY / 'caps' / f'cap_{n:02d}.webp').exists() else None
    V = lambda n, v: SRC_SY / 'caps' / f'cap_{n:02d}_{v}.webp'
    sets = [
        ('burgundy', ('طاقية تريكو نبيتي بومبوم', 'Burgundy Pom Beanie'), [C(1)]),
        ('forest', ('طاقية تريكو أخضر', 'Forest Rib Beanie'), [C(2)]),
        ('cream', ('طاقية كريمي بومبوم', 'Cream Cable Pom Beanie'), [C(3)]),
        ('plum', ('طاقية برقوقي', 'Plum Fold Beanie'), [C(4)]),
        ('black', ('طاقية سوداء كلاسيك', 'Classic Black Beanie'), [V(6, 1), V(6, 2), V(6, 3)]),
        ('beige', ('طاقية بيج', 'Oat Knit Beanie'), [V(8, 1), V(8, 2), V(8, 3)]),
        ('charcoal', ('طاقية فحمي قصيرة', 'Charcoal Docker Beanie'), [V(9, 1), V(9, 2), V(9, 3)]),
        ('multi', ('طاقية ألوان بومبوم', 'Fair Isle Pom Beanie'), [C(12)]),
        ('gray', ('طاقية رمادي واسعة', 'Grey Slouch Beanie'), [V(13, 1), V(13, 2), V(13, 3)]),
        ('brown', ('طاقية بني', 'Chocolate Rib Beanie'), [C(16)]),
        ('ombre', ('طاقية مقلمة', 'Striped Pom Beanie'), [C(17)]),
    ]
    return [{'code': f'dc{i + 1:02d}', 'type': 'cap', 'name': n, 'colors': [c], 'images': [x for x in imgs if x]} for i, (c, n, imgs) in enumerate(sets)]

STORES = {
  'ahmed-fashion': magento_products('mh', 'mh') + magento_products('mj', 'mj') + magento_products('mp', 'mp'),
  'lamar-boutique': magento_products('wh', 'wh') + magento_products('wj', 'wj') + magento_products('wp', 'wp'),
  'sport-zone': magento_products('ms', 'ms')[:12] + [p for p in magento_products('msh', 'msh')] + magento_products('ws', 'ws')[:12],
  'denim-house': sylius_jeans() + sylius_tees() + sylius_caps(),
}

# ---------------------------------------------------------------- copy product photos

catalog = {}
for store, products in STORES.items():
    items = []
    for p in products:
        lo, hi = PRICES.get(p['type'], (0, 0))
        if p['type'] == 'tee': lo, hi = 349, 549
        if p['type'] == 'jeans': lo, hi = 799, 1290
        if p['type'] == 'shorts': lo, hi = 449, 649
        if p['type'] == 'cap': lo, hi = 199, 349
        price = int(round(random.randint(lo, hi) / 10) * 10 - 1)
        imgs = []
        for j, src in enumerate(p['images']):
            dst = save(Image.open(src), OUT / 'products' / store / p['code'] / f'{j}.jpg')
            imgs.append(str(dst.relative_to(OUT)))
        desc = DESC[p['type']]
        items.append({
            'code': p['code'], 'type': p['type'], 'name_ar': p['name'][0], 'name_en': p['name'][1],
            'description_ar': desc[0], 'description_en': desc[1], 'price': price,
            'colors': [{'hex': COLORS[c][0], 'name_ar': COLORS[c][1], 'name_en': COLORS[c][2]} for c in p['colors'] if c in COLORS],
            'images': imgs,
        })
    catalog[store] = items
    print(store, len(items), 'products')

# ---------------------------------------------------------------- composites

def fit_h(img, h):
    w = int(img.width * h / img.height)
    return img.resize((w, h), Image.LANCZOS)

def studio_composite(paths, size, bg, slots):
    """Studio shots on white → 'darken' blended onto a coloured backdrop, so models look shot on that colour."""
    W, H = size
    canvas = Image.new('RGB', size, bg)
    for path, (cx, scale) in zip(paths, slots):
        im = fit_h(Image.open(path).convert('RGB'), int(H * scale))
        x = int(cx * W - im.width / 2)
        y = H - im.height
        region = canvas.crop((x, y, x + im.width, y + im.height))
        canvas.paste(ImageChops.darker(region, im), (x, y))
    return canvas

def lifestyle_triptych(paths, size):
    W, H = size
    canvas = Image.new('RGB', size, '#000')
    n = len(paths)
    cw = W // n
    for i, p in enumerate(paths):
        im = Image.open(p).convert('RGB')
        im = im.resize((cw, int(im.height * cw / im.width)), Image.LANCZOS) if im.width / im.height < cw / H else fit_h(im, H)
        left = (im.width - cw) // 2
        top = max(0, (im.height - H) // 3)
        canvas.paste(im.crop((left, top, left + cw, top + H)), (i * cw, 0))
    return canvas

def single_crop(path, size, focus_y=0.3):
    W, H = size
    im = Image.open(path).convert('RGB')
    s = max(W / im.width, H / im.height)
    im = im.resize((int(im.width * s) + 1, int(im.height * s) + 1), Image.LANCZOS)
    left = (im.width - W) // 2
    top = int((im.height - H) * focus_y)
    return im.crop((left, top, left + W, top + H))

P = lambda store, code, i=0: OUT / 'products' / store / code / f'{i}.webp'
BANNERS = {}

def banner(store, key, desk, mob, meta):
    save(desk, OUT / 'banners' / f'{store}-{key}.jpg', 2400, 80)
    save(mob, OUT / 'banners' / f'{store}-{key}-m.jpg', 1400, 80)
    BANNERS.setdefault(store, []).append({**meta, 'image': f'banners/{store}-{key}.webp', 'mobile': f'banners/{store}-{key}-m.webp'})

D, M = (2400, 1000), (1080, 1350)
DSLOT2 = [(0.60, 0.93), (0.82, 0.93)]
DSLOT3 = [(0.52, 0.86), (0.70, 0.95), (0.88, 0.86)]
MSLOT2 = [(0.34, 0.56), (0.66, 0.56)]

# Ahmed Fashion — menswear
banner('ahmed-fashion', 'winter', studio_composite([P('ahmed-fashion', 'mj03'), P('ahmed-fashion', 'mh02'), P('ahmed-fashion', 'mj11')], D, '#E7E3DD', DSLOT3),
       studio_composite([P('ahmed-fashion', 'mj03'), P('ahmed-fashion', 'mh02')], M, '#E7E3DD', MSLOT2),
       {'eyebrow': ('الموسم الجديد', 'NEW SEASON'), 'title': ('تشكيلة شتاء 2026', 'Winter Collection 2026'), 'subtitle': ('جواكت وهوديز بخامات دافية وقصّات عصرية.', 'Jackets and hoodies in warm fabrics and modern cuts.'), 'cta': ('تسوّق التشكيلة', 'Shop the collection'), 'link': '/shop?category=jackets', 'tone': 'light', 'align': 'start', 'mirror': True})
banner('ahmed-fashion', 'hoodies', studio_composite([P('ahmed-fashion', 'mh07'), P('ahmed-fashion', 'mh10')], D, '#DCE1E6', DSLOT2),
       studio_composite([P('ahmed-fashion', 'mh07'), P('ahmed-fashion', 'mh10')], M, '#DCE1E6', MSLOT2),
       {'eyebrow': ('الأكثر طلباً', 'BESTSELLERS'), 'title': ('هوديز تبدأ من 749 جنيه', 'Hoodies from EGP 749'), 'subtitle': ('قطن ناعم من جوه، ومريح طول اليوم.', 'Brushed-soft inside, comfortable all day.'), 'cta': ('شوف الهوديز', 'Shop hoodies'), 'link': '/shop?category=hoodies', 'tone': 'light', 'align': 'start', 'mirror': True})
banner('ahmed-fashion', 'sale', studio_composite([P('ahmed-fashion', 'mp03'), P('ahmed-fashion', 'mj07')], D, '#EADCCB', DSLOT2),
       studio_composite([P('ahmed-fashion', 'mp03'), P('ahmed-fashion', 'mj07')], M, '#EADCCB', MSLOT2),
       {'eyebrow': ('عرض لفترة محدودة', 'LIMITED TIME'), 'title': ('خصم لحد 30٪', 'Up to 30% off'), 'subtitle': ('على مختارات من الجواكت والبناطيل.', 'On selected jackets and pants.'), 'cta': ('تسوّق العروض', 'Shop the sale'), 'link': '/shop?sale=1', 'tone': 'light', 'align': 'start', 'mirror': True})

# Lamar Boutique — womenswear
banner('lamar-boutique', 'new', studio_composite([P('lamar-boutique', 'wj01'), P('lamar-boutique', 'wh01'), P('lamar-boutique', 'wj06')], D, '#F1E3DF', DSLOT3),
       studio_composite([P('lamar-boutique', 'wj01'), P('lamar-boutique', 'wh01')], M, '#F1E3DF', MSLOT2),
       {'eyebrow': ('وصل حديثاً', 'JUST IN'), 'title': ('أناقة كل يوم', 'Everyday Elegance'), 'subtitle': ('قطع ناعمة ومريحة لكل مشاويرك.', 'Soft, easy pieces for every plan.'), 'cta': ('اكتشفي الجديد', 'Discover new in'), 'link': '/shop?sort=newest', 'tone': 'light', 'align': 'start', 'mirror': True})
banner('lamar-boutique', 'active', studio_composite([P('lamar-boutique', 'wh04'), P('lamar-boutique', 'wp03')], D, '#E4E9E2', DSLOT2),
       studio_composite([P('lamar-boutique', 'wh04'), P('lamar-boutique', 'wp03')], M, '#E4E9E2', MSLOT2),
       {'eyebrow': ('تشكيلة الأكتيف', 'ACTIVE EDIT'), 'title': ('اتحركي براحتك', 'Move in Comfort'), 'subtitle': ('هوديز وليجن بخامات بتتنفس.', 'Breathable hoodies and leggings.'), 'cta': ('تسوّقي الآن', 'Shop now'), 'link': '/shop?category=hoodies', 'tone': 'light', 'align': 'start', 'mirror': True})

# Sport Zone
banner('sport-zone', 'train', studio_composite([P('sport-zone', 'ms03'), P('sport-zone', 'ws02'), P('sport-zone', 'ms09')], D, '#DCE5EC', DSLOT3),
       studio_composite([P('sport-zone', 'ms03'), P('sport-zone', 'ws02')], M, '#DCE5EC', MSLOT2),
       {'eyebrow': ('جاهز للتمرين', 'TRAIN READY'), 'title': ('تيشيرتات دراي فيت', 'Dri-Fit Essentials'), 'subtitle': ('خفيفة، بتنشف بسرعة، ومناسبة للجيم والجري.', 'Light, quick-dry and made for the gym.'), 'cta': ('تسوّق الآن', 'Shop now'), 'link': '/shop', 'tone': 'light', 'align': 'start', 'mirror': True})
banner('sport-zone', 'summer', studio_composite([P('sport-zone', 'msh01'), P('sport-zone', 'ms06')], D, '#ECE6D9', DSLOT2),
       studio_composite([P('sport-zone', 'msh01'), P('sport-zone', 'ms06')], M, '#ECE6D9', MSLOT2),
       {'eyebrow': ('صيف 2026', 'SUMMER 2026'), 'title': ('شورتات تبدأ من 299', 'Shorts from EGP 299'), 'subtitle': ('اختار مقاسك ولونك واطلب أونلاين.', 'Pick your size and colour, order online.'), 'cta': ('شوف الشورتات', 'Shop shorts'), 'link': '/shop?category=shorts', 'tone': 'light', 'align': 'start', 'mirror': True})

# Denim House — lifestyle photography
J = lambda i, v=1: SRC_SY / 'jeans/man' / f'jeans_{i:02d}_{v}.webp'
TT = lambda i, v=1: SRC_SY / 't-shirts/man' / f't-shirt_{i:02d}_{v}.webp'
banner('denim-house', 'denim', lifestyle_triptych([J(10), J(13), J(4)], D), single_crop(J(13), M, 0.15),
       {'eyebrow': ('دنيم 2026', 'DENIM 2026'), 'title': ('القصّة المستقيمة رجعت', 'The Straight Leg Is Back'), 'subtitle': ('جينز قطن بغسلات فاتحة ومتوسطة.', 'Cotton denim in light and mid washes.'), 'cta': ('تسوّق الجينز', 'Shop denim'), 'link': '/shop?category=jeans', 'tone': 'dark', 'align': 'center', 'mirror': False})
banner('denim-house', 'tees', lifestyle_triptych([TT(3), TT(2), TT(5)], D), single_crop(TT(2), M, 0.1),
       {'eyebrow': ('أساسيات الصيف', 'SUMMER BASICS'), 'title': ('تيشيرتات أوفر سايز', 'Oversized Heavyweight Tees'), 'subtitle': ('قطن مصري 220 جرام. 11 لون.', '220 gsm Egyptian cotton. 11 colours.'), 'cta': ('اختار لونك', 'Pick your colour'), 'link': '/shop?category=tees', 'tone': 'dark', 'align': 'center', 'mirror': False})
banner('denim-house', 'shorts', lifestyle_triptych([J(8), J(1), J(9)], D), single_crop(J(8), M, 0.15),
       {'eyebrow': ('عرض الويك إند', 'WEEKEND OFFER'), 'title': ('شورت جينز + تيشيرت بـ 899', 'Shorts + Tee for EGP 899'), 'subtitle': ('استخدم كود DENIM15 واستمتع بخصم إضافي.', 'Use code DENIM15 for an extra discount.'), 'cta': ('تسوّق العرض', 'Shop the offer'), 'link': '/shop?category=shorts', 'tone': 'dark', 'align': 'center', 'mirror': False})

# Covers (marketplace store cards) 1600x1000
COVERS = {
  'ahmed-fashion': studio_composite([P('ahmed-fashion', 'mh02'), P('ahmed-fashion', 'mj03'), P('ahmed-fashion', 'mh10')], (1600, 1000), '#E7E3DD', [(0.2, 0.92), (0.5, 0.98), (0.8, 0.92)]),
  'lamar-boutique': studio_composite([P('lamar-boutique', 'wh01'), P('lamar-boutique', 'wj01'), P('lamar-boutique', 'wh04')], (1600, 1000), '#F1E3DF', [(0.2, 0.92), (0.5, 0.98), (0.8, 0.92)]),
  'sport-zone': studio_composite([P('sport-zone', 'ws02'), P('sport-zone', 'ms03'), P('sport-zone', 'ws05')], (1600, 1000), '#DCE5EC', [(0.2, 0.92), (0.5, 0.98), (0.8, 0.92)]),
  'denim-house': lifestyle_triptych([J(13), TT(3), J(4)], (1600, 1000)),
}
for k, v in COVERS.items():
    save(v, OUT / 'covers' / f'{k}.jpg', 1600, 80)

# Logos — monogram in brand colours
LOGOS = {
  'ahmed-fashion': ('AF', '#111111', '#F3EDE4'),
  'lamar-boutique': ('L', '#9F3A4D', '#FFF5F6'),
  'sport-zone': ('SZ', '#1F4FA8', '#FFFFFF'),
  'denim-house': ('DH', '#26338C', '#F2F4FF'),
}
for k, (mono, bg, fg) in LOGOS.items():
    S = 512
    im = Image.new('RGB', (S, S), bg)
    d = ImageDraw.Draw(im)
    size = 250 if len(mono) == 1 else 190
    font = ImageFont.truetype(SERIF, size)
    bbox = d.textbbox((0, 0), mono, font=font)
    d.text(((S - (bbox[2] - bbox[0])) / 2 - bbox[0], (S - (bbox[3] - bbox[1])) / 2 - bbox[1] - 6), mono, font=font, fill=fg)
    d.ellipse((28, 28, S - 28, S - 28), outline=fg, width=4)
    im.save(OUT / 'logos' / f'{k}.webp', 'WEBP', quality=92)

(OUT / 'catalog.json').write_text(json.dumps({'products': catalog, 'banners': BANNERS}, ensure_ascii=False, indent=1))
shutil.rmtree(OUT.parent / '.cache-fonts', ignore_errors=True)
print('done')

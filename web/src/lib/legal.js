/** Legal pages (privacy, terms, returns). Arabic is the reference text; English is a faithful translation.
 *  Contact details come from config/contact.js at render time. Keep UPDATED in sync when the text changes. */
export const LEGAL_UPDATED = '2026-10-11';

export const LEGAL = {
  privacy: {
    ar: {
      title: 'سياسة الخصوصية',
      intro: 'بنها أوتفيت منصة بتجمع متاجر ملابس من بنها في مكان واحد. الصفحة دي بتوضّح إيه البيانات اللي بنجمعها، ليه، وبنعمل بيها إيه، وإيه حقوقك.',
      sections: [
        ['البيانات اللي بنجمعها', [
          'عند إتمام الطلب: الاسم، رقم الموبايل، المحافظة والمدينة والعنوان، وملاحظات التوصيل، وتفاصيل الطلب.',
          'لو عملت حساب (اختياري): الاسم ورقم الموبايل وباسورد متشفّر (إحنا مش بنشوف الباسورد)، بالإضافة لخزانتك والمنتجات اللي بتتابعها وإشعاراتك.',
          'التقييمات: نص التقييم وأي صور بترفعها، وبيظهروا للناس باسمك الأول فقط.',
          'طلبات "مش لاقي في بنها": الوصف والصورة (لو رفعتها) وبيانات التواصل والعنوان اللي بتكتبها.',
          'المساعد مودة: الرسائل والصور اللي بتبعتها للمساعد بتتبعت لمزوّد الذكاء الاصطناعي (Anthropic أو Cloudflare) عشان يرد عليك. إحنا مش بنخزّن صور المحادثة على سيرفراتنا. ممكن نحتفظ بنص قصير عن تفضيلاتك (زي المقاس أو الألوان) على جهازك بس.',
          'بيانات تقنية بسيطة: عدد زيارات كل متجر في اليوم (إجمالي بدون هوية)، ونوع المتصفح وعنوان الـIP لأغراض الأمان ومنع الإساءة.',
        ]],
        ['بنستخدم بياناتك في إيه', [
          'تنفيذ وتوصيل طلبك والتواصل معاك بخصوصه.',
          'إدارة حسابك وإشعاراتك (حالة الطلب، تغيّر الأسعار، متابعة المتاجر) لو فعّلتها.',
          'تجهيز عروض الأسعار لطلبات "مش لاقي في بنها" ومعاينة المنتج قبل الاستلام.',
          'تحسين الخدمة ومنع الاحتيال والإساءة.',
          'إحنا مش بنبيع بياناتك لأي جهة.',
        ]],
        ['مين بيشوف بياناتك', [
          'المتجر اللي بتطلب منه بيشوف اسمك ورقمك وعنوانك وتفاصيل طلبك عشان يجهّز ويوصّل.',
          'فريق بنها أوتفيت لما يكون التوصيل علينا أو لما تطلب حاجة من خلالنا.',
          'مزوّد الذكاء الاصطناعي ومزوّد تخزين الصور واستضافة الموقع (زي Railway وCloudflare) بالقدر اللازم لتشغيل الخدمة فقط.',
          'الجهات الرسمية لو القانون طلب ده.',
        ]],
        ['الكوكيز والتخزين على جهازك', [
          'مش بنستخدم كوكيز إعلانية. بنحفظ على جهازك حاجات ضرورية للتشغيل زي السلة والمفضلة واللغة ودخول حسابك.',
          'لو فعّلت الإشعارات، المتصفح بيحفظ اشتراكك عشان نقدر نبعتلك تنبيهات، وتقدر توقفها في أي وقت من إعدادات المتصفح.',
        ]],
        ['الاحتفاظ بالبيانات والأمان', [
          'بنحتفظ ببيانات الطلبات للمدة اللازمة لخدمتك وللأغراض المحاسبية والقانونية، وبعدها بنمسحها أو بنخفي هويتها.',
          'الباسوردات متشفّرة، والاتصال بالموقع مؤمّن، وبناخد نسخ احتياطية دورية. مفيش نظام آمن 100%، لكن بنبذل مجهود معقول لحماية بياناتك.',
        ]],
        ['حقوقك', [
          'تقدر تطلب نسخة من بياناتك أو تصحيحها أو مسح حسابك وبياناتك، وتقدر توقف الإشعارات في أي وقت.',
          'لو مش عاوز تعمل حساب، تقدر تطلب وتتابع طلبك من غير حساب.',
          'الخدمة موجّهة لمن هم 18 سنة فأكتر، أو بإشراف ولي الأمر.',
        ]],
        ['تعديل السياسة والتواصل', [
          'ممكن نحدّث السياسة دي، وهنكتب تاريخ آخر تحديث أعلى الصفحة.',
          'لأي استفسار أو طلب بخصوص بياناتك: كلّمنا على واتساب أو بالتليفون على الأرقام الموضحة أسفل الصفحة.',
        ]],
      ],
    },
    en: {
      title: 'Privacy Policy',
      intro: 'Banha Outfit brings fashion stores from Banha together in one place. This page explains what data we collect, why, what we do with it, and your rights.',
      sections: [
        ['Data we collect', [
          'When you place an order: your name, mobile number, governorate, city and address, delivery notes and the order details.',
          'If you create an account (optional): your name, mobile number and a hashed password (we never see it), plus your wardrobe, the products you watch and your notifications.',
          'Reviews: the review text and any photos you upload; they are shown with your first name only.',
          '"Can\'t find it in Banha" requests: the description, photo (if you add one), contact details and address you enter.',
          'The Moda assistant: messages and photos you send are passed to our AI provider (Anthropic or Cloudflare) so it can answer. We do not store chat photos on our servers. A short note of your preferences (such as size or colours) may be kept on your own device only.',
          'Basic technical data: aggregate daily visit counts per store (not tied to a person), and browser type and IP address for security and abuse prevention.',
        ]],
        ['How we use your data', [
          'To fulfil and deliver your order and contact you about it.',
          'To run your account and notifications (order status, price drops, followed stores) if you turn them on.',
          'To prepare quotes for sourcing requests and arrange inspection before you receive the item.',
          'To improve the service and prevent fraud and abuse.',
          'We do not sell your data.',
        ]],
        ['Who sees your data', [
          'The store you order from sees your name, number, address and order so it can prepare and deliver.',
          'The Banha Outfit team when we deliver or when you ask us to source something.',
          'Our AI provider, photo storage and hosting providers (such as Railway and Cloudflare), only as needed to run the service.',
          'Public authorities where the law requires it.',
        ]],
        ['Cookies and on-device storage', [
          'We do not use advertising cookies. We store only what the site needs on your device: cart, favourites, language and your sign-in.',
          'If you enable notifications, your browser stores your subscription so we can send alerts; you can stop them at any time in your browser settings.',
        ]],
        ['Retention and security', [
          'We keep order records for as long as needed to serve you and for accounting and legal purposes, then delete or anonymise them.',
          'Passwords are hashed, the connection is encrypted and we take regular backups. No system is 100% secure, but we make reasonable efforts to protect your data.',
        ]],
        ['Your rights', [
          'You can ask for a copy of your data, a correction, or deletion of your account and data, and you can turn notifications off at any time.',
          'You can order and track without an account.',
          'The service is intended for people aged 18 or over, or under a parent\'s supervision.',
        ]],
        ['Changes and contact', [
          'We may update this policy; the last-updated date is shown at the top.',
          'For any question or request about your data, contact us on WhatsApp or by phone using the details at the bottom of this page.',
        ]],
      ],
    },
  },

  terms: {
    ar: {
      title: 'الشروط والأحكام',
      intro: 'باستخدامك لبنها أوتفيت أو بإتمامك طلب من خلاله، أنت موافق على الشروط دي. لو مش موافق، من فضلك متستخدمش الخدمة.',
      sections: [
        ['إحنا مين', [
          'بنها أوتفيت منصة بتعرض منتجات متاجر مستقلة من بنها وتسهّل الطلب والتوصيل. كل متجر هو البائع المسؤول عن منتجاته وأسعاره ومخزونه.',
        ]],
        ['الطلبات والأسعار', [
          'الأسعار بالجنيه المصري وبتتحدد من كل متجر. الطلب بيتأكد بعد ما المتجر (أو فريقنا) يراجعه، وممكن يتعدّل أو يتلغي لو المنتج خلص أو في خطأ واضح في السعر.',
          'الدفع حاليًا عند الاستلام. المصاريف والشحن بتظهر قبل ما تأكد الطلب.',
          'لازم تكتب بياناتك صح (الاسم والرقم والعنوان) عشان نقدر نوصّلك. لو الرقم مش بيرد أو العنوان غلط ممكن يتأجل الطلب أو يتلغي.',
        ]],
        ['التوصيل', [
          'مواعيد التوصيل تقديرية. توصيل نفس اليوم متاح في المتاجر اللي بتفعّله وقبل موعد القفل اللي المتجر بيحدده، وبيتوقف تلقائيًا بعده.',
          'بعض الطلبات بيوصّلها المتجر نفسه وبعضها بيوصّلها فريق بنها أوتفيت، وبيتحدد ده عند الطلب.',
        ]],
        ['طلبات "مش لاقي في بنها"', [
          'تقدر تبعتلنا تفاصيل المنتج اللي مش لاقيه وهنحاول نجيبهولك. هنرجعلك بعرض سعر، ومفيش التزام عليك إلا بعد ما توافق عليه.',
          'ليك معاينة المنتج قبل الاستلام، ولو مش مطابق لاتفاقنا تقدر ترفضه عند الاستلام من غير أي رسوم.',
        ]],
        ['حسابك', [
          'إنشاء الحساب اختياري. انت مسؤول عن سرية الباسورد وعن اللي بيحصل من خلال حسابك. نقدر نوقف أي حساب بيستخدم الخدمة بشكل مسيء.',
        ]],
        ['التقييمات والمحتوى', [
          'التقييمات بتكون من مشترين حقيقيين استلموا الطلب. ممنوع أي محتوى مسيء أو مخالف للقانون أو ينتهك حقوق غيرك. بنحتفظ بحق إخفاء أي تقييم مخالف.',
          'بترفع صورك وتقييماتك وإنت مسؤول عنها، وبتسمح لنا نعرضها على المنصة.',
        ]],
        ['المساعد مودة (ذكاء اصطناعي)', [
          'مودة بتقترح منتجات وإطلالات بالذكاء الاصطناعي وممكن تغلط. المنتجات والأسعار بتيجي من كتالوج المتاجر الحقيقي، لكن لازم تراجع التفاصيل والمقاس قبل ما تشتري. اقتراحات المقاس إرشادية مش ضمان.',
        ]],
        ['الاستخدام المسموح', [
          'ممنوع محاولة اختراق الموقع أو إساءة استخدامه أو سحب بياناته بشكل آلي أو انتحال شخصية.',
        ]],
        ['حدود المسؤولية', [
          'بنحاول نخلي المعلومات دقيقة ومحدّثة، لكن مش بنضمن خلوها من الأخطاء. مسؤولية المنتج وجودته على المتجر البائع، وإحنا مسؤولين عن تشغيل المنصة وخدمات التوصيل اللي بنقدمها بنفسنا، في حدود القانون.',
        ]],
        ['الاسترجاع والاستبدال', ['تفاصيل الاسترجاع والاستبدال في صفحة "سياسة الاسترجاع".']],
        ['القانون الواجب التطبيق', [
          'تخضع الشروط دي للقانون المصري، وأي نزاع بيتحل ودّيًا الأول، وبعدها قدام المحاكم المصرية المختصة. ده مش بيقلل من حقوقك كمستهلك بموجب قانون حماية المستهلك.',
          'ممكن نعدّل الشروط، واستمرارك في استخدام الخدمة بعد التعديل معناه موافقتك عليها.',
        ]],
      ],
    },
    en: {
      title: 'Terms & Conditions',
      intro: 'By using Banha Outfit, or placing an order through it, you agree to these terms. If you do not agree, please do not use the service.',
      sections: [
        ['Who we are', ['Banha Outfit is a platform that shows products from independent stores in Banha and makes ordering and delivery easier. Each store is the seller responsible for its own products, prices and stock.']],
        ['Orders and prices', [
          'Prices are in Egyptian pounds and are set by each store. An order is confirmed after the store (or our team) reviews it, and it may be changed or cancelled if the item is out of stock or there is an obvious pricing error.',
          'Payment is currently cash on delivery. Fees and shipping are shown before you confirm.',
          'You must give correct details (name, number, address) so we can deliver. If the phone does not answer or the address is wrong, the order may be delayed or cancelled.',
        ]],
        ['Delivery', [
          'Delivery times are estimates. Same-day delivery is available from stores that turn it on, before the cut-off time the store sets, and it switches off automatically afterwards.',
          'Some orders are delivered by the store itself and some by the Banha Outfit team; this is decided when you order.',
        ]],
        ['"Can\'t find it in Banha" requests', [
          'You can send us the details of an item you cannot find and we will try to source it. We will come back with a quote, and you are not committed until you accept it.',
          'You may inspect the item before receiving it, and if it does not match what we agreed you may refuse it at the door at no charge.',
        ]],
        ['Your account', ['Creating an account is optional. You are responsible for keeping your password secret and for activity under your account. We may suspend accounts that abuse the service.']],
        ['Reviews and content', [
          'Reviews come from real buyers who received their order. Abusive, unlawful or infringing content is not allowed, and we may hide any review that breaks these rules.',
          'You are responsible for the photos and reviews you upload and you allow us to display them on the platform.',
        ]],
        ['Moda assistant (AI)', ['Moda suggests products and outfits using AI and can make mistakes. Products and prices come from the stores\' real catalogue, but please check the details and size before you buy. Size suggestions are guidance, not a guarantee.']],
        ['Acceptable use', ['Do not attempt to hack or abuse the site, scrape its data automatically, or impersonate others.']],
        ['Limits of liability', ['We try to keep information accurate and up to date but cannot guarantee it is error-free. The seller store is responsible for its products and their quality; we are responsible for running the platform and for the delivery services we provide ourselves, within the limits of the law.']],
        ['Returns and exchanges', ['See the "Return Policy" page.']],
        ['Governing law', [
          'These terms are governed by Egyptian law. Disputes are first settled amicably and then before the competent Egyptian courts. This does not reduce your rights as a consumer under the Consumer Protection Law.',
          'We may update these terms; continuing to use the service after an update means you accept it.',
        ]],
      ],
    },
  },

  returns: {
    ar: {
      title: 'سياسة الاسترجاع والاستبدال',
      intro: 'عايزينك تشتري وإنت مطمّن. دي القواعد الأساسية للاسترجاع والاستبدال على بنها أوتفيت.',
      sections: [
        ['المعاينة قبل الاستلام', [
          'تقدر تفتح الطلب وتعاين المنتج قدام المندوب قبل ما تدفع. لو في عيب أو المنتج مش اللي طلبته، ارفض الاستلام ومش هتدفع أي حاجة.',
          'ده بينطبق كمان على طلبات "مش لاقي في بنها".',
        ]],
        ['الاستبدال', [
          'تقدر تستبدل المقاس أو اللون خلال 3 أيام من الاستلام (أو المدة اللي المتجر كاتبها في صفحته لو أطول)، بشرط إن المنتج لم يُستخدم وعليه التيكت وفي عبوته الأصلية.',
        ]],
        ['الاسترجاع للعيوب أو عدم المطابقة', [
          'لو المنتج فيه عيب أو مختلف عن المعروض (المقاس أو اللون أو الموديل)، تقدر ترجّعه أو تستبدله خلال 14 يوم من الاستلام، وده حسب قانون حماية المستهلك المصري، والشحن علينا أو على المتجر.',
        ]],
        ['حاجات مش بتترجع', [
          'الملابس الداخلية ومنتجات النظافة الشخصية والمنتجات اللي اتفصّلت أو اتجهزت خصيصًا ليك، إلا لو فيها عيب.',
          'المنتجات المستخدمة أو المغسولة أو اللي التيكت اتشال منها.',
        ]],
        ['إزاي تطلب', [
          'كلّمنا على واتساب أو بالتليفون على الأرقام الموضحة أسفل الصفحة، وابعت رقم الطلب وصورة للمنتج لو في عيب. تقدر تلاقي رقم طلبك وتتابعه من صفحة "تتبع الطلب".',
          'هنتواصل معاك لتحديد معاد استلام المنتج.',
        ]],
        ['استرداد المبلغ', [
          'بعد ما المنتج يرجع ويتفحّص، بنرجعلك المبلغ كاش أو تحويل خلال حد أقصى 7 أيام عمل.',
          'مصاريف الشحن الأصلية بترجع لو المرتجع بسبب عيب أو خطأ مننا أو من المتجر.',
        ]],
        ['متاجر بسياسات أوسع', ['بعض المتاجر بتقدّم مدة استبدال أو استرجاع أطول. لو المتجر كاتب سياسة أفضل في صفحته، بتتطبق هي.']],
      ],
    },
    en: {
      title: 'Return & Exchange Policy',
      intro: 'We want you to shop with confidence. These are the basic rules for returns and exchanges on Banha Outfit.',
      sections: [
        ['Inspection before receiving', [
          'You can open the parcel and inspect the item in front of the courier before you pay. If there is a defect or it is not what you ordered, refuse it and you pay nothing.',
          'This also applies to "Can\'t find it in Banha" requests.',
        ]],
        ['Exchanges', ['You can exchange the size or colour within 3 days of receiving it (or the longer period the store states on its page), as long as the item is unused, tagged and in its original packaging.']],
        ['Returns for defects or non-conformity', ['If the item is defective or differs from what was shown (size, colour or model), you can return or exchange it within 14 days of receiving it, in line with the Egyptian Consumer Protection Law, and shipping is on us or the store.']],
        ['What cannot be returned', [
          'Underwear and personal-hygiene items, and made-to-order or specially prepared items, unless they are defective.',
          'Items that are used, washed or have the tags removed.',
        ]],
        ['How to request', [
          'Contact us on WhatsApp or by phone using the details at the bottom of the page, and send the order number and a photo if there is a defect. You can find your order number and follow it on the "Track order" page.',
          'We will get in touch to arrange collecting the item.',
        ]],
        ['Refunds', [
          'Once the item is back and checked, we refund you in cash or by transfer within 7 working days at most.',
          'The original shipping fee is refunded when the return is due to a defect or a mistake by us or the store.',
        ]],
        ['Stores with wider policies', ['Some stores offer a longer exchange or return period. If a store states a better policy on its page, that one applies.']],
      ],
    },
  },
};

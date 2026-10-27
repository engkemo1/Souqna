/** Legal pages (privacy, terms). Arabic is the reference text; English is a faithful translation.
 *  Contact details come from config/contact.js at render time. Keep UPDATED in sync when the text changes. */
export const LEGAL_UPDATED = '2026-10-12';

export const LEGAL = {
  privacy: {
    ar: {
      title: 'سياسة الخصوصية',
      intro: 'Twist منصة بتجمع متاجر ملابس من بنها في مكان واحد. الصفحة دي بتوضّح إيه البيانات اللي بنجمعها، ليه، وبنعمل بيها إيه، وإيه حقوقك.',
      sections: [
        ['البيانات اللي بنجمعها', [
          'عند إتمام الطلب: الاسم، رقم الموبايل، المحافظة والمدينة والعنوان، وملاحظات التوصيل، وتفاصيل الطلب.',
          'لو عملت حساب (اختياري): الاسم ورقم الموبايل وباسورد متشفّر (إحنا مش بنشوف الباسورد)، بالإضافة لخزانتك والمنتجات اللي بتتابعها وإشعاراتك.',
          'التقييمات: نص التقييم وأي صور بترفعها، وبيظهروا للناس باسمك الأول فقط.',
          'طلبات "مش لاقي في بنها": الوصف والصورة (لو رفعتها) وبيانات التواصل والعنوان اللي بتكتبها.',
          'المساعد تويلا: الرسائل والصور اللي بتبعتها للمساعد بتتبعت لمزوّد الذكاء الاصطناعي (Anthropic أو Cloudflare) عشان يرد عليك. لو عامل حساب، بنحفظ آخر 20 محادثة نصية في حسابك عشان تقدر ترجع لها أو تمسحها من سجل المحادثات. صور الشات نفسها مش بتتحفظ في السجل. من غير حساب، المحادثة بتفضل على جهازك طول ما الصفحة مفتوحة بس. وممكن نحتفظ بنص قصير عن تفضيلاتك وتقييماتك لتويلا على جهازك، وتقدر تمسح التفضيلات من داخل المحادثة.',
          'لو قيّمت رد تويلا، بنحفظ تقييمك وطلبك والرد والقطع المقترحة وسبب التقييم (لو اخترته) في سجل محدود يراجعه فريق Twist لتحسين جودة التنسيق. تقدر تتجنب إرسال التقييم، وفريق الإدارة يقدر يحذف السجل.',
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
          'فريق Twist لما يكون التوصيل علينا أو لما تطلب حاجة من خلالنا.',
          'مزوّد الذكاء الاصطناعي ومزوّد تخزين الصور واستضافة الموقع (زي Railway وCloudflare) بالقدر اللازم لتشغيل الخدمة فقط.',
          'الجهات الرسمية لو القانون طلب ده.',
        ]],
        ['الكوكيز والتخزين على جهازك', [
          'مش بنستخدم كوكيز إعلانية. بنحفظ على جهازك حاجات ضرورية للتشغيل والتخصيص زي السلة والمفضلة واللغة ودخول حسابك وتفضيلات تويلا؛ وتقدر تمسح ذاكرة التفضيلات من داخل محادثتها.',
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
      intro: 'Twist brings fashion stores from Banha together in one place. This page explains what data we collect, why, what we do with it, and your rights.',
      sections: [
        ['Data we collect', [
          'When you place an order: your name, mobile number, governorate, city and address, delivery notes and the order details.',
          'If you create an account (optional): your name, mobile number and a hashed password (we never see it), plus your wardrobe, the products you watch and your notifications.',
          'Reviews: the review text and any photos you upload; they are shown with your first name only.',
          '"Can\'t find it in Banha" requests: the description, photo (if you add one), contact details and address you enter.',
          'The Twila assistant: messages and photos you send are passed to our AI provider (Anthropic or Cloudflare) so it can answer. If you have an account, we save your latest 20 text conversations to your account so you can revisit or delete them from chat history. Chat photos are not saved in that history. Without an account, the conversation stays on your device only while the page is open. A short note of your preferences and Twila ratings may also be kept on your device; you can clear the learned preference memory in the chat.',
          'If you rate a Twila reply, we store your rating, request, reply, suggested pieces and any selected reason in a limited feedback log for the Twist team to review and improve styling quality. Rating is optional, and administrators can delete the feedback record.',
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
          'The Twist team when we deliver or when you ask us to source something.',
          'Our AI provider, photo storage and hosting providers (such as Railway and Cloudflare), only as needed to run the service.',
          'Public authorities where the law requires it.',
        ]],
        ['Cookies and on-device storage', [
          'We do not use advertising cookies. We store only what the site needs on your device for operation and personalisation: cart, favourites, language, sign-in and Twila preferences; you can clear the learned preference memory in the chat.',
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
      intro: 'باستخدامك لـ Twist أو بإتمامك طلب من خلاله، أنت موافق على الشروط دي. لو مش موافق، من فضلك متستخدمش الخدمة.',
      sections: [
        ['إحنا مين', [
          'Twist منصة بتعرض منتجات متاجر مستقلة من بنها وتسهّل الطلب والتوصيل. كل متجر هو البائع المسؤول عن منتجاته وأسعاره ومخزونه.',
        ]],
        ['الطلبات والأسعار', [
          'الأسعار بالجنيه المصري وبتتحدد من كل متجر. الطلب بيتأكد بعد ما المتجر (أو فريقنا) يراجعه، وممكن يتعدّل أو يتلغي لو المنتج خلص أو في خطأ واضح في السعر.',
          'الدفع حاليًا عند الاستلام. المصاريف والشحن بتظهر قبل ما تأكد الطلب.',
          'لازم تكتب بياناتك صح (الاسم والرقم والعنوان) عشان نقدر نوصّلك. لو الرقم مش بيرد أو العنوان غلط ممكن يتأجل الطلب أو يتلغي.',
        ]],
        ['التوصيل', [
          'مواعيد التوصيل تقديرية. توصيل نفس اليوم متاح في المتاجر اللي بتفعّله وقبل موعد القفل اللي المتجر بيحدده، وبيتوقف تلقائيًا بعده.',
          'بعض الطلبات بيوصّلها المتجر نفسه وبعضها بيوصّلها فريق Twist، وبيتحدد ده عند الطلب.',
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
        ['المساعد تويلا (ذكاء اصطناعي)', [
          'تويلا بتقترح منتجات وإطلالات بالذكاء الاصطناعي وممكن تغلط. المنتجات والأسعار بتيجي من كتالوج المتاجر الحقيقي، لكن لازم تراجع التفاصيل والمقاس قبل ما تشتري. اقتراحات المقاس إرشادية مش ضمان.',
        ]],
        ['الاستخدام المسموح', [
          'ممنوع محاولة اختراق الموقع أو إساءة استخدامه أو سحب بياناته بشكل آلي أو انتحال شخصية.',
        ]],
        ['حدود المسؤولية', [
          'بنحاول نخلي المعلومات دقيقة ومحدّثة، لكن مش بنضمن خلوها من الأخطاء. مسؤولية المنتج وجودته على المتجر البائع، وإحنا مسؤولين عن تشغيل المنصة وخدمات التوصيل اللي بنقدمها بنفسنا، في حدود القانون.',
        ]],
        ['الاسترجاع والاستبدال', ['كل محل بيحدد سياسة الاستبدال والاسترجاع الخاصة بيه ومدتها (المعتاد 3 أيام من الاستلام)، وبتلاقيها مكتوبة في صفحة المحل. ده لا يخل بحقوقك في قانون حماية المستهلك المصري.']],
        ['القانون الواجب التطبيق', [
          'تخضع الشروط دي للقانون المصري، وأي نزاع بيتحل ودّيًا الأول، وبعدها قدام المحاكم المصرية المختصة. ده مش بيقلل من حقوقك كمستهلك بموجب قانون حماية المستهلك.',
          'ممكن نعدّل الشروط، واستمرارك في استخدام الخدمة بعد التعديل معناه موافقتك عليها.',
        ]],
      ],
    },
    en: {
      title: 'Terms & Conditions',
      intro: 'By using Twist, or placing an order through it, you agree to these terms. If you do not agree, please do not use the service.',
      sections: [
        ['Who we are', ['Twist is a platform that shows products from independent stores in Banha and makes ordering and delivery easier. Each store is the seller responsible for its own products, prices and stock.']],
        ['Orders and prices', [
          'Prices are in Egyptian pounds and are set by each store. An order is confirmed after the store (or our team) reviews it, and it may be changed or cancelled if the item is out of stock or there is an obvious pricing error.',
          'Payment is currently cash on delivery. Fees and shipping are shown before you confirm.',
          'You must give correct details (name, number, address) so we can deliver. If the phone does not answer or the address is wrong, the order may be delayed or cancelled.',
        ]],
        ['Delivery', [
          'Delivery times are estimates. Same-day delivery is available from stores that turn it on, before the cut-off time the store sets, and it switches off automatically afterwards.',
          'Some orders are delivered by the store itself and some by the Twist team; this is decided when you order.',
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
        ['Twila assistant (AI)', ['Twila suggests products and outfits using AI and can make mistakes. Products and prices come from the stores\' real catalogue, but please check the details and size before you buy. Size suggestions are guidance, not a guarantee.']],
        ['Acceptable use', ['Do not attempt to hack or abuse the site, scrape its data automatically, or impersonate others.']],
        ['Limits of liability', ['We try to keep information accurate and up to date but cannot guarantee it is error-free. The seller store is responsible for its products and their quality; we are responsible for running the platform and for the delivery services we provide ourselves, within the limits of the law.']],
        ['Returns and exchanges', ['Each store sets its own exchange and return policy and period (usually 3 days from receiving the order), shown on the store page. This does not affect your rights under the Egyptian Consumer Protection Law.']],
        ['Governing law', [
          'These terms are governed by Egyptian law. Disputes are first settled amicably and then before the competent Egyptian courts. This does not reduce your rights as a consumer under the Consumer Protection Law.',
          'We may update these terms; continuing to use the service after an update means you accept it.',
        ]],
      ],
    },
  },
};

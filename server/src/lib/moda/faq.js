/**
 * أسئلة الخدمة اللي بتتسأل لمودة وهي مش طلب لبس: مين أنت، فين طلبي، الشحن، الدفع، الاستبدال، إلغاء الطلب…
 * الإجابات هنا بس من حاجات موجودة فعلًا في المنصة (تتبع الطلب، الدفع عند الاستلام، الاستبدال حسب سياسة كل محل (افتراضي 3 أيام)، الشحن بيتحسب لكل محل).
 * أي حاجة مش مضمونة ما بتتقالش: بنوجّه العميل للمحل أو للصفحة المناسبة بدل ما نخترع رقم أو وعد.
 */
import { norm } from './text.js';

/** كل قاعدة: patterns على النص بعد norm()، ولو واحدة اتطابقت يرجع الـid. الترتيب مهم (الأخص الأول). */
/** كلمة كاملة (مش جزء من كلمة): بدل \b اللي ما بتشتغلش مع العربي. */
const W = (alts) => new RegExp(`(^| )(${alts})( |$)`);
const ORDER = '(ال)?(طلب|طلبي|طلبيه|طلبيتي|اوردر|اوردري|شحنتي)|order|parcel';

const RULES = [
  { id: 'order_change', re: [new RegExp(`(^| )(اغير|اعدل|تعديل|غير|عدل|الغي|الغاء|كنسل|cancel|change|edit)( [^ ]+){0,3} (${ORDER})( |$)`), new RegExp(`(^| )(${ORDER})( [^ ]+){0,3} (اغير|اعدل|الغي|الغاء|كنسل|cancel|change)( |$)`)] },
  { id: 'order_track', re: [new RegExp(`(^| )(فين|وصل|حاله|متابعه|تتبع|اتابع|track|where)( [^ ]+){0,3} (${ORDER})( |$)`), new RegExp(`(^| )(${ORDER})( [^ ]+){0,3} (فين|وصل|اتاخر|متاخر|مجاش|ماوصلش)( |$)`)] },
  { id: 'returns', re: [W('ارجع|ارجاع|استرجاع|استبدال|ابدل|اسبدل|return|exchange|refund'), /(^| )(اغير|غير|هغير|هبدل) (ال)?مقاس/] },
  { id: 'payment', re: [W('الدفع|ادفع|فيزا|بطاقه|payment|visa'), /(فودافون كاش|انستا باي|طرق الدفع|طريقه الدفع)/] },
  { id: 'shipping_time', re: [/(توصيل|شحن|طلب|يوصل)( [^ ]+){0,3} (ياخد|بياخد|مده|امتي|وقت)/, /(توصيل|شحن|يوصل)( [^ ]+){0,3} كام يوم/, /(how long|delivery time|when.*arrive)/] },
  { id: 'shipping_where', re: [/(توصيل|توصلوا|بتوصلوا|شحن)( [^ ]+){0,2} (ل|الي|في|ل)[^ ]*( |$)/, /(do you|can you|will you).*(deliver|ship)/, /(deliver|ship).*( to | in )/] },
  { id: 'shipping_cost', re: [/(سعر|تكلفه|مصاريف|كام|بكام|بكم)( [^ ]+){0,2} (الشحن|شحن|التوصيل|توصيل)/, /(الشحن|شحن|التوصيل|توصيل)( [^ ]+){0,2} (كام|بكام|مجاني|ببلاش|بكم|سعر|تكلف|مصاريف)/, /(shipping|delivery).*(cost|price|fee|free|how much)/] },
  { id: 'safety', re: [/(^| )((ال)?(امان|امن|مضمون|مضمونه|نصب|نصابين|نصابه|ثقه)|safe|secure|scam|legit|trusted)( |$)/, /(بياناتي|بيانات|فلوسي)( [^ ]+){0,2} (في )?امان/] },
  { id: 'seller_dashboard', re: [/(لوحه|ادمن|admin|dashboard)( [^ ]+){0,2} (ال)?(محل|متجر|المحل|البايع|التاجر)/, /(ازاي|كيف|how)( [^ ]+){0,3} (اضيف|ارفع|اعدل|انزل)( [^ ]+){0,2} (منتج|منتجات|صور)/, /(ادخل|افتح|استخدم)( [^ ]+){0,2} (لوحه|ادمن|حساب) (ال)?(محل|متجر|بايع|تاجر)/, /(how|where).*(manage|add).*(my )?(store|product)/] },
  { id: 'seller_join', re: [/(افتح|اعمل|اسجل|انضم|اضيف|عايز|عاوز|ابدا)( [^ ]+){0,3} (محل|متجر|محلي|كبايع|كتاجر)( |$)/, /(ابيع|بيع|اعرض)( [^ ]+){0,3} (علي|في|عند|ب)( )?(ال)?(موقع|طله|منصه)/, /(join|sell on|open (a )?store|become a seller)/, /(^| )(انضم|انضمام)( |$)/] },
  { id: 'how_order', re: [/(ازاي|كيف|طريقه|how)( [^ ]+){0,3} (اطلب|اشتري|اكمل|اتمم|اعمل اوردر|اعمل طلب|order|buy|checkout|purchase)/, /(^| )(خطوات|طريقه) (ال)?(طلب|شراء|اوردر)( |$)/] },
  { id: 'visual_search', re: [/(ابحث|سيرش|ادور|دور|بحث)( [^ ]+){0,3} (ب)?(ال)?صوره/, /(search|find)( [^ ]+){0,3} (by|with|using) (a )?(photo|image|picture)/, /(^| )(البحث بالصوره|بحث بالصوره)( |$)/] },
  { id: 'product_request', re: [/(مش لاقي|مش لاقيه|مش موجود|مش لاقين)( [^ ]+){0,4} (منتج|حاجه|الحاجه)/, /(اطلب|ابعت|اعمل)( [^ ]+){0,2} (منتج|طلب) (خاص|مخصوص|مش موجود)/, /(request|ask for)( [^ ]+){0,2} (a )?(product|item) (that|not|which)/] },
  { id: 'account', re: [/(^| )(حسابي|حساب|تسجيل|اسجل|سجل|لوجين|login|register|signup|sign up|account)( |$)/, /(نسيت|ضاع)( [^ ]+){0,2} (باسورد|الباسورد|كلمه السر|كلمه المرور|password)/] },
  { id: 'stores_list', re: [/(ايه|اي|مين|فيه|فين|عندكم|عندكو|show|which|what)( [^ ]+){0,3} (المحلات|محلات|متاجر|المتاجر|stores|shops)/, /(المحلات|محلات|المتاجر|متاجر) (ايه|اللي|الموجوده|المتاحه|مين)/] },
  { id: 'about', re: [/(احنا|انتوا|انتم|طله|الموقع ده|الموقع دا|المنصه دي|المنصه دي) (مين|ايه|بتعملوا ايه)/, /(مين|ايه) (انتوا|انتم|طله|الموقع ده|المنصه دي)/, /(^| )(about (us|talla)|who are you guys|what is talla|what is this (site|website))( |$)/, /(عنكم|عنا|عن الموقع|عن طله)( |$)/] },
  { id: 'everything', re: [/(عندكم|عندكو|فيه|موجود) (كل حاجه|كل شي|كل شيء|كله|كل اللبس)/, /(do you (have|sell) everything|have everything)/] },
  { id: 'site_help', re: [/(ازاي|كيف|how)( [^ ]+){0,3} (استخدم|استعمل|اتعامل|اشتغل|use)( [^ ]+){0,2} (ال)?(موقع|منصه|تطبيق|الصفحه|site|website|app|platform)/, /(مساعده|ساعدني|محتاج مساعده|اتعلم|شرح|شرحلي|اشرحلي|help me use|how does (this|it) work|how to use)/, /(الموقع ده|الموقع دا|الموقع) (بيشتغل|شغال|استخدامه)/] },
  { id: 'support', re: [/(اكلم|اتواصل|اتصل|كلمني|ابلغ|اشتكي)( [^ ]+){0,3} (حد|حدا|خدمه العملاء|الدعم|الاداره|مسؤول|صاحب)/, /(خدمه العملاء|الدعم الفني|رقم (التليفون|الواتس|الواتساب|الدعم)|واتساب|contact (you|support|us)|customer (service|support)|support team|human)/] },
  { id: 'about_ai', re: [/(^| )(انت|انتي|حضرتك|you)( [^ ]+){0,2} (gemini|chatgpt|gpt|claude|openai|deepseek|copilot|ai|ذكاء|ذكي|روبوت|بوت|بشر|انسان|حقيقي|real|human|robot|bot)( |$)/, /(موديل|model)( [^ ]+){0,2} (ايه|اي|انهي|which|what)/, /(بتشتغل|شغاله|شغال|مبني|متصنع)( [^ ]+){0,2} (بايه|بإيه|ب ايه|علي ايه|on what)/] },
  { id: 'howareyou', re: [/(^| )(ايه|اي|ازي|ايش) (ال)?اخبار(ك|كم|ها)?( |$)/, /(^| )(ال)?اخبارك( |$)/, /(^| )(عامل ايه|عامله ايه|عاملين ايه|how are you|how r u|whats up|what's up)( |$)/] },
  { id: 'identity', re: [/^(انت|انتي|حضرتك) (مين|ايه)( |$)/, /(^| )(مين انت|مين انتي|اسمك|بتعملي ايه|بتعمل ايه|تقدر تعمل ايه|تقدري تعملي ايه|انت روبوت|انت بوت)( |$)/, /(who are you|what are you|your name|what can you do)/] },
  { id: 'smalltalk', re: [W('نكته|نكت|احكيلي|هزار|اضحكني|joke'), /(عامل ايه|عامله ايه|اخبارك|how are you)/] },
  { id: 'offtopic', re: [/(الدولار|الذهب|الدوري|ماتش|الانتخابات|السياسه)/, /(^| )اخبار (مصر|البلد|الرياضه|الدوري|السياسه|الطقس|النهارده)/, /(bitcoin|dollar rate|football|politics)/] },
  { id: 'complaint', re: [/^(مش عاجبني|مش عاجبه|مش حلو|ماعجبنيش|معجبنيش|وحش)( |$)/, /(مش عاجبني|ماعجبنيش|معجبنيش) (حاجه|حاجات|اي حاجه|دول|ده|دي)/, /(not (good|nice)|i don.?t like)/] },
];

export const FAQ_ANSWERS = {
  ar: {
    order_change: 'لتعديل الطلب أو إلغائه كلّم المحل اللي طلبت منه بأسرع وقت قبل ما يتشحن، وتلاقي طريقة التواصل في صفحة المحل. ولو عايز تشوف حالة الطلب افتح صفحة «تتبع الطلب».',
    order_track: 'تقدر تتابع طلبك من صفحة «تتبع الطلب» برقم التتبع اللي وصلك بعد تأكيد الطلب، وبتشوف فيها حالته خطوة بخطوة.',
    returns: 'كل محل بيحدد مدة الاستبدال والاسترجاع الخاصة بيه، والمعتاد 3 أيام من الاستلام. مدة المحل مكتوبة في صفحته، ولو محتاج حاجة معينة كلّم المحل اللي طلبت منه.',
    payment: 'الدفع دلوقتي عند الاستلام: بتدفع كاش للمندوب لما الطلب يوصلك.',
    shipping_where: 'في سلة Twist، مصاريف التوصيل بتتحدد حسب المدينة أو المنطقة وبتظهر مرة واحدة قبل تأكيد الطلب. لو بتطلب من صفحة محل، هتشوف شروط الشحن الخاصة بالمحل في السلة.',
    shipping_cost: 'في سلة Twist، مصاريف التوصيل بتتحدد حسب المدينة أو المنطقة، وبتدفع مرة واحدة حتى لو طلبت من أكتر من محل. الشحن المجاني يظهر لما كل المحلات في السلة تكون مؤهلة له. في سلة المحل، تطبق شروط الشحن الخاصة بالمحل.',
    shipping_time: 'مدة التوصيل بتختلف من محل لمحل، ومعظم المحلات بتوضحها في صفحتها. وبعد ما تطلب تقدر تتابع الطلب من صفحة «تتبع الطلب».',
    about_ai: 'أنا مودة، مساعدة تسوق بالذكاء الاصطناعي في Twist (مش إنسان). مقدرش أحدد الموديل اللي بيشغّلني، لكن شغلي أرشحلك لبس من محلات بنها وأجاوب على أسئلتك عن الطلب والموقع.',
    howareyou: 'الحمد لله تمام، شكرًا لسؤالك! قولي بتدور على إيه النهارده أو لأي مناسبة وأرشحلك.',
    identity: 'أنا {name}، مساعدة التسوق في Twist. برشحلك لبس من محلات بنها حسب المناسبة والميزانية والألوان اللي بتحبها، وبجاوب على أسئلة الطلب والشحن والاستبدال.',
    smalltalk: 'أنا متخصصة في اللبس والتسوق من محلات بنها. قولي بتدور على إيه أو لأي مناسبة وأرشحلك.',
    offtopic: 'ده خارج اللي أقدر أساعدك فيه. أنا بساعد في اختيار اللبس من محلات بنها، قولي بتدور على إيه.',
    safety: 'الدفع دلوقتي عند الاستلام، يعني مفيش بيانات كارت أو فلوس بتتدفع على الموقع قبل ما تستلم. وأنا عمري ما هطلب منك كلمة سر أو بيانات كارت. المحلات على Twist محلات حقيقية في بنها، وتقدر تتابع كل طلب من صفحة «تتبع الطلب».',
    seller_dashboard: 'لوحة المحل بتدخلها بالحساب اللي فريق Twist بيجهزه ليك (من صفحة «تسجيل الدخول»). من جواها بتضيف المنتجات وصورها وأسعارها، وبتتابع الطلبات والمخزون، وتعمل عروض وتظبط شكل متجرك وتشوف تقارير المبيعات، وكله من الموبايل. لو لسه معندكش حساب، افتح صفحة «انضم كبائع» وكلّمنا.',
    seller_join: 'عشان تبيع على Twist افتح صفحة «انضم كبائع» وكلّمنا على الواتساب أو بالتليفون، وقولنا اسم المحل ونوع اللبس. إحنا بنجهز لك المتجر ونرفع المنتجات، وبعدين يوصلك لينك تدخل بيه لوحة محلك وتبدأ تستلم الطلبات.',
    how_order: 'الطلب سهل: دوّر على المنتج أو اطلب مني ترشيح، افتح المنتج واختار المقاس واللون وضيفه للسلة، وبعدين اكمل الطلب وادخل بياناتك وعنوانك. في سلة Twist هتشوف رسوم توصيل واحدة حسب منطقتك وتدفع الإجمالي كاش للمندوب عند الاستلام، وتتابع الطلب من صفحة «تتبع الطلب».',
    visual_search: 'تقدر تدوّر بصورة: افتح «البحث بالصورة» من الموقع وارفع صورة لقطعة عاجباك، وهجيبلك منتجات شبهها من المحلات. الأفضل تكون الصورة واضحة وللقطعة نفسها.',
    product_request: 'لو مش لاقي حاجة معينة، استخدم صفحة «اطلب منتج» وصف اللي بتدور عليه وضيف صورة لو معاك، وبتوصل للمحلات. وممكن كمان تقولي أنا هو إيه وأدوّر لك على أقرب بديل متاح.',
    account: 'بتعمل حساب برقم موبايلك من صفحة «تسجيل الدخول»، ومن «حسابي» بتتابع طلباتك والمحلات اللي بتتابعها. ولو واجهتك مشكلة في الدخول كلّم فريق Twist من صفحة «انضم كبائع».',
    stores_list: 'Twist فيها محلات لبس من بنها، وكلهم في صفحة «المحلات» وفي شريط المحلات في الصفحة الرئيسية. تقدر تفتح أي محل وتشوف منتجاته. وقولي بتدور على إيه وأنا أرشحلك من المحلات المتاحة.',
    about: 'Twist منصة بتجمع محلات لبس بنها في مكان واحد. بتتصفح منتجات أكتر من محل وبتطلب من أكتر من محل في نفس الطلب، وتدفع عند الاستلام. وأنا {name} مساعدة التسوق: برشحلك لبس حسب المناسبة والميزانية.',
    everything: 'عندنا لبس رجالي وحريمي وأطفال وجزم وإكسسوارات من محلات بنها، بس المتاح بيختلف من محل لمحل ومن وقت لوقت. قولي بتدور على إيه بالظبط وأقولك اللي موجود دلوقتي.',
    site_help: 'بسيطة: دوّر في خانة البحث أو من الأقسام، أو قولي أنا عايز إيه وأرشحلك. افتح المنتج واختار المقاس والسلة، وكمّل الطلب وادفع عند الاستلام، وتابعه من «تتبع الطلب». وللبحث بالصورة فيه صفحة «البحث بالصورة». وقولي لو عايز أشرح لك حاجة معينة.',
    support: 'للطلبات والمنتجات كلّم المحل مباشرة من صفحته. ولأي حاجة تخص الموقع نفسه تلاقي واتساب وتليفون فريق Twist في صفحة «انضم كبائع».',
    complaint: 'آسفة إن الاختيارات ما عجبتكش. قولي إيه اللي مش مناسب: السعر، اللون، الموديل ولا النوع؟ وأعدّل الترشيح على ذوقك.',
  },
  en: {
    order_change: 'To change or cancel an order, contact the store you ordered from as soon as possible, before it ships — contact details are on the store page. You can also check the status on the "Track order" page.',
    order_track: 'You can follow your order on the "Track order" page with the tracking number you received when you confirmed it.',
    returns: 'Each store sets its own exchange and return period, usually 3 days from receiving the order. The period is shown on the store page; for anything specific, contact the store you ordered from.',
    payment: 'Payment is currently cash on delivery: you pay the courier when the order arrives.',
    shipping_where: 'In the Twist marketplace basket, one delivery fee is calculated for your area and shown before you confirm, even when your order includes multiple stores. A store-page basket follows that store\'s shipping terms.',
    shipping_cost: 'The Twist marketplace basket has one area-based delivery fee, charged once for orders from multiple stores. Each store\'s free-shipping threshold applies to its own items; the shared fee is waived only when every store in the basket qualifies. A store-page basket follows that store\'s shipping terms.',
    shipping_time: 'Delivery time differs by store and most stores explain it on their page. After ordering you can follow it on the "Track order" page.',
    about_ai: 'I\'m Moda, an AI shopping assistant at Twist (not a human). I can\'t say which model powers me, but I suggest outfits from Banha stores and answer questions about orders and the site.',
    howareyou: 'Doing great, thanks for asking! Tell me what you\'re looking for or the occasion and I\'ll suggest something.',
    identity: 'I\'m {name}, the shopping assistant at Twist. I recommend outfits from Banha stores by occasion, budget and colours, and I can answer questions about orders, shipping and exchanges.',
    smalltalk: 'I\'m focused on fashion and shopping from Banha stores. Tell me what you\'re looking for or the occasion and I\'ll suggest something.',
    offtopic: 'That\'s outside what I can help with. I help you choose clothes from Banha stores — tell me what you\'re looking for.',
    safety: 'Payment is cash on delivery, so no card details or money are taken on the site before you receive your order. I will never ask for a password or card details. The stores on Twist are real Banha stores and you can follow every order on the "Track order" page.',
    seller_dashboard: 'You sign in to your store dashboard with the account the Twist team sets up for you (via the "Login" page). There you add products, photos and prices, follow orders and stock, create offers, style your store and see sales reports, all from your phone. If you do not have an account yet, open the "Join as a seller" page and talk to us.',
    seller_join: 'To sell on Twist open the "Join as a seller" page and contact us on WhatsApp or by phone with your store name and what you sell. We set up your store and upload your products, then you get a link to your store dashboard and start receiving orders.',
    how_order: 'Ordering is easy: search for an item or ask me for a suggestion, open it, pick size and colour and add it to the basket, then continue, enter your details and address and confirm. You see shipping before confirming, pay cash on delivery, and follow the order on the "Track order" page.',
    visual_search: 'You can search by photo: open "Search by photo" on the site and upload a picture of a piece you like and I will find similar products from the stores. A clear photo of the item itself works best.',
    product_request: 'If you cannot find something specific, use the "Request a product" page: describe it and add a photo if you have one. You can also tell me what it is and I will look for the closest available alternative.',
    account: 'You create an account with your phone number from the "Login" page, and in "My account" you follow your orders and the stores you follow. If you have trouble signing in, contact the Twist team from the "Join as a seller" page.',
    stores_list: 'Twist has Banha clothing stores, all listed on the "Stores" page and in the stores strip on the home page. Open any store to see its products, or tell me what you need and I will suggest from the available stores.',
    about: 'Twist brings Banha clothing stores together in one place. You browse many stores and can order from several in one go, paying on delivery. I am {name}, the shopping assistant: I suggest outfits by occasion and budget.',
    everything: 'We have men, women and kids clothing, shoes and accessories from Banha stores, but what is available differs by store and over time. Tell me exactly what you need and I will tell you what is there right now.',
    site_help: 'Simple: search or browse the departments, or just tell me what you need and I will suggest. Open an item, choose size and colour, add to basket, continue and pay on delivery, then follow it on "Track order". There is also a "Search by photo" page. Tell me if you want any part explained.',
    support: 'For orders and products contact the store directly from its page. For anything about the site itself you will find the Twist team WhatsApp and phone on the "Join as a seller" page.',
    complaint: 'Sorry the picks were not right. What was off: the price, colour, style or type? I\'ll adjust.',
  },
};

/** → id أو null. text: النص الخام. */
export function matchFaq(text) {
  const n = ` ${norm(text)} `.trim();
  if (!n) return null;
  for (const rule of RULES) if (rule.re.some((r) => r.test(n))) return rule.id;
  return null;
}

export const faqAnswer = (id, { lang = 'ar', name = null } = {}) => {
  const L = lang === 'en' ? 'en' : 'ar';
  const tpl = FAQ_ANSWERS[L][id];
  return tpl ? tpl.replace('{name}', name || (L === 'en' ? 'Moda' : 'مودة')) : null;
};

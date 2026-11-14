تشغيل (من فولدر server، مع مفاتيحك في البيئة، من غير ما تتكتب في أي ملف):
  PowerShell:  $env:GEMINI_API_KEY="..."; $env:GROQ_API_KEY="..."; node tests/provider_check/provider_check.mjs both
  (أو gemini / groq لواحد بس. الموديلات الافتراضية gemini-2.5-flash و openai/gpt-oss-20b، وتتغير بـ GEMINI_MODEL / GROQ_MODEL)
بيفحص رد الموديل الخام على 6 سيناريوهات (منها طقمين مضغوطين S5/S6 وأطقم متعددة لـ3 أشخاص) في 5 محاور:
  1 فهم تعليمات تويلا · 2 منتجات صحيحة من الكتالوج · 3 قواعد التنسيق · 4 JSON سليم · 5 الأطقم المتعددة
وبيطبع PASS/FAIL لكل فحص وخلاصة لكل مزوّد. من غير مفتاح: BLOCKED.

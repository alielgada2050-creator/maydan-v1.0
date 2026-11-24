// ================================================================
// Module: occupational health & safety (السلامة والصحة المهنية)
// Knowledge base condensed from the documents supplied by the user:
//   • قواعد سلامة التوزيع — DHSEM No:01-012 (2019)
//   • وثائق سلامة التوزيع — DHSEM No:01-002 (تحديث 1 — 2022/07/05)
//   • القواعد الذهبية للسلامة — SEC 5-Star Safety
//   • تصاريح العمل في الجهد المنخفض — إدارة العمليات والصيانة بمدينة الرياض (عرض تدريبي)
//   • تحديث إصدار تصاريح الجهد المنخفض (دورة تدريبية)
//   • نموذج فريق العمل للمقاول — Contractor Team Work Form (TWF)
// The platform uses it for: recommendations on every transaction, the site checklist
// before HSE approval, and three bilingual generators (TWF · safe work procedure · risk assessment).
// Users can upload their own procedures / risk assessments: the text is analysed
// (locally, and with the AI provider when configured) and the chosen items join the work-type library.
// Loaded before the DB is created, so only declarations live at top level.
// ================================================================
const HSE_SRC = {
  r012: 'قواعد سلامة التوزيع DHSEM 01-012',
  r002: 'وثائق سلامة التوزيع DHSEM 01-002',
  gr: 'القواعد الذهبية للسلامة',
  ptw: 'تصاريح العمل — الجهد المنخفض',
  ohs: 'OHS-PR-02-17 إجراء الأنفاق والحفريات'
};
const GOLDEN_RULES = [
  ['إجراءات العمل الآمن', 'Safe working procedures', 'لا يعمل أحد إلا إذا كان مدرَّباً ومفوَّضاً، ويعرف تقييم المخاطر، ومعه أدوات ومعدات سليمة، ويرتدي مهمات الوقاية المناسبة، ويعرف إن كان العمل يحتاج تصريح عمل.', 'No one works unless trained and authorized, aware of the risk assessment, equipped with sound tools and the right PPE, and knows whether a work permit is required.'],
  ['بدء العمل', 'Get started', 'لا يبدأ عمل دون إشراف في الموقع ووجود تقييم مخاطر (RA) و/أو إجراء عمل آمن (JSP) للأعمال الحرجة واجتماع قصير قبل العمل. أوقف العمل فوراً إذا لم تكن المخاطر تحت السيطرة.', 'No work starts without on-site supervision, a site risk assessment (RA) and/or safe work procedure (JSP) for critical work, and a toolbox talk. Stop work immediately if risks are not under control.'],
  ['تصريح العمل', 'Work permit', 'لا يعمل أحد دون تصريح عمل (PTW) إذا كان مطلوباً للمهمة.', 'No one works without a permit to work (PTW) when the task requires one.'],
  ['عزل الطاقة والآلات', 'Isolate energy and machinery', 'لا يعمل أحد على الشبكة إلا مدرَّباً ومصرَّحاً له، وبعد عزل جميع مصادر الطاقة وتأريضها وتطبيق أقفال LOTO واختبارها قبل اللمس واستخدام مهمات الوقاية.', 'No work on the network unless trained and authorized, with all sources isolated, earthed, locked out (LOTO), tested before touch and proper PPE used.'],
  ['العمل في المرتفعات', 'Work at heights', 'عند احتمال السقوط وخاصة فوق 1.8 م: تقييم مخاطر للمهمة، وحزام أمان مناسب، وتدابير للتحكم بالسقوط.', 'Where a fall is possible, especially above 1.8 m: assess the task, wear a suitable harness and apply fall controls.'],
  ['ربط حزام الأمان', 'Buckle up', 'لا يقود أحد سيارة أو معدة متنقلة إلا والسائق والركاب يربطون أحزمة الأمان.', 'No one drives a vehicle or mobile equipment unless driver and passengers wear seat belts.'],
  ['القيادة', 'Driving', 'ممنوع استخدام الجوال أثناء القيادة، والالتزام بقواعد المرور وحدود السرعة.', 'No mobile phone while driving; obey traffic rules and speed limits.'],
  ['دخول الأماكن المحصورة', 'Confined spaces', 'لا يدخل أحد مكاناً محصوراً دون تصريح ساري (CSEP) وتوفر معدات الإنقاذ في المكان.', 'No entry into a confined space without a valid permit (CSEP) and rescue equipment in place.']
];
// safety documents (DHSEM 01-002 §4, §10)
const SAFETY_DOCS = {
  MVPTW: ['تصريح العمل للجهد المتوسط', 'MV Permit To Work', 'أعمال على معدات وشبكات الجهد المتوسط بعد العزل والتأريض', [[14, 'رئيس القسم'], [60, 'مدير الدائرة / مكتب الخدمات'], [120, 'مدير الإدارة']]],
  LVPTW: ['تصريح العمل للجهد المنخفض', 'LV Permit To Work', 'أعمال على شبكات الجهد المنخفض (يجوز لمصدر المقاول المؤهل إصداره)', [[14, 'رئيس القسم'], [60, 'مدير الدائرة / مكتب الخدمات'], [120, 'مدير الإدارة']]],
  LOA: ['تحديد المسلك', 'Limitation Of Access', 'دخول مناطق التشغيل والأعمال القريبة من معدات مشحونة دون لمسها', [[30, 'المصدر مباشرة'], [60, 'رئيس القسم'], [120, 'مدير الدائرة / مكتب الخدمات']]],
  SFT: ['التعميد بالاختبار', 'Sanction For Testing', 'اختبارات العزل والمقاومة على المعدات', [[1, 'المصدر مباشرة']]],
  IER: ['طلب العزل والتأريض', 'Isolation & Earthing Request', 'طلب عزل وتأريض الدائرة من مركز التحكم قبل التصريح', []],
  EXC: ['تصريح أعمال الحفر', 'Excavation Work Permit', 'كل أعمال الحفر المخططة وغير المخططة والطارئة', [[0, 'المصدر — لا يتجاوز مدة التصريح الأساسي']]],
  WAH: ['تصريح العمل على المرتفعات', 'Working At Height', 'أي عمل فيه احتمال سقوط فوق 1.8 م', [[0, 'المصدر — لا يتجاوز مدة التصريح الأساسي']]],
  LOP: ['تصريح رفع الأحمال', 'Lifting Operating Permit', 'الرافعات والونش والهياب', [[0, 'المصدر — لا يتجاوز مدة التصريح الأساسي']]],
  CSEP: ['تصريح دخول المناطق المحصورة', 'Confined Space Entry Permit', 'غرف التفتيش والخنادق المغلقة — مع خطة إنقاذ (ملحق 11) وفحص الهواء OHS-PR-02-16', [[0, 'المصدر — لا يتجاوز مدة التصريح الأساسي']]],
  TWF: ['نموذج أسماء فريق العمل', 'Team Work Form', 'يُرفق مع نسخة تصريح العمل لدى المستلم في الموقع', []]
};
// excavation permit checklist (DHSEM 01-002, appendix 8 — EXC)
const EXC_CHECKS = [
  ['تقييم وتحديد جميع المخاطر وإجراءات العمل الآمن متوفرة للعمل المطلوب', 'Risks assessed and safe work procedures available for the required work'],
  ['رسم تخطيطي للموقع يوضح موقع الحفر المقترح', 'Layout drawing of the site showing the proposed excavation'],
  ['نظام التدعيم مكتمل (عمق أكثر من 1.5 م) ومصمم من شخص مؤهل', 'Shoring system complete (depth > 1.5 m) and designed by a qualified person'],
  ['المواد والمعدات على بعد أكثر من 1 م من حافة الحفرية', 'Materials and equipment more than 1 m from the excavation edge'],
  ['اللوحات التحذيرية والحواجز والإنارة الليلية متوفرة وكافية', 'Warning signs, barriers and night lights available and sufficient'],
  ['العمال مدرّبون على مخاطر أعمال الحفر', 'Workers trained on excavation hazards'],
  ['التفتيش المستمر مخطط له', 'Continuous inspection planned'],
  ['خطة ومعدات الطوارئ متوفرة', 'Emergency plan and equipment provided'],
  ['تصريح حفريات حكومي صادر (إذا كان الحفر خارج نطاق الشركة)', 'Government excavation permit issued (if outside company premises)'],
  ['الخدمات المرتبطة بالحفر (كابلات، اتصالات، غاز، مياه) محددة ومحمية', 'Services related to the excavation identified and protected'],
  ['معدات نزح المياه متوفرة عند وجود تجمع مياه', 'Dewatering equipment provided where water accumulates'],
  ['سلّم أو درج أو منحدر للحفريات بعمق 1.5 م فأكثر', 'Ladder, stair or ramp for excavations of 1.5 m or more'],
  ['تحديد نوع التربة ونظام التدعيم المناسب', 'Soil type and suitable support system determined']
];
// excavation emergency (EXC back page)
const EXC_EMERGENCY = [
  ['مغادرة الحفرية فوراً', 'Leave the pit'], ['إطفاء اللهب وأي مصدر اشتعال قد يشعل الغاز المتسرب', 'Extinguish flames and any source that may ignite leaking gas'],
  ['تنبيه سكان المنطقة وإبعاد الجمهور حتى السيطرة على الوضع', 'Warn residents and keep the public away until controlled'], ['إبلاغ الدفاع المدني وشركة الغاز والشرطة والأمن الصناعي', 'Notify civil defence, the gas company, police and industrial security'],
  ['إبلاغ مركز التحكم المختص مباشرة عند تلف أي كابل', 'Notify the control centre immediately if any cable is damaged']
];
// authorization (DHSEM 01-012 §1.3) — used for team qualification checks
const AUTH_CATS = {
  issuer: ['مصدر', 'Issuer', 'دبلوم كهرباء + 5 سنوات خبرة · دورات: قواعد سلامة التوزيع، العزل الآمن، الإسعافات الأولية والحريق، الحماية من السقوط · مصدر المقاول يصدر تصريح الجهد المنخفض فقط'],
  receiver: ['مستلم / رئيس الفريق', 'Receiver', 'دبلوم كهرباء + 3 سنوات خبرة في التشغيل أو الصيانة أو الإنشاءات · نفس الدورات'],
  competent: ['عامل مشارك', 'Competent Worker', '8 سنوات تعليم + 4 سنوات خبرة · شهادة معتمدة من معاهد الشركة: وصلات ونهايات الكابلات أو الخطوط الهوائية أو العدادات'],
  driver: ['سائق نقل ثقيل', 'Heavy Driver', 'رخصة قيادة ثقيلة سارية · قواعد سلامة التوزيع، الوقاية من الحرائق، التدريب على تشغيل المعدة'],
  safety: ['مهندس سلامة المقاول', 'Contractor Safety Engineer', 'بكالوريوس هندسة أو كلية تقنية + 3 سنوات في شبكات التوزيع · شهادة سلامة معتمدة (NEBOSH / OSHA)']
};
const AUTH_TYPES = { LV: ['جهد منخفض', 'LV'], MV: ['جهد متوسط', 'MV'], MVLV: ['متوسط / منخفض', 'MV/LV'], SFT: ['تعميد بالاختبار', 'SFT'], CABLE: ['وصلات ونهايات كابلات', 'Cable jointing'], OHL: ['خطوط هوائية', 'OHL'], METER: ['عدادات', 'Meters'] };
const AUTH_CAT_OPTS = [['', '— غير محدد —']].concat(Object.keys(AUTH_CATS).map((k) => [k, AUTH_CATS[k][0] + ' — ' + AUTH_CATS[k][1]]));
const AUTH_TYPE_OPTS = [['', '— غير محدد —']].concat(Object.keys(AUTH_TYPES).map((k) => [k, AUTH_TYPES[k][0] + ' — ' + AUTH_TYPES[k][1]]));
const AUTH_CARD = 'بطاقة التأهيل';
const LOTO_COLORS = [['أحمر', 'Red', 'المصدر Issuer'], ['أصفر', 'Yellow', 'المستلم Receiver'], ['أزرق', 'Blue', 'العامل المشارك Competent']];
const DIST_RULES = [
  ['تعامل مع كل الكابلات السليمة والتالفة على أنها مشحونة حتى يثبت عزلها بالاختبار', 'Treat every cable, sound or damaged, as live until proven isolated by test', HSE_SRC.r012],
  ['الحفر قرب كابلات مشحونة يتم بوثيقة السلامة (تصريح العمل) والإجراء المعتمد', 'Excavation near live cables only under a safety document (PTW) and the approved procedure', HSE_SRC.r012],
  ['استخدم كاشف جهد معتمد وافحصه قبل الاستخدام وبعده', 'Use an approved voltage detector and check it before and after use', HSE_SRC.r012],
  ['المعدات المتنقلة والرافعات قرب الشبكة الهوائية تعمل وفق إجراء وثائق السلامة', 'Mobile plant and cranes near overhead lines work under the safety documents procedure', HSE_SRC.r012],
  ['عند فشل التغذية تُعامل المعدات والموصلات على أنها مشحونة ويُبلَّغ مهندس التحكم', 'On supply failure treat equipment as live and inform the control engineer', HSE_SRC.r012],
  ['أقفال وبطاقات التوقيف على نقاط العزل؛ وفي الميني بيلر تُطبَّق البطاقات التحذيرية حسب الإجراء', 'Locks and hold tags on isolation points; on mini-pillars apply warning tags per procedure', HSE_SRC.ptw],
  ['الحد الأقصى لوثيقة السلامة 120 يوماً، والموافقات حسب المدة خطياً أو بالبريد وتُرفق بالوثيقة', 'Safety documents are valid 120 days at most; approvals by duration in writing and attached', HSE_SRC.r002],
  ['المصدر لا يصدر وثيقة سلامة لنفسه، ويتحقق من بطاقة تأهيل المستلم في الموقع', 'The issuer never issues to himself and verifies the receiver’s authorization on site', HSE_SRC.ptw],
  ['عند نقل الوثيقة: المستلم الحالي والجديد والمصدر في الموقع ويُوثَّق النقل في الوثيقة ومركز التحكم', 'On transfer: both receivers and the issuer on site; transfer recorded on the document and at the control centre', HSE_SRC.r002],
  ['عند الإقفال: سحب كل العاملين، إزالة الأدوات والتأريض الإضافي، تفتيش مشترك، وإبلاغ مركز التحكم', 'On closing: withdraw all staff, remove tools and extra earths, joint inspection, inform the control centre', HSE_SRC.r002],
  ['يجب استخدام وثائق السلامة حتى في المناطق النائية أو عند انقطاع الاتصال', 'Safety documents are required even in remote areas or without network coverage', HSE_SRC.r002]
];
const STOP_WORK = [
  ['المخاطر ليست تحت السيطرة', 'Risks are not under control'], ['لا يوجد تصريح عمل ساري أو انتهت مدته', 'No valid work permit or it has expired'],
  ['لم تُطبَّق الأقفال وبطاقات التوقيف أو لم يُختبر انعدام الجهد', 'Locks/hold tags not applied or absence of voltage not tested'], ['مغادرة المستلم للموقع دون نقل الوثيقة', 'Receiver leaves the site without transferring the document'],
  ['تلف كابل أو تسرب غاز أو انهيار جانب الحفرية', 'Damaged cable, gas leak or trench wall collapse'], ['عامل غير مؤهل أو بطاقته منتهية', 'Unauthorized worker or expired card'],
  ['ظروف جوية غير آمنة (رياح، أمطار، حرارة شديدة)', 'Unsafe weather (wind, rain, extreme heat)']
];
const PPE_BASE = [['خوذة سلامة', 'Safety helmet'], ['حذاء سلامة', 'Safety shoes'], ['سترة عاكسة', 'Reflective vest'], ['نظارة واقية', 'Safety glasses'], ['قفازات عمل', 'Work gloves']];
const PPE_ELEC = [['قفازات عازلة حسب الجهد', 'Insulated gloves rated for the voltage'], ['ملابس مقاومة للقوس الكهربائي', 'Arc-rated clothing'], ['واقي وجه', 'Face shield']];

// hazard library — keywords (Arabic + English) drive both the generator and the document analyser
// [id, hazard ar, hazard en, consequence ar, L, S, controls [[ar,en]], keywords, work types]
const HAZARDS = [
  ['cave', 'انهيار جوانب الحفرية', 'Trench wall collapse', 'دفن أو إصابة العاملين', 3, 5, [['تدعيم الجوانب للحفر أعمق من 1.5 م بتصميم شخص مؤهل', 'Shore walls deeper than 1.5 m, designed by a competent person'], ['إبعاد المواد والمعدات أكثر من 1 م عن الحافة', 'Keep spoil and plant over 1 m from the edge'], ['سلّم لكل حفرية 1.5 م فأكثر وتفتيش مستمر', 'Ladder for ≥1.5 m and continuous inspection']], ['انهيار', 'تدعيم', 'عمق', 'cave', 'collapse', 'shoring', 'trench'], ['excav']],
  ['cable', 'الاصطدام بالكابلات أو الخدمات المدفونة', 'Striking buried cables or services', 'صعق، حريق، انقطاع الخدمة', 3, 5, [['تحديد الخدمات من المخططات والكشف قبل الحفر', 'Identify services from drawings and detection before digging'], ['الحفر اليدوي قرب الكابلات وعدم استخدام الحفار الميكانيكي حيث يوجد خطر ملامسة', 'Hand dig near cables; no mechanical digging where contact is possible'], ['التعامل مع كل كابل على أنه مشحون', 'Treat every cable as live']], ['كابل', 'كابلات', 'خدمات', 'مدفون', 'cable', 'utilit', 'buried', 'services'], ['excav', 'elec']],
  ['shock', 'الصعق الكهربائي وملامسة أجزاء مشحونة', 'Electric shock / contact with live parts', 'وفاة أو حروق شديدة', 2, 5, [['العزل والتأريض حسب برنامج التشغيل وتصريح العمل', 'Isolate and earth per switching programme and PTW'], ['تطبيق LOTO (أحمر للمصدر، أصفر للمستلم، أزرق للمشارك) وبطاقات التوقيف', 'Apply LOTO (red issuer, yellow receiver, blue competent) and hold tags'], ['اختبار انعدام الجهد بكاشف معتمد قبل اللمس', 'Test for dead with an approved detector before touch'], ['عاملون مؤهلون بحمل بطاقة التأهيل', 'Authorized workers carrying their cards']], ['صعق', 'كهرب', 'مشحون', 'عزل', 'تأريض', 'live', 'shock', 'energ', 'isolat', 'earth', 'loto', 'lockout'], ['elec', 'meters', 'station']],
  ['traffic', 'حركة المرور في الطريق العام', 'Road traffic', 'دهس العاملين أو حوادث للمارة', 3, 4, [['حواجز وصبات ولوحات تحذيرية وأقماع وإنارة ليلية LED', 'Barriers, signs, cones and LED night lighting'], ['خطة تحويل مروري ومنظم حركة عند الحاجة', 'Traffic diversion plan and flagman where needed'], ['سترات عاكسة لكل العاملين', 'Reflective vests for all workers']], ['مرور', 'طريق', 'سيارات', 'تحويلة', 'traffic', 'road', 'vehicle'], ['excav', 'elec', 'asphalt', 'meters']],
  ['fallpit', 'السقوط في الحفرية', 'Falling into the excavation', 'كسور وإصابات', 3, 3, [['تسوير الحفرية بالكامل وتغطيتها عند التوقف', 'Fence the excavation fully and cover it when idle'], ['إنارة وتحذير ليلي', 'Night lighting and warning']], ['سقوط', 'تسوير', 'حواجز', 'fall', 'barrier', 'fence'], ['excav']],
  ['height', 'العمل على المرتفعات', 'Working at height', 'سقوط من ارتفاع', 2, 5, [['تصريح WAH لأي عمل فوق 1.8 م', 'WAH permit for work above 1.8 m'], ['حزام أمان كامل ونقطة تثبيت', 'Full body harness and anchor point'], ['سلالم وسقالات مفحوصة', 'Inspected ladders and scaffolds']], ['مرتفع', 'سلم', 'سقالة', 'عمود', 'height', 'ladder', 'scaffold', 'pole'], ['elec', 'station']],
  ['lift', 'رفع الأحمال بالرافعة أو الونش', 'Lifting with crane / HIAB', 'سقوط الحمل أو انقلاب الرافعة', 2, 5, [['تصريح LOP ومشغل معتمد (TUV)', 'LOP permit and certified operator (TUV)'], ['فحص أدوات الرفع ومنطقة حظر تحت الحمل', 'Inspect rigging; exclusion zone under the load'], ['مسافات خلوص آمنة من الخطوط الهوائية', 'Safe clearance from overhead lines']], ['رافعة', 'ونش', 'هياب', 'رفع', 'crane', 'lift', 'hiab', 'rigging'], ['elec', 'station']],
  ['plant', 'المعدات المتحركة (حفار JCB / شيول)', 'Mobile plant (JCB / loader)', 'دهس أو اصطدام', 3, 4, [['مشغل مؤهل ورخصة سارية وشهادة TUV', 'Qualified operator with valid licence and TUV'], ['مُرشد للمعدة وإنذار رجوع', 'Banksman and reversing alarm'], ['إبعاد العمال عن نطاق دوران الذراع', 'Keep workers out of the swing radius']], ['حفار', 'jcb', 'شيول', 'معدة', 'excavator', 'loader', 'plant'], ['excav', 'asphalt']],
  ['heat', 'الإجهاد الحراري', 'Heat stress', 'ضربة شمس وإجهاد', 3, 3, [['مياه شرب ومظلات وفترات راحة', 'Drinking water, shade and rest breaks'], ['مظلة للعاملين داخل الحفرية عند ارتفاع الحرارة', 'Umbrella for workers inside the pit in high temperature'], ['تقديم ساعات العمل صيفاً', 'Shift working hours earlier in summer']], ['حرارة', 'حر', 'شمس', 'heat', 'sun', 'temperature'], ['excav', 'elec', 'asphalt', 'meters', 'station']],
  ['confined', 'الأماكن المحصورة (غرف التفتيش)', 'Confined spaces (manholes)', 'اختناق أو تسمم', 2, 5, [['تصريح CSEP وخطة إنقاذ', 'CSEP permit and rescue plan'], ['فحص الهواء والتهوية قبل الدخول وأثناءه (OHS-PR-02-16)', 'Gas test and ventilation before and during entry (OHS-PR-02-16)'], ['مراقب خارجي ومعدات إنقاذ', 'Standby attendant and rescue equipment']], ['محصور', 'غرفة تفتيش', 'منهول', 'confined', 'manhole', 'vault'], ['station', 'elec']],
  ['gas', 'تلف خطوط الغاز والحريق', 'Gas line damage and fire', 'حريق أو انفجار', 2, 5, [['تطبيق خطة طوارئ الحفريات وإبلاغ الجهات', 'Apply the excavation emergency plan and notify authorities'], ['طفاية حريق في الموقع', 'Fire extinguisher on site']], ['غاز', 'حريق', 'اشتعال', 'gas', 'fire'], ['excav']],
  ['manual', 'المناولة اليدوية', 'Manual handling', 'إصابات الظهر', 3, 2, [['أسلوب الرفع الصحيح ومشاركة أكثر من عامل', 'Correct lifting technique and team lifts'], ['استخدام وسائل رفع ميكانيكية', 'Use mechanical aids']], ['مناولة', 'رفع يدوي', 'أحمال', 'manual', 'handling'], ['excav', 'elec', 'meters']],
  ['asphalt', 'الأسفلت الساخن والحروق', 'Hot asphalt and burns', 'حروق', 3, 3, [['مهمات وقاية مقاومة للحرارة', 'Heat-resistant PPE'], ['مسافة آمنة من المداحل والفرادة', 'Safe distance from rollers and pavers']], ['أسفلت', 'سفلتة', 'asphalt', 'bitumen', 'burn'], ['asphalt']],
  ['dust', 'الغبار والضوضاء', 'Dust and noise', 'أمراض تنفسية وضعف سمع', 3, 2, [['رش المياه وكمامات', 'Water spraying and dust masks'], ['واقيات سمع', 'Hearing protection']], ['غبار', 'ضوضاء', 'dust', 'noise'], ['excav', 'asphalt']],
  ['tools', 'العدد اليدوية والكهربائية', 'Hand and power tools', 'جروح وإصابات', 3, 2, [['فحص العدد قبل الاستخدام ووجود الواقيات', 'Inspect tools and guards before use'], ['عدد معزولة للأعمال الكهربائية', 'Insulated tools for electrical work']], ['عدد', 'أدوات', 'منشار', 'قاطع', 'tool', 'saw', 'cutter', 'grinder'], ['elec', 'meters', 'station']],
  ['drive', 'القيادة إلى الموقع ومنه', 'Driving to and from site', 'حوادث مرورية', 3, 4, [['ربط حزام الأمان للسائق والركاب', 'Seat belts for driver and passengers'], ['ممنوع الجوال أثناء القيادة والالتزام بالسرعة', 'No phone while driving; respect speed limits']], ['قيادة', 'سائق', 'driving', 'driver'], ['excav', 'elec', 'meters', 'station', 'asphalt']],
  ['test', 'الاختبارات الكهربائية (SFT)', 'Electrical testing (SFT)', 'صعق أثناء الاختبار', 2, 4, [['وثيقة SFT وحواجز ولوحات منطقة الاختبار', 'SFT document, barriers and test-area signs'], ['تفريغ الشحنة بعد الاختبار', 'Discharge after testing']], ['اختبار', 'فحص العزل', 'test', 'insulation', 'sft'], ['station', 'elec', 'meters']],
  ['water', 'تجمع المياه في الحفرية', 'Water accumulation', 'انهيار وانزلاق وصعق', 2, 3, [['مضخة نزح مياه', 'Dewatering pump'], ['إيقاف العمل الكهربائي عند وجود مياه', 'Stop electrical work when water is present']], ['مياه', 'تسرب', 'نزح', 'water', 'dewater', 'flood'], ['excav']]
];
const HZ = (id) => HAZARDS.find((h) => h[0] === id);
const riskLvl = (r) => (r >= 20 ? ['حرج', 'Critical', 'exp'] : r >= 10 ? ['عالٍ', 'High', 'bad'] : r >= 5 ? ['متوسط', 'Medium', 'warn'] : ['منخفض', 'Low', 'ok']);

// work type of a transaction / task
function hseTypes(j) {
  const k = String((j.kind || '') + ' ' + (j.title || '')); const out = new Set();
  if (j.workType && j.workType !== 'excav') out.add(j.workType);
  if (/حفر|حفرية|ميني بيلر|trench|excav/i.test(k) || (j.flow && flPath(j).includes('dig'))) out.add('excav');
  if (/كابل|تمديد|وصل|أعطال|طارئ|بايلوت|cable/i.test(k)) out.add('elec');
  if (/عداد/.test(k)) out.add('meters');
  if (/أسفلت|سفلتة|asphalt/i.test(k)) out.add('asphalt');
  if (/محطة|station/i.test(k)) out.add('station');
  if (!out.size) out.add(j.workType || 'excav');
  return [...out];
}
function hseDocsFor(j) {
  const T = hseTypes(j); const crew = crewById(j.crewId); const set = new Set();
  if (T.includes('excav') || T.includes('asphalt')) set.add('EXC');
  if (T.includes('elec') || T.includes('meters')) set.add('LVPTW');
  if (T.includes('station')) { set.add('MVPTW'); set.add('IER'); set.add('SFT'); }
  if (crew && allUnits(crew).some((u) => /رافع|ونش|هياب|crane/i.test(u.kind || ''))) set.add('LOP');
  if (T.includes('station') || /غرفة|منهول/.test(j.note || '')) set.add('CSEP');
  set.add('TWF');
  return [...set];
}
function hseHazardsFor(j) { const T = hseTypes(j); return HAZARDS.filter((h) => h[8].some((t) => T.includes(t))).map((h) => h[0]); }
const hseLib = (wt) => { DB.hseLib = DB.hseLib || {}; return (DB.hseLib[wt] = DB.hseLib[wt] || { items: [], files: [] }); };
const hseLibItems = (j, cat) => hseTypes(j).flatMap((t) => (DB.hseLib && DB.hseLib[t] ? DB.hseLib[t].items : [])).filter((x) => !cat || x.cat === cat);

// ---------- team qualification ----------
function hseTeam(j) {
  const c = crewById(j.crewId); if (!c) return [];
  return crewMembers(c).map((m) => { const e = empByIqama(m.iqama) || DB.employees.find((z) => z.name === m.name); const card = e && e.docs && e.docs[AUTH_CARD];
    return Object.assign({}, m, { emp: e, authCat: (e && e.authCat) || '', authType: (e && e.authType) || '', authNo: (e && e.authNo) || '', authExp: (card && card.exp) || '' }); });
}
function hseTeamIssues(j) {
  const T = hseTeam(j); const out = [];
  if (!T.length) return [['bad', 'لا توجد فرقة مسندة — لا يمكن إعداد نموذج فريق العمل.']];
  if (!T.some((m) => m.authCat === 'receiver')) out.push(['bad', 'لا يوجد «مستلم» مؤهل في الفرقة — لا يُستلم تصريح العمل إلا بمستلم يحمل بطاقة تأهيل.']);
  T.forEach((m) => {
    if (!m.emp) out.push(['warn', m.name + ': غير مربوط بسجل الموظفين']);
    else if (!m.authCat && !/مهندس|سائق/.test(m.role)) out.push(['warn', m.name + ': فئة التأهيل غير محددة']);
    if (m.authExp && daysTo(m.authExp) < 0) out.push(['bad', m.name + ': بطاقة التأهيل منتهية ' + m.authExp]);
    else if (m.authExp && daysTo(m.authExp) <= 30) out.push(['warn', m.name + ': بطاقة التأهيل تنتهي ' + m.authExp]);
    if (m.secExp && /^\d{4}-/.test(m.secExp) && daysTo(m.secExp) < 0) out.push(['bad', m.name + ': كارت الأمن الصناعي منتهي']);
  });
  return out;
}

// ---------- recommendations for a transaction ----------
function hseRecs(j) {
  const R = []; const add = (lvl, ar, src) => R.push({ lvl, ar, src: src || '' });
  const docs = hseDocsFor(j);
  docs.forEach((k) => { const D = SAFETY_DOCS[k]; add('info', 'مطلوب: ' + D[0] + ' (' + k + ') — ' + D[2], HSE_SRC.r002); });
  if (j.ptw && j.ptw.from && j.ptw.to) {
    const days = Math.round((new Date(j.ptw.to + 'T12:00:00') - new Date(j.ptw.from + 'T12:00:00')) / 86400000) + 1; const D = SAFETY_DOCS[j.ptw.type];
    if (days > 120) add('bad', 'مدة تصريح العمل ' + days + ' يوماً تتجاوز الحد الأقصى 120 يوماً.', HSE_SRC.r002);
    else if (D && D[3].length) { const a = D[3].find((x) => days <= x[0]) || D[3][D[3].length - 1]; add(days > 14 ? 'warn' : 'info', 'مدة التصريح ' + days + ' يوماً — صاحب الصلاحية: ' + a[1] + (days > 14 ? '، وتُرفق موافقته الخطية بالوثيقة.' : '.'), HSE_SRC.r002); }
    if (daysTo(j.ptw.to) < 0) add('bad', 'تصريح العمل ' + (j.ptw.no || '') + ' منتهٍ — أوقف العمل حتى التجديد أو الإقفال.', HSE_SRC.gr);
  } else if (j.flow && flIdx(j) >= flPath(j).indexOf('safety') && j.stage !== 'closed') add('warn', 'سجّل رقم تصريح العمل الأساسي (PTW) ومدته ومصدره ومستلمه.', HSE_SRC.gr);
  hseTeamIssues(j).forEach((x) => add(x[0], x[1], HSE_SRC.r012));
  if (hseTypes(j).includes('excav')) {
    if (+j.depthM > 1.5) add('warn', 'عمق الحفر ' + j.depthM + ' م: نظام تدعيم مصمم من شخص مؤهل وسلّم للنزول.', HSE_SRC.r002);
    add('info', 'تعامل مع كل الكابلات على أنها مشحونة، والحفر اليدوي قرب الخدمات المحددة.', HSE_SRC.r012);
  }
  const m = +String(j.date || today()).slice(5, 7); if (m >= 5 && m <= 9) add('warn', 'موسم الحرارة: مياه ومظلات وفترات راحة، ومظلة للعاملين داخل الحفرية.', HSE_SRC.r002);
  const crew = crewById(j.crewId); if (crew && allUnits(crew).some((u) => /رافع|ونش|هياب/.test(u.kind || ''))) add('warn', 'الفرقة معها رافعة/ونش: تصريح LOP ومشغل TUV ومسافة خلوص من الخطوط الهوائية.', HSE_SRC.r012);
  hseLibItems(j).filter((x) => x.cat === 'work').slice(0, 8).forEach((x) => add('info', x.ar, 'مكتبة: ' + x.src));
  add('info', 'اجتماع ما قبل العمل (Toolbox talk) وشرح تقييم المخاطر للفريق قبل البدء.', HSE_SRC.gr);
  return R;
}
// site checklist required before HSE approval
function hseSiteChecks(j) {
  const L = []; if (hseTypes(j).includes('excav')) EXC_CHECKS.forEach((x) => L.push(x[0]));
  L.push('نموذج فريق العمل مرفق مع نسخة تصريح العمل لدى المستلم في الموقع', 'بطاقات التأهيل الأصلية مع العاملين في الموقع', 'مهمات الوقاية الشخصية متوفرة ومستخدمة');
  if (hseTypes(j).some((t) => ['elec', 'meters', 'station'].includes(t))) L.push('الأقفال وبطاقات التوقيف مطبقة وكاشف الجهد مفحوص');
  hseLibItems(j, 'site').forEach((x) => { if (!L.includes(x.ar)) L.push(x.ar); });
  return L;
}
function flHseBox(j) {
  if (!j.flow) return '';
  const R = hseRecs(j); const bad = R.filter((x) => x.lvl === 'bad').length; const E = can('edit') && jobInScope(j);
  return html`<details class="gatebox hsebox" ${bad ? new Safe('open') : ''}><summary><b>توصيات السلامة والصحة المهنية</b> <span class="pill ${bad ? 'bad' : 'info'}">${bad ? bad + ' عاجل' : R.length + ' توصية'}</span></summary>
    <ul class="hsel">${R.map((x) => html`<li class="${x.lvl}"><span>${x.ar}</span>${x.src ? html`<small class="t-mut">${x.src}</small>` : ''}</li>`)}</ul>
    ${E ? html`<div class="row"><button class="btn sm" type="button" data-act="hse-ptw" data-id="${j.id}">تسجيل تصريح العمل PTW</button><button class="btn sm" type="button" data-act="hse-gen" data-k="twf" data-id="${j.id}">نموذج فريق العمل (SEC)</button><button class="btn sm" type="button" data-act="hse-gen" data-k="jsp" data-id="${j.id}">إجراءات العمل الآمن</button><button class="btn sm" type="button" data-act="hse-gen" data-k="ra" data-id="${j.id}">تقييم المخاطر</button></div>` : ''}</details>`;
}

// ---------- document text extraction (docx / txt / best-effort pdf) ----------
async function hseFileText(file) {
  const n = file.name.toLowerCase(); if (file.size > 15 * 1024 * 1024) throw new Error('الملف أكبر من 15 ميجابايت');
  if (/\.(txt|md|csv)$/.test(n)) return (await file.text()).slice(0, 400000);
  if (n.endsWith('.docx')) { const z = await unzip(await file.arrayBuffer()); const x = await z.read('word/document.xml'); if (!x) throw new Error('ملف Word غير صالح');
    const doc = new DOMParser().parseFromString(x, 'application/xml'); return Array.from(doc.getElementsByTagName('w:p')).map((p) => Array.from(p.getElementsByTagName('w:t')).map((t) => t.textContent).join('')).filter(Boolean).join('\n').slice(0, 400000); }
  if (n.endsWith('.xlsx')) return (await readSheetFile(file)).map((r) => r.join(' | ')).join('\n').slice(0, 400000);
  if (n.endsWith('.pdf')) return pdfText(await file.arrayBuffer());
  throw new Error('الصيغ المدعومة: Word (.docx) أو PDF أو نص أو Excel');
}
async function pdfText(ab) {
  // simple extractor for text-based PDFs (Flate streams + Tj/TJ). Scanned PDFs need the text pasted.
  const u8 = new Uint8Array(ab); const s = new TextDecoder('latin1').decode(u8); const out = []; let i = 0, n = 0;
  while ((i = s.indexOf('stream', i)) > -1 && n < 3000) { n++;
    let a = i + 6; if (s[a] === '\r') a++; if (s[a] === '\n') a++; const e = s.indexOf('endstream', a); if (e < 0) break;
    const dict = s.slice(Math.max(0, i - 300), i); let data = u8.subarray(a, e);
    try { if (/FlateDecode/.test(dict)) { const ds = new DecompressionStream('deflate'); data = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(ds)).arrayBuffer()); } } catch (x) { i = e; continue; }
    const t = new TextDecoder('latin1').decode(data); const re = /\((?:\\.|[^\\)])*\)\s*Tj|\[(?:[^\]]*)\]\s*TJ/g; let m; const line = [];
    while ((m = re.exec(t))) { const parts = m[0].match(/\((?:\\.|[^\\)])*\)/g) || []; line.push(parts.map((p) => p.slice(1, -1).replace(/\\([nrtbf()\\])/g, (q, c) => ({ n: '\n', r: '', t: ' ', b: '', f: '', '(': '(', ')': ')', '\\': '\\' }[c]))).join('')); }
    if (line.length) out.push(line.join(' ')); i = e + 9;
  }
  const txt = out.join('\n'); try { return decodeURIComponent(escape(txt)).slice(0, 400000); } catch (e) { return txt.slice(0, 400000); }
}

// ---------- local analysis of a procedure / risk assessment ----------
const HSE_CAT_RE = {
  ppe: /خوذ|نظار|قفاز|حذاء|سترة|حزام أمان|كمام|واقي|helmet|glove|goggle|glasses|boots|shoes|vest|harness|mask|ear|ppe|مهمات الوقاية/i,
  permit: /تصريح|ptw|exc\b|loa\b|sft\b|wah\b|lop\b|csep|رخصة|permit/i,
  site: /حواجز|حاجز|لوح|إنارة|اناره|أقماع|تسوير|صبات|إشار|موقع|barrier|sign|light|cone|fenc|site|تحويل/i
};
const HSE_REQ_RE = /يجب|يلزم|ممنوع|لا يسمح|يتم|التأكد|توفير|ارتداء|استخدام|تطبيق|must|shall|ensure|provide|wear|use|apply|do not|never|required/i;
function hseAnalyze(text) {
  const T = String(text || ''); const low = T.toLowerCase();
  const hz = HAZARDS.map((h) => ({ id: h[0], n: h[7].reduce((s, k) => s + (low.split(k.toLowerCase()).length - 1), 0) })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
  const lines = T.split(/\n|(?<=[.؛;!؟])\s+/).map((x) => x.replace(/\s+/g, ' ').replace(/^[\s•▪●\-–\d.)(]+/, '').trim()).filter((x) => x.length >= 12 && x.length <= 260 && HSE_REQ_RE.test(x));
  const seen = new Set(); const items = [];
  lines.forEach((ln) => { const key = ln.slice(0, 60); if (seen.has(key)) return; seen.add(key);
    const cat = HSE_CAT_RE.ppe.test(ln) ? 'ppe' : HSE_CAT_RE.permit.test(ln) ? 'permit' : HSE_CAT_RE.site.test(ln) ? 'site' : 'work'; items.push({ cat, ar: ln }); });
  const codes = Object.keys(SAFETY_DOCS).filter((k) => new RegExp('\\b' + k.replace('PTW', '\\s*PTW') + '\\b', 'i').test(T.replace(/\./g, '')));
  return { hazards: hz.slice(0, 12), items: items.slice(0, 80), codes };
}
async function hseAnalyzeAI(text) {
  const sys = 'أنت مهندس سلامة وصحة مهنية لمقاول شبكات توزيع الكهرباء (الشركة السعودية للكهرباء) في الرياض. استخرج من نص إجراء العمل أو تقييم المخاطر البنود العملية المطلوبة فقط، دون اختراع. أعد JSON فقط بالشكل: {"work":["..."],"site":["..."],"ppe":["..."],"permits":["..."],"hazards":[{"h":"...","c":["..."]}]} بالعربية، كل بند جملة قصيرة قابلة للتحقق في الموقع.';
  const a = await aiChat([{ role: 'system', content: sys }, { role: 'user', content: String(text).slice(0, 24000) }]); if (!a) return null;
  const m = a.text.match(/\{[\s\S]*\}/); if (!m) return null;
  try { const o = JSON.parse(m[0]); const L = (x) => (Array.isArray(x) ? x.map((s) => String(s).trim().slice(0, 260)).filter((s) => s.length > 3).slice(0, 40) : []);
    return { via: a.via, work: L(o.work), site: L(o.site), ppe: L(o.ppe), permits: L(o.permits), hazards: (Array.isArray(o.hazards) ? o.hazards : []).slice(0, 20).map((h) => ({ h: String(h.h || '').slice(0, 120), c: L(h.c).slice(0, 6) })).filter((h) => h.h) }; } catch (e) { return null; }
}

// ---------- views ----------
function viewHse() {
  const tab = UI.hseTab || 'recs'; const tabs = [['recs', 'التوصيات حسب المعاملات'], ['lib', 'الإجراءات وتقييم المخاطر — رفع وتحليل'], ['gen', 'مولّد النماذج'], ['rules', 'القواعد والمراجع']];
  return html`<div class="ph"><div><h1 style="font-size:28px">السلامة والصحة المهنية</h1><p>توصيات عملية لكل معاملة مبنية على قواعد سلامة التوزيع ووثائق السلامة والقواعد الذهبية، ومولّد ثنائي اللغة لنموذج فريق العمل وإجراءات العمل الآمن وتقييم المخاطر، وتحليل ملفات الإجراءات التي ترفعونها.</p></div></div>
  <div class="tabs" role="tablist">${tabs.map((t) => html`<button type="button" role="tab" aria-selected="${tab === t[0]}" data-act="hse-tab" data-k="${t[0]}">${t[1]}</button>`)}</div>
  ${tab === 'lib' ? hseLibView() : tab === 'gen' ? hseGenView() : tab === 'rules' ? hseRulesView() : hseRecsView()}`;
}
function hseRecsView() {
  const J = flJobs().filter(jobInScope).filter(flActive).sort((a, b) => a.date.localeCompare(b.date));
  const rows = J.map((j) => ({ j, R: hseRecs(j) })); const bad = rows.reduce((s, r) => s + r.R.filter((x) => x.lvl === 'bad').length, 0);
  const team = J.reduce((s, j) => s + hseTeamIssues(j).length, 0);
  return html`<div class="flkpi"><div class="flk"><span>معاملات نشطة</span><b>${J.length}</b></div><div class="flk"><span>توصيات عاجلة</span><b class="t-bad">${bad}</b></div><div class="flk"><span>ملاحظات تأهيل الفرق</span><b class="t-warn">${team}</b></div><div class="flk"><span>بنود المكتبة</span><b>${Object.values(DB.hseLib || {}).reduce((s, x) => s + x.items.length, 0)}</b></div></div>
  <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(360px,1fr))">${rows.map(({ j, R }) => { const b = R.filter((x) => x.lvl !== 'info'); return html`<article class="card"><div class="row between"><button type="button" class="lnk" data-act="fl-goto" data-id="${j.id}"><b class="ltr">${j.uid || j.baseNo}</b> — ${j.kind}</button><span class="pill ${R.some((x) => x.lvl === 'bad') ? 'bad' : b.length ? 'warn' : 'ok'}">${FL_STAGES[j.stage][0]}</span></div>
    <span class="t-mut" style="font-size:12px">${j.district} · ${fmtD(j.date)} · الوثائق: ${hseDocsFor(j).join('، ')}</span>
    <ul class="hsel">${(b.length ? b : R.slice(0, 2)).slice(0, 6).map((x) => html`<li class="${x.lvl}"><span>${x.ar}</span></li>`)}</ul></article>`; })}</div>`;
}
function hseRulesView() {
  return html`<div class="grid g2"><div class="card"><h2 style="font-size:18px">القواعد الذهبية للسلامة — Golden Rules</h2><ol class="hsrl">${GOLDEN_RULES.map((g) => html`<li><b>${g[0]} — ${g[1]}</b><span>${g[2]}</span><span class="ltr t-mut" style="text-align:start">${g[3]}</span></li>`)}</ol></div>
    <div class="card"><h2 style="font-size:18px">وثائق السلامة ومددها وصلاحياتها</h2><div class="tblw"><table><thead><tr><th>الرمز</th><th>الوثيقة</th><th>الاستخدام</th><th>المدة ← صاحب الصلاحية</th></tr></thead><tbody>${Object.keys(SAFETY_DOCS).map((k) => { const D = SAFETY_DOCS[k]; return html`<tr><td class="ltr"><b>${k}</b></td><td>${D[0]}<div class="t-mut ltr" style="font-size:11px">${D[1]}</div></td><td style="font-size:12px">${D[2]}</td><td style="font-size:12px">${D[3].map((x) => (x[0] ? 'حتى ' + x[0] + ' يوم ← ' : '') + x[1]).join(' · ') || '—'}</td></tr>`; })}</tbody></table></div><p class="t-mut" style="font-size:12px">${HSE_SRC.r002} §10 — الحد الأقصى 120 يوماً.</p></div>
    <div class="card"><h2 style="font-size:18px">قواعد سلامة التوزيع والأقفال</h2><ul class="hsel">${DIST_RULES.map((r) => html`<li class="info"><span>${r[0]}</span><small class="t-mut">${r[2]}</small></li>`)}</ul>
      <p style="font-size:13px">ألوان أقفال السلامة: ${LOTO_COLORS.map((c) => c[0] + ' (' + c[1] + ') ← ' + c[2]).join(' · ')}</p></div>
    <div class="card"><h2 style="font-size:18px">متطلبات بطاقات التأهيل</h2><ul class="hsel">${Object.keys(AUTH_CATS).map((k) => html`<li class="info"><span><b>${AUTH_CATS[k][0]} — ${AUTH_CATS[k][1]}:</b> ${AUTH_CATS[k][2]}</span></li>`)}</ul><p class="t-mut" style="font-size:12px">${HSE_SRC.r012} §1.3 · تُسجّل الفئة والنوع وتاريخ انتهاء «بطاقة التأهيل» من ملف الموظف.</p></div>
    <div class="card"><h2 style="font-size:18px">قائمة فحص تصريح الحفر (EXC)</h2><ol class="hsrl">${EXC_CHECKS.map((x) => html`<li><span>${x[0]}</span><span class="ltr t-mut" style="text-align:start">${x[1]}</span></li>`)}</ol></div>
    <div class="card"><h2 style="font-size:18px">حالات إيقاف العمل والطوارئ</h2><ul class="hsel">${STOP_WORK.map((x) => html`<li class="bad"><span>${x[0]}</span></li>`)}</ul><h3 style="font-size:15px">عند تلف الخدمات أثناء الحفر</h3><ol class="hsrl">${EXC_EMERGENCY.map((x) => html`<li><span>${x[0]}</span></li>`)}</ol></div></div>`;
}
function hseLibView() {
  const wt = UI.hseWt || 'excav'; const L = hseLib(wt); const A = UI.hseAn; const E = can('settings') || can('permits');
  const WTS = Object.assign({}, DB.lists.workTypes, { asphalt: ['أسفلت وإعادة سفلتة'] });
  return html`<p class="alert note">ارفع ملف «إجراءات العمل» أو «تقييم المخاطر» (Word أو PDF نصي أو نص)، أو الصق نصه. تحلله المنصة وتقترح البنود، فتختار ما يُضاف إلى متطلبات العمل والموقع لهذا النوع من الأعمال. البنود المضافة تظهر في توصيات كل معاملة، وفي قائمة فحص الموقع قبل اعتماد HSE، وفي المولّد.</p>
  <div class="row"><label for="hsewt">نوع العمل</label><select class="in" id="hsewt" style="max-width:260px" data-change="hse-wt">${Object.keys(WTS).map((k) => html`<option value="${k}" ${k === wt ? new Safe('selected') : ''}>${WTS[k][0]}</option>`)}</select>
    ${E ? html`<button class="btn pri" type="button" data-act="hse-up" data-k="${wt}">رفع وتحليل ملف</button><button class="btn" type="button" data-act="hse-paste" data-k="${wt}">لصق نص للتحليل</button><button class="btn" type="button" data-act="hse-item" data-k="${wt}">+ بند يدوي</button>` : ''}</div>
  ${A && A.wt === wt ? hseAnalysisCard(A) : ''}
  <div class="grid g2">${[['work', 'بنود العمل'], ['site', 'بنود الموقع (قائمة فحص HSE)'], ['ppe', 'مهمات الوقاية'], ['permit', 'التصاريح والوثائق']].map((c) => { const I = L.items.filter((x) => x.cat === c[0]); return html`<div class="card"><h3 style="font-size:16px">${c[1]} · ${I.length}</h3>${I.length ? html`<ul class="hsel">${I.map((x) => html`<li class="info"><span>${x.ar}</span><small class="t-mut">${x.src}</small>${E ? html`<button class="ib" type="button" data-act="hse-del" data-k="${wt}" data-id="${x.id}" aria-label="حذف البند" title="حذف">×</button>` : ''}</li>`)}</ul>` : html`<p class="t-mut" style="font-size:13px">لا بنود بعد.</p>`}</div>`; })}</div>
  ${L.files.length ? html`<div class="card"><h3 style="font-size:15px">الملفات المحللة</h3><ul class="nb">${L.files.map((f) => html`<li><span>${f.name}</span><span class="t-mut">${f.n} بند · ${f.by} · ${fmtT(f.tm)}${f.via ? ' · ' + f.via : ''}</span></li>`)}</ul></div>` : ''}`;
}
function hseAnalysisCard(A) {
  const cats = { work: 'العمل', site: 'الموقع', ppe: 'الوقاية', permit: 'التصاريح' };
  return html`<form class="card" data-form="hse-add"><div class="row between"><h3 style="font-size:16px">نتيجة التحليل — ${A.name}</h3><span class="t-mut" style="font-size:12px">${A.via}</span></div>
    ${A.hazards.length ? html`<div class="chips">${A.hazards.map((h) => html`<span class="pill warn">${HZ(h.id) ? HZ(h.id)[1] : h.h} ${h.n ? '· ' + h.n : ''}</span>`)}</div>` : ''}
    ${A.codes.length ? html`<p style="font-size:13px">وثائق سلامة مذكورة: ${A.codes.join('، ')}</p>` : ''}
    <p class="t-mut" style="font-size:12px">اختر البنود التي تُضاف إلى المتطلبات، ويمكن تعديل تصنيف كل بند.</p>
    <ol class="hsan">${A.items.map((x, i) => html`<li><label class="row" style="gap:8px;align-items:flex-start"><input type="checkbox" name="pick" value="${i}" checked style="margin-top:4px;accent-color:var(--acc)"><span style="flex:1">${x.ar}</span></label>
      <select class="in" name="cat${i}" style="width:auto;min-height:32px;font-size:12px" aria-label="تصنيف البند">${Object.keys(cats).map((c) => html`<option value="${c}" ${x.cat === c ? new Safe('selected') : ''}>${cats[c]}</option>`)}</select></li>`)}</ol>
    ${A.items.length ? html`<div class="row"><button class="btn pri" type="submit">إضافة البنود المحددة (${A.items.length})</button><button class="btn" type="button" data-act="hse-an-x">تجاهل</button></div>` : html`<p class="alert wr">لم يُستخرج نص كافٍ. إن كان الملف PDF ممسوحاً ضوئياً، استخدم «لصق نص للتحليل».</p>`}</form>`;
}
function hseGenView() {
  const J = jobsV().filter((j) => j.st !== 'done').sort((a, b) => a.date.localeCompare(b.date)); const G = DB.docs.filter((d) => d.form && d.form.gen).slice(0, 30);
  return html`<div class="grid g3">${[['twf', 'نموذج فريق العمل للمقاول', 'Contractor Team Work Form — بنفس تنسيق نموذج الشركة، يُعبأ من الفرقة وبطاقات التأهيل'], ['jsp', 'إجراءات العمل الآمن', 'Safe Work Procedure (JSP) — الوثائق والفريق والوقاية والخطوات وحالات الإيقاف والطوارئ'], ['ra', 'تقييم المخاطر', 'Risk Assessment — المخاطر وإجراءات التحكم ومصفوفة 5×5 والخطر المتبقي']].map((g) => html`<div class="card"><h3 style="font-size:17px">${g[1]}</h3><p class="t-mut" style="font-size:13px">${g[2]}</p>
    <form data-form="hse-gen" class="row"><input type="hidden" name="k" value="${g[0]}"><select class="in" name="id" aria-label="المعاملة" style="flex:1 1 200px">${J.map((j) => html`<option value="${j.id}">${(j.uid || j.permit || '') + ' — ' + (j.title || j.kind)}</option>`)}</select><button class="btn pri" type="submit">توليد</button></form></div>`)}</div>
  <div class="card"><h3 style="font-size:16px">النماذج المولّدة · ${G.length}</h3>${G.length ? html`<ul class="nb">${G.map((d) => html`<li><span>${d.title}</span><span class="row" style="gap:6px"><span class="t-mut">${fmtT(d.tm)}</span><button class="btn sm" type="button" data-act="doc-view" data-id="${d.id}">عرض وطباعة</button></span></li>`)}</ul>` : html`<p class="t-mut">لم يُولَّد شيء بعد.</p>`}</div>`;
}

// ---------- generators ----------
function hseGenerate(k, j, v) {
  const B = cfg().brand; const team = hseTeam(j); const T = hseTypes(j); const crew = crewById(j.crewId);
  const base = { gen: k, jobId: j.id, uid: j.uid || '', woNo: j.woNo || '', permit: j.permit || '', ptw: j.ptw || null, kind: j.kind || j.title, district: j.district || j.site || '', date: j.date, contractor: B.company, crew: crew ? crew.id + ' · ' + crew.name : '', types: T, generated: nowIso(), by: CUR.name };
  if (k === 'twf') {
    const rid = v.receiver; const rec = team.find((m) => m.iqama === rid || m.name === rid) || team.find((m) => m.authCat === 'receiver') || team[0];
    const rest = team.filter((m) => m !== rec && !/مهندس/.test(m.role));
    const resp = team.find((m) => /مهندس/.test(m.role)) || rec;
    const row = (m, role) => ({ name: m.name, iqama: m.iqama, cat: role || (m.authCat ? AUTH_CATS[m.authCat][0] : 'عامل مشارك'), type: m.authType ? AUTH_TYPES[m.authType][0] + ' ' + AUTH_TYPES[m.authType][1] : '', exp: m.authExp || '', inTeam: true });
    return Object.assign(base, { date: v.date || today(), contractor: v.contractor || B.company, desc: v.desc || j.title, woNo: v.woNo || j.woNo || '', members: [row(rec, 'المستلم / رئيس الفريق')].concat(rest.slice(0, 7).map((m) => row(m, 'عامل مشارك'))),
      resp: resp ? { name: resp.name, iqama: resp.iqama, cat: resp.authCat ? AUTH_CATS[resp.authCat][0] : 'مسئول التنفيذ', exp: resp.authExp || '' } : null, div: { name: v.divName || '', badge: v.divBadge || '' },
      issuer: { name: v.issuer || (j.ptw && j.ptw.issuer) || '', badge: v.issuerBadge || '' }, receiver: { name: rec ? rec.name : '', badge: '' }, mainPtw: v.mainPtw || (j.ptw && j.ptw.no) || '' });
  }
  const hz = hseHazardsFor(j);
  if (k === 'ra') return Object.assign(base, { rows: hz.map((id) => { const h = HZ(id); const r = h[4] * h[5]; const rl = Math.max(1, h[4] - 2) * h[5] >= 15 ? Math.max(1, h[4] - 2) : Math.max(1, h[4] - 2); return { act: h[8].includes('excav') && T.includes('excav') ? 'أعمال الحفر / Excavation' : T.includes('elec') ? 'الأعمال الكهربائية / Electrical' : 'الأعمال الميدانية / Field works', h: h[1], hen: h[2], cons: h[3], L: h[4], S: h[5], R: r, ctl: h[6], rL: rl, rS: h[5], rR: rl * h[5] }; })
    .concat(hseLibItems(j, 'work').slice(0, 6).map((x) => ({ act: 'من مكتبة الإجراءات', h: x.ar, hen: '', cons: '', L: 3, S: 3, R: 9, ctl: [[x.ar, '']], rL: 1, rS: 3, rR: 3 }))) });
  // jsp
  const isE = T.some((t) => ['elec', 'meters', 'station'].includes(t));
  const steps = [
    ['قبل العمل — Pre-work', [['استلام أمر العمل والرخصة البلدية/RIPC وتصريح العمل الأساسي ووثائق السلامة المطلوبة (' + hseDocsFor(j).join('، ') + ')', 'Receive the work order, municipal/RIPC permit, main PTW and required safety documents'], ['التحقق من بطاقات تأهيل الفريق الأصلية في الموقع وإرفاق نموذج فريق العمل مع نسخة التصريح لدى المستلم', 'Verify original authorization cards on site; attach the team form to the PTW copy held by the receiver'], ['اجتماع ما قبل العمل وشرح تقييم المخاطر وحالات الإيقاف', 'Toolbox talk: explain the risk assessment and stop-work conditions'], ['تأمين الموقع: صبات/حواجز وإنارة LED ولوحات تحذيرية وتحويلة مرورية عند الحاجة', 'Secure the site: barriers, LED lighting, signs and traffic diversion where needed'], ['فحص مهمات الوقاية والعدد والمعدات وشهادات المشغلين', 'Check PPE, tools, plant and operator certificates']]]
  ];
  if (T.includes('excav')) steps.push(['الحفر — Excavation', [['تحديد الخدمات المدفونة من المخططات والكشف، وحفر جسات يدوية قرب الكابلات', 'Locate buried services from drawings and detection; hand-dug trial holes near cables'], ['التعامل مع كل كابل على أنه مشحون، وعدم استخدام الحفار الميكانيكي حيث يوجد خطر ملامسة', 'Treat all cables as live; no mechanical digging where contact is possible'], ['تدعيم الحفرية الأعمق من 1.5 م وتوفير سلّم، وإبعاد ناتج الحفر 1 م عن الحافة', 'Shore excavations deeper than 1.5 m, provide a ladder, keep spoil 1 m back'], ['نزح المياه عند تجمعها والتفتيش المستمر لجوانب الحفرية', 'Dewater when needed and inspect walls continuously']]]);
  if (isE) steps.push(['الأعمال الكهربائية — Electrical', [['العزل حسب برنامج التشغيل، وطلب العزل والتأريض عند الجهد المتوسط', 'Isolate per switching programme; IER for medium voltage'], ['تطبيق الأقفال (أحمر المصدر، أصفر المستلم، أزرق المشارك) وبطاقات التوقيف', 'Apply locks (red issuer, yellow receiver, blue competent) and hold tags'], ['اختبار انعدام الجهد بكاشف معتمد مفحوص قبل الاستخدام وبعده، ثم التأريض', 'Prove dead with an approved, checked detector, then earth'], ['تنفيذ العمل بالعاملين المؤهلين فقط وتحت إشراف المستلم المباشر', 'Work by authorized staff only under the receiver’s direct supervision']]]);
  if (T.includes('asphalt')) steps.push(['الردم والسفلتة — Backfill & asphalt', [['ردم ودمك على طبقات حسب المواصفة وفحص المختبر', 'Backfill and compact in layers; lab testing'], ['مسافة آمنة من المداحل والأسفلت الساخن', 'Safe distance from rollers and hot asphalt']]]);
  steps.push(['إنهاء العمل — Closing', [['سحب جميع العاملين وإزالة الأدوات والتأريض الإضافي', 'Withdraw all workers; remove tools and additional earths'], ['تفتيش مشترك بين المصدر والمستلم وإقفال وثيقة السلامة وإبلاغ مركز التحكم', 'Joint inspection by issuer and receiver; close the safety document; inform the control centre'], ['تنظيف الموقع وإزالة السلامة بعد الانتهاء ورفع صور موثّقة بالموقع الجغرافي', 'Clean the site, remove safety items and upload geo-tagged photos']]]);
  const lib = hseLibItems(j); if (lib.filter((x) => x.cat === 'work').length) steps.push(['بنود إضافية من إجراءات الشركة — Additional items', lib.filter((x) => x.cat === 'work').map((x) => [x.ar, ''])]);
  return Object.assign(base, { docs: hseDocsFor(j), team: team.map((m) => ({ name: m.name, role: m.role, cat: m.authCat ? AUTH_CATS[m.authCat][0] : '', exp: m.authExp })), ppe: PPE_BASE.concat(isE ? PPE_ELEC : []).concat(lib.filter((x) => x.cat === 'ppe').map((x) => [x.ar, ''])),
    tools: crew ? allUnits(crew).map((u) => u.kind + ' ' + (u.code || '')).slice(0, 12) : [], steps, site: hseSiteChecks(j), stop: STOP_WORK, emergency: EXC_EMERGENCY, hazards: hz.map((id) => HZ(id)[1]) });
}
const GEN_TITLE = { twf: ['نموذج فريق العمل للمقاول', 'Contractor Team Work Form'], jsp: ['إجراءات العمل الآمن', 'Safe Work Procedure (JSP)'], ra: ['تقييم المخاطر', 'Risk Assessment (RA)'] };
function hseHead(f) {
  const T = GEN_TITLE[f.gen];
  return html`<div class="fhead"><div class="row" style="gap:16px;flex-wrap:wrap">${brandLogos(44)}</div><div style="text-align:center"><b style="font-size:19px">${T[0]}</b><div class="ltr" style="font-weight:700">${T[1]}</div></div></div>
    ${f.gen === 'twf' ? '' : html`<table class="ftable bi"><tbody><tr><th>المعرّف / ID</th><td class="ltr">${f.uid || '—'}</td><th>أمر العمل / WO</th><td class="ltr">${f.woNo || '—'}</td><th>الرخصة / Permit</th><td class="ltr">${f.permit || '—'}</td></tr>
    <tr><th>العمل / Work</th><td>${f.kind}</td><th>الموقع / Location</th><td>${f.district}</td><th>التاريخ / Date</th><td class="ltr">${f.date}</td></tr>
    <tr><th>المقاول / Contractor</th><td>${f.contractor}</td><th>الفرقة / Crew</th><td>${f.crew || '—'}</td><th>تصريح العمل / PTW</th><td class="ltr">${f.ptw ? f.ptw.type + ' ' + (f.ptw.no || '') + ' (' + f.ptw.from + ' → ' + f.ptw.to + ')' : '—'}</td></tr></tbody></table>`}`;
}
function hseDocHtml(d) {
  const f = d.form; const sig = html`<table class="ftable bi"><tbody><tr><th>أعدّه / Prepared by</th><td style="height:40px">${f.by}</td><th>راجعه (مهندس السلامة) / Reviewed by</th><td></td><th>اعتمده / Approved by</th><td></td></tr></tbody></table>`;
  let body = '';
  if (f.gen === 'twf') {
    const blank = (n) => Array.from({ length: n }, (_, i) => i);
    const M = f.members.concat(blank(Math.max(0, 8 - f.members.length)).map(() => null));
    body = html`<h3 class="twf-h">مرحلة ما قبل تنفيذ العمل: <span class="ltr">Pre-execution phase</span></h3>
    <table class="ftable twf"><tbody><tr><th colspan="2" class="ltr" style="text-align:left">To Be Filled by Division Manager / Section head</th><th colspan="2">تعبأ هذه البيانات بواسطة مدير الدائرة / رئيس القسم</th></tr>
      <tr><th class="ltr">Date :</th><td colspan="2" class="ltr" style="text-align:center">${f.date}</td><th>التاريخ</th></tr>
      <tr><th class="ltr">Contractor Name:</th><td colspan="2" style="text-align:center">${f.contractor}</td><th>اسم المقاول المسند إليه العمل</th></tr>
      <tr><th class="ltr">Work Order No./<br>Work Description:</th><td colspan="2" style="text-align:center"><b class="ltr">${f.woNo || '—'}</b> / ${f.desc}${f.uid ? html` <span class="ltr t-mut">(${f.uid})</span>` : ''}</td><th>رقم أمر اسناد العمل /<br>وصف العمل المنفذ</th></tr></tbody></table>
    <table class="ftable twf"><thead><tr><th colspan="4" class="ltr">Contractor Team Work Names</th><th colspan="4">أسماء فريق العمل المنفذ (المقاول)</th></tr>
      <tr><th>No</th><th>الاسم / Name</th><th>رقم الإقامة<br><span class="ltr">Iqama No.</span></th><th>فئة التأهيل<br><span class="ltr">Authorization Category</span></th><th>نوع التأهيل<br><span class="ltr">Authorization Type</span></th><th>تاريخ انتهاء صلاحية بطاقة التأهيل<br><span class="ltr">Expiration Date</span></th><th>ضمن فريق العمل المنفذ<br>نعم yes</th><th>لا No</th></tr></thead>
      <tbody>${M.map((m, i) => html`<tr><td>${i + 1}</td><td>${m ? m.name : ''}</td><td class="ltr">${m ? m.iqama : ''}</td><td>${m ? m.cat : i === 0 ? 'المستلم / رئيس الفريق' : 'عامل مشارك'}</td><td>${m ? m.type : ''}</td><td class="ltr">${m ? m.exp ? html`<span class="${daysTo(m.exp) < 0 ? 'pill exp' : ''}">${m.exp}</span>` : '' : ''}</td><td>${m && m.inTeam ? '✓' : ''}</td><td></td></tr>`)}</tbody></table>
    <table class="ftable twf"><tbody><tr><th rowspan="2">مسئول تنفيذ العمل (مقاول)<br><span class="ltr">Contractor</span></th><th>الاسم / Name</th><th>الإقامة<br><span class="ltr">Iqama No.</span></th><th>فئة التأهيل<br><span class="ltr">Authorization Category</span></th><th>تاريخ انتهاء الصلاحية<br><span class="ltr">Expiration Date</span></th><th>التوقيع<br><span class="ltr">Signature</span></th></tr>
      <tr><td>${f.resp ? f.resp.name : ''}</td><td class="ltr">${f.resp ? f.resp.iqama : ''}</td><td>${f.resp ? f.resp.cat : ''}</td><td class="ltr">${f.resp ? f.resp.exp : ''}</td><td style="height:34px"></td></tr></tbody></table>
    <table class="ftable twf"><tbody><tr><th rowspan="2">مدير الدائرة / القسم<br><span class="ltr">Div.Mang / Section head</span></th><th>الاسم / Name</th><th>الرقم الوظيفي<br><span class="ltr">Badge No.</span></th><th>التوقيع<br><span class="ltr">Signature</span></th></tr><tr><td>${f.div.name}</td><td class="ltr">${f.div.badge}</td><td style="height:34px"></td></tr></tbody></table>
    <h3 class="twf-h">مرحلة تنفيذ العمل: <span class="ltr">Execution phase</span></h3>
    <p style="font-size:13px;margin:0">تم إضافة الأسماء التالية والتي تحقق منها مصدر تصريح العمل في موقع العمل (يعبأ في موقع العمل)</p>
    <table class="ftable twf"><thead><tr><th>No</th><th>الاسم / Name</th><th>تاريخ انتهاء صلاحية بطاقة التأهيل<br><span class="ltr">Expiration Date</span></th><th>فئة التأهيل<br><span class="ltr">Authorization Category</span></th><th>نوع التأهيل<br><span class="ltr">Authorization Type</span></th><th>رقم الإقامة<br><span class="ltr">Iqama No.</span></th></tr></thead><tbody>${blank(5).map((i) => html`<tr><td>${i + 1}</td><td style="height:26px"></td><td></td><td>عامل مشارك</td><td></td><td></td></tr>`)}</tbody></table>
    <table class="ftable twf"><thead><tr><th></th><th>الاسم / Name</th><th>الرقم الوظيفي<br><span class="ltr">Badge No.</span></th><th>تاريخ انتهاء الصلاحية<br><span class="ltr">Expiration Date</span></th><th>التوقيع<br><span class="ltr">Signature</span></th><th>التاريخ<br><span class="ltr">Date</span></th></tr></thead>
      <tbody><tr><th>مستلم تصريح العمل<br><span class="ltr">Receiver</span></th><td>${f.receiver.name}</td><td class="ltr">${f.receiver.badge}</td><td></td><td style="height:30px"></td><td></td></tr><tr><th>مصدر تصريح العمل<br><span class="ltr">Issuer</span></th><td>${f.issuer.name}</td><td class="ltr">${f.issuer.badge}</td><td></td><td style="height:30px"></td><td></td></tr>
      <tr><th>رقم تصريح العمل الأساسي<br><span class="ltr">Main Work Permit No.</span></th><td colspan="5" class="ltr" style="text-align:center"><b>${f.mainPtw}</b></td></tr></tbody></table>
    <ul style="font-size:12px;margin:4px 0"><li>التأكد من صحة بيانات الموظفين في موقع العمل (مسئولية مصدر تصريح العمل) قبل إصدار تصريح العمل.</li><li>إرفاق النموذج مع نسخة تصريح العمل مع المستلم في موقع العمل.</li></ul>`;
  } else if (f.gen === 'ra') {
    body = html`<table class="ftable bi rm"><tbody><tr><th>مصفوفة الخطورة / Risk = L × S</th>${[['منخفض Low 1–4', 'ok'], ['متوسط Medium 5–9', 'warn'], ['عالٍ High 10–16', 'bad'], ['حرج Critical 20–25', 'exp']].map((x) => html`<td><span class="pill ${x[1]}">${x[0]}</span></td>`)}</tr></tbody></table>
    <table class="ftable bi ra"><thead><tr><th>م</th><th>النشاط<br><span class="ltr">Activity</span></th><th>الخطر<br><span class="ltr">Hazard</span></th><th>الأثر<br><span class="ltr">Consequence</span></th><th>L</th><th>S</th><th>R</th><th>إجراءات التحكم<br><span class="ltr">Control measures</span></th><th>L</th><th>R المتبقي<br><span class="ltr">Residual</span></th><th>المسؤول<br><span class="ltr">Responsible</span></th></tr></thead>
      <tbody>${f.rows.map((r, i) => { const a = riskLvl(r.R), b = riskLvl(r.rR); return html`<tr><td>${i + 1}</td><td>${r.act}</td><td><b>${r.h}</b>${r.hen ? html`<div class="ltr t-mut" style="font-size:11px">${r.hen}</div>` : ''}</td><td>${r.cons}</td><td>${r.L}</td><td>${r.S}</td><td><span class="pill ${a[2]}">${r.R} ${a[0]}</span></td><td><ul class="ctl">${r.ctl.map((c) => html`<li>${c[0]}${c[1] ? html`<div class="ltr t-mut" style="font-size:11px">${c[1]}</div>` : ''}</li>`)}</ul></td><td>${r.rL}</td><td><span class="pill ${b[2]}">${r.rR} ${b[0]}</span></td><td>المستلم / Receiver</td></tr>`; })}</tbody></table>
    <p style="font-size:12px">أي خطر متبقٍ «عالٍ» أو «حرج» يوقف العمل حتى تُضاف تدابير تحكم إضافية ويعيد مهندس السلامة التقييم. المراجع: ${HSE_SRC.r012} · ${HSE_SRC.r002} · ${HSE_SRC.gr}.</p>${sig}`;
  } else {
    const n = (i, ar, en) => html`<h3 class="jsp-h">${i}. ${ar} <span class="ltr">— ${en}</span></h3>`;
    body = html`${n(1, 'الغرض والنطاق', 'Purpose & scope')}<p style="font-size:13px">تحديد خطوات تنفيذ «${f.kind}» في ${f.district} بشكل آمن، وفق قواعد سلامة التوزيع ووثائق السلامة المعتمدة لدى الشركة السعودية للكهرباء. المخاطر الرئيسية: ${f.hazards.join('، ')}.</p>
    ${n(2, 'المراجع', 'References')}<ul style="font-size:12px"><li>${HSE_SRC.r012}</li><li>${HSE_SRC.r002}</li><li>${HSE_SRC.ohs}</li><li>${HSE_SRC.gr}</li></ul>
    ${n(3, 'وثائق السلامة المطلوبة', 'Required safety documents')}<table class="ftable bi"><thead><tr><th>الرمز</th><th>الوثيقة / Document</th><th>المدة ← الصلاحية / Validity</th></tr></thead><tbody>${f.docs.map((k) => { const D = SAFETY_DOCS[k]; return html`<tr><td class="ltr"><b>${k}</b></td><td>${D[0]} <span class="ltr t-mut">${D[1]}</span></td><td style="font-size:12px">${D[3].map((x) => (x[0] ? '≤' + x[0] + ' يوم ← ' : '') + x[1]).join(' · ') || '—'}</td></tr>`; })}</tbody></table>
    ${n(4, 'فريق العمل والتأهيل', 'Team & authorization')}<table class="ftable bi"><thead><tr><th>الاسم / Name</th><th>الدور / Role</th><th>فئة التأهيل / Category</th><th>انتهاء البطاقة / Expiry</th></tr></thead><tbody>${f.team.map((m) => html`<tr><td>${m.name}</td><td>${m.role}</td><td>${m.cat || html`<span class="pill warn">غير محدد</span>`}</td><td class="ltr">${m.exp ? html`<span class="${daysTo(m.exp) < 0 ? 'pill exp' : ''}">${m.exp}</span>` : '—'}</td></tr>`)}</tbody></table>
    ${n(5, 'مهمات الوقاية الشخصية', 'Personal protective equipment')}<div class="chips">${f.ppe.map((p) => html`<span class="pill mutp">${p[0]}${p[1] ? ' / ' + p[1] : ''}</span>`)}</div>
    ${f.tools.length ? html`${n(6, 'المعدات', 'Plant & equipment')}<p style="font-size:13px">${f.tools.join('، ')}</p>` : ''}
    ${n(7, 'خطوات العمل', 'Work steps')}${f.steps.map((s) => html`<h4 style="margin:6px 0 2px;font-size:14px">${s[0]}</h4><ol class="jsp-s">${s[1].map((x) => html`<li>${x[0]}${x[1] ? html`<div class="ltr t-mut" style="font-size:11px">${x[1]}</div>` : ''}</li>`)}</ol>`)}
    ${n(8, 'متطلبات الموقع', 'Site requirements')}<ul class="jsp-c">${f.site.map((x) => html`<li>☐ ${x}</li>`)}</ul>
    ${n(9, 'حالات إيقاف العمل', 'Stop-work conditions')}<ul style="font-size:13px">${f.stop.map((x) => html`<li>${x[0]} <span class="ltr t-mut">— ${x[1]}</span></li>`)}</ul>
    ${n(10, 'الطوارئ', 'Emergency')}<ol style="font-size:13px">${f.emergency.map((x) => html`<li>${x[0]} <span class="ltr t-mut">— ${x[1]}</span></li>`)}</ol><p style="font-size:13px"><b>أرقام الطوارئ:</b> الطوارئ الموحد 911 · طوارئ الكهرباء 933 · الدفاع المدني 998 · الهلال الأحمر 997</p>${sig}`;
  }
  return html`<div class="dlg printable hsedoc" style="gap:8px">${hseHead(f)}${body}
    <p class="t-mut" style="font-size:11px;border-top:1px solid var(--line2);padding-top:6px">${cfg().brand.footer} · ${fmtT(d.tm)} · أُعدّ آلياً من «ميدان» — يُراجع ويُوقّع قبل الاستخدام</p>
    <div class="row noprint"><button class="btn" type="button" data-act="hse-regen" data-id="${d.id}">تحديث من البيانات</button><button class="btn pri" type="button" data-act="print">طباعة / حفظ PDF</button><button class="btn" type="button" data-act="dlg-close">إغلاق</button></div></div>`;
}
function hseSaveDoc(k, j, f) {
  const type = { twf: 'نموذج فريق العمل', jsp: 'إجراءات العمل الآمن', ra: 'تقييم المخاطر' }[k];
  let d = DB.docs.find((x) => x.taskId === j.id && x.form && x.form.gen === k);
  if (d) { d.form = f; d.tm = nowIso(); } else { d = { id: uid('d'), type, title: GEN_TITLE[k][0] + ' — ' + (j.uid || j.permit || '') + ' ' + (j.kind || j.title), crewId: j.crewId, taskId: j.id, workType: j.workType || '', person: CUR.name, exp: '', url: '', fileId: '', fileName: '', size: 0, form: f, tm: nowIso(), by: CUR.name }; DB.docs.unshift(d); }
  return d;
}
function hseShow(d) { FORM = null; const dl = $('#dlg'); dl.innerHTML = hseDocHtml(d).s; dl.showModal(); }
function hseTwfForm(j) {
  const team = hseTeam(j); if (!team.length) return toast('أسند المعاملة لفرقة أولاً.', 'err');
  const rec = team.find((m) => m.authCat === 'receiver') || team[0];
  openForm('نموذج فريق العمل للمقاول — Contractor Team Work Form', [{ k: 'date', label: 'التاريخ Date', type: 'date', val: today() }, { k: 'contractor', label: 'اسم المقاول Contractor Name', val: cfg().brand.company }, { k: 'woNo', label: 'رقم أمر اسناد العمل WO No.', val: j.woNo || '', ltr: true }, { k: 'desc', label: 'وصف العمل Work Description', val: j.title || j.kind },
    { k: 'receiver', label: 'المستلم / رئيس الفريق Receiver', type: 'select', opts: team.map((m) => [m.iqama || m.name, m.name + ' — ' + m.role + (m.authCat ? ' · ' + AUTH_CATS[m.authCat][0] : '')]), val: rec.iqama || rec.name },
    { k: 'mainPtw', label: 'رقم تصريح العمل الأساسي Main PTW No.', val: (j.ptw && j.ptw.no) || '', ltr: true }, { k: 'issuer', label: 'مصدر تصريح العمل Issuer', val: (j.ptw && j.ptw.issuer) || '' }, { k: 'issuerBadge', label: 'الرقم الوظيفي للمصدر Badge No.', ltr: true },
    { k: 'divName', label: 'مدير الدائرة / رئيس القسم', val: '' }, { k: 'divBadge', label: 'الرقم الوظيفي Badge No.', ltr: true }], (v) => {
    if (v.woNo && !/^\d{6,12}$/.test(v.woNo.trim())) return 'رقم أمر العمل أرقام فقط.';
    const f = hseGenerate('twf', j, v); const d = hseSaveDoc('twf', j, f); audit(CUR.name, 'توليد نموذج فريق العمل', j.uid || j.title); UI.hseOpen = d.id;
  }, { ok: 'توليد النموذج', note: 'يُعبأ الفريق من الفرقة المسندة وبطاقات التأهيل في ملفات الموظفين (الفئة والنوع وتاريخ الانتهاء).' });
}

// ---------- actions ----------
const HSE_ACT = {
  'hse-tab': (d) => { UI.hseTab = d.k; render(); },
  'hse-gen': (d) => { const j = taskById(d.id); if (!j || !need('request')) return; if (d.k === 'twf') return hseTwfForm(j); const f = hseGenerate(d.k, j, {}); const doc = hseSaveDoc(d.k, j, f); audit(CUR.name, 'توليد ' + GEN_TITLE[d.k][0], j.uid || j.title); save(); render(); hseShow(doc); },
  'hse-regen': (d) => { const doc = DB.docs.find((x) => x.id === d.id); const j = doc && taskById(doc.taskId); if (!j || !need('request')) return; const prev = doc.form; const f = hseGenerate(prev.gen, j, prev.gen === 'twf' ? { date: prev.date, contractor: prev.contractor, woNo: prev.woNo, desc: prev.desc, receiver: prev.members[0] && prev.members[0].iqama, mainPtw: prev.mainPtw, issuer: prev.issuer.name, issuerBadge: prev.issuer.badge, divName: prev.div.name, divBadge: prev.div.badge } : {}); doc.form = f; doc.tm = nowIso(); save(); hseShow(doc); },
  'hse-ptw': (d) => { const j = taskById(d.id); if (!j || !need('edit')) return; const p = j.ptw || {};
    openForm('تصريح العمل الأساسي (PTW)', [{ k: 'type', label: 'نوع الوثيقة', type: 'select', opts: ['LVPTW', 'MVPTW', 'LOA', 'SFT'].map((k) => [k, k + ' — ' + SAFETY_DOCS[k][0]]), val: p.type || 'LVPTW' }, { k: 'no', label: 'رقم التصريح', val: p.no || '', ltr: true }, { k: 'from', label: 'من', type: 'date', val: p.from || today() }, { k: 'to', label: 'إلى', type: 'date', val: p.to || addDays(13) },
      { k: 'issuer', label: 'المصدر Issuer', val: p.issuer || '' }, { k: 'receiver', label: 'المستلم Receiver', type: 'select', opts: [['', '—']].concat(hseTeam(j).map((m) => [m.name, m.name + ' — ' + m.role])), val: p.receiver || '' }, { k: 'extra', label: 'وثائق فرعية مرفقة', type: 'checks', opts: ['EXC', 'WAH', 'LOP', 'CSEP', 'IER'].map((k) => [k, k + ' ' + SAFETY_DOCS[k][0]]), val: p.extra || [] }], (v) => {
      if (!/^[A-Za-z0-9\-\/]{2,20}$/.test(v.no.trim())) return 'رقم التصريح غير صالح.'; if (!validDate(v.from) || !validDate(v.to) || v.to < v.from) return 'تواريخ غير صالحة.';
      const days = Math.round((new Date(v.to + 'T12:00:00') - new Date(v.from + 'T12:00:00')) / 86400000) + 1; if (days > (v.type === 'SFT' ? 1 : 120)) return v.type === 'SFT' ? 'التعميد بالاختبار يوم واحد فقط.' : 'الحد الأقصى لوثيقة السلامة 120 يوماً.';
      if (v.issuer.trim() && v.issuer.trim() === String(v.receiver || '').trim()) return 'المصدر لا يصدر وثيقة سلامة لنفسه.';
      j.ptw = { type: v.type, no: v.no.trim(), from: v.from, to: v.to, issuer: v.issuer.trim().slice(0, 80), receiver: v.receiver, extra: v.extra, tm: nowIso(), by: CUR.name }; if (j.flow) flLog(j, j.stage, 'تسجيل ' + v.type + ' ' + j.ptw.no); audit(CUR.name, 'تسجيل تصريح عمل', (j.uid || j.title) + ' · ' + j.ptw.no);
    }, { ok: 'حفظ' }); },
  'hse-up': (d) => { if (!(can('settings') || can('permits'))) return need('permits'); openForm('رفع ملف إجراءات العمل / تقييم المخاطر', [{ k: 'file', label: 'الملف (Word أو PDF نصي أو نص أو Excel)', type: 'file', wide: true }], async (v) => {
      if (!v.file) return 'اختر ملفاً.'; let t = ''; try { t = await hseFileText(v.file); } catch (e) { return e.message; } return hseRunAnalysis(d.k, v.file.name, t); }, { ok: 'تحليل' }); },
  'hse-paste': (d) => { if (!(can('settings') || can('permits'))) return need('permits'); openForm('تحليل نص إجراء أو تقييم مخاطر', [{ k: 'name', label: 'اسم المستند', val: 'نص ملصق' }, { k: 'text', label: 'النص', type: 'textarea', max: 60000 }], async (v) => { if (String(v.text || '').trim().length < 40) return 'الصق نصاً أطول.'; return hseRunAnalysis(d.k, v.name.trim().slice(0, 80) || 'نص ملصق', v.text); }, { ok: 'تحليل' }); },
  'hse-an-x': () => { UI.hseAn = null; render(); },
  'hse-item': (d) => { if (!(can('settings') || can('permits'))) return need('permits'); openForm('بند جديد', [{ k: 'cat', label: 'التصنيف', type: 'select', opts: [['work', 'بند عمل'], ['site', 'بند موقع (قائمة فحص HSE)'], ['ppe', 'مهمات وقاية'], ['permit', 'تصريح / وثيقة']], val: 'site' }, { k: 'ar', label: 'نص البند', type: 'textarea', max: 260 }], (v) => { const t = String(v.ar || '').trim(); if (t.length < 5) return 'اكتب البند.'; hseLib(d.k).items.push({ id: uid('hi'), cat: v.cat, ar: t.slice(0, 260), src: 'إدخال يدوي — ' + CUR.name }); audit(CUR.name, 'إضافة بند سلامة', t.slice(0, 60)); }); },
  'hse-del': (d) => { if (!(can('settings') || can('permits'))) return need('permits'); const L = hseLib(d.k); L.items = L.items.filter((x) => x.id !== d.id); save(); render(); }
};
async function hseRunAnalysis(wt, name, text) {
  const loc = hseAnalyze(text); let via = 'تحليل محلي بالكلمات المفتاحية'; let items = loc.items.slice();
  const ai = await hseAnalyzeAI(text);
  if (ai) { via = 'الذكاء الاصطناعي · ' + ai.via; const add = (cat, L) => L.forEach((s) => { if (!items.some((x) => x.ar === s)) items.unshift({ cat, ar: s }); });
    add('permit', ai.permits); add('ppe', ai.ppe); add('site', ai.site); add('work', ai.work); ai.hazards.forEach((h) => h.c.forEach((c) => { if (!items.some((x) => x.ar === c)) items.push({ cat: 'work', ar: c }); })); }
  if (!items.length && !loc.hazards.length) return 'لم يُستخرج نص قابل للتحليل. إن كان الملف ممسوحاً ضوئياً فالصق نصه.';
  UI.hseAn = { wt, name, via, hazards: loc.hazards.concat(ai ? ai.hazards.map((h) => ({ id: '', h: h.h, n: 0 })) : []), codes: loc.codes, items: items.slice(0, 80), text: '' };
  UI.view = 'hse'; UI.hseTab = 'lib'; UI.hseWt = wt; audit(CUR.name, 'تحليل ملف سلامة', name);
}
const HSE_FORMS = {
  'hse-add': (f, form) => { const A = UI.hseAn; if (!A || !(can('settings') || can('permits'))) return; const L = hseLib(A.wt); let n = 0;
    Array.from(form.querySelectorAll('input[name=pick]:checked')).forEach((i) => { const x = A.items[+i.value]; if (!x) return; const cat = ['work', 'site', 'ppe', 'permit'].includes(form.elements['cat' + i.value].value) ? form.elements['cat' + i.value].value : x.cat; if (L.items.some((y) => y.ar === x.ar)) return; L.items.push({ id: uid('hi'), cat, ar: x.ar.slice(0, 260), src: A.name }); n++; });
    L.files.unshift({ name: A.name, n, tm: nowIso(), by: CUR.name, via: A.via }); L.files.length = Math.min(L.files.length, 30); UI.hseAn = null; audit(CUR.name, 'إضافة بنود سلامة من ملف', A.name + ' · ' + n); save(); toast('أُضيف ' + n + ' بنداً إلى متطلبات العمل والموقع.'); render(); },
  'hse-gen': (f) => { HSE_ACT['hse-gen']({ k: f.k, id: f.id }); }
};
function hseMigrate(d) {
  d.hseLib = d.hseLib || {};
  if (!d.lists.empDocs.includes(AUTH_CARD)) d.lists.empDocs.splice(2, 0, AUTH_CARD);
  return d;
}
if (!FL_CARD_DOCS.includes(AUTH_CARD)) FL_CARD_DOCS.splice(2, 0, AUTH_CARD);
Object.assign(FL_ACT, HSE_ACT);
Object.assign(ACT_RULES, { 'hse-gen': ['request'], 'hse-regen': ['request'], 'hse-ptw': ['permits'] });

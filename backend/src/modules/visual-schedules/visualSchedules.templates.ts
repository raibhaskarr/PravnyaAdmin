import type { Kind } from "./visualSchedules.schemas";

// Ready-made schedules a therapist can start from (and then change). Pictures are Mulberry symbol
// ids; visualSchedules.templates.test.ts checks every one exists.

type TemplateStep = { en: string; hi: string; symbolId: string; minutes?: number };
export type Template = { id: string; kind: Kind; title: { en: string; hi: string }; steps: TemplateStep[] };

export const TEMPLATES: Template[] = [
  {
    id: "work-then-play",
    kind: "FIRST_THEN",
    title: { en: "First work, then play", hi: "पहले काम, फिर खेल" },
    steps: [
      { en: "Work", hi: "काम", symbolId: "arasaac:6624", minutes: 5 },
      { en: "Play", hi: "खेल", symbolId: "arasaac:6537" }
    ]
  },
  {
    id: "brushing-teeth",
    kind: "ROUTINE",
    title: { en: "Brushing teeth", hi: "दाँत साफ़ करना" },
    steps: [
      { en: "Toothpaste", hi: "टूथपेस्ट", symbolId: "arasaac:2858" },
      { en: "Brush teeth", hi: "ब्रश करो", symbolId: "arasaac:2326", minutes: 2 },
      { en: "Rinse", hi: "कुल्ला करो", symbolId: "arasaac:34824" },
      { en: "Wipe mouth", hi: "मुँह पोंछो", symbolId: "arasaac:2593" },
      { en: "All done", hi: "हो गया", symbolId: "arasaac:5358" }
    ]
  },
  {
    id: "using-the-toilet",
    kind: "ROUTINE",
    title: { en: "Using the toilet", hi: "टॉयलेट जाना" },
    steps: [
      { en: "Go to the toilet", hi: "टॉयलेट जाओ", symbolId: "arasaac:5921" },
      { en: "Pants down", hi: "पैंट नीचे", symbolId: "arasaac:2565" },
      { en: "Sit on the toilet", hi: "टॉयलेट पर बैठो", symbolId: "arasaac:5921" },
      { en: "Wipe", hi: "पोंछो", symbolId: "arasaac:2862" },
      { en: "Flush", hi: "फ्लश करो", symbolId: "arasaac:10184" },
      { en: "Wash hands", hi: "हाथ धोओ", symbolId: "arasaac:8977" },
      { en: "Dry hands", hi: "हाथ सुखाओ", symbolId: "arasaac:2566" }
    ]
  },
  {
    id: "morning",
    kind: "ROUTINE",
    title: { en: "Getting ready in the morning", hi: "सुबह तैयार होना" },
    steps: [
      { en: "Wake up", hi: "उठो", symbolId: "arasaac:8989" },
      { en: "Toilet", hi: "टॉयलेट", symbolId: "arasaac:5921" },
      { en: "Brush teeth", hi: "ब्रश करो", symbolId: "arasaac:2326" },
      { en: "Get dressed", hi: "कपड़े पहनो", symbolId: "arasaac:6627" },
      { en: "Breakfast", hi: "नाश्ता", symbolId: "arasaac:4626" },
      { en: "School bag", hi: "स्कूल बैग", symbolId: "arasaac:2475" },
      { en: "Go to school", hi: "स्कूल चलो", symbolId: "arasaac:32446" }
    ]
  },
  {
    id: "mealtime",
    kind: "ROUTINE",
    title: { en: "Mealtime", hi: "खाने का समय" },
    steps: [
      { en: "Wash hands", hi: "हाथ धोओ", symbolId: "arasaac:8977" },
      { en: "Sit down", hi: "बैठो", symbolId: "arasaac:6611" },
      { en: "Eat", hi: "खाओ", symbolId: "arasaac:6456" },
      { en: "Drink", hi: "पियो", symbolId: "arasaac:4575" },
      { en: "All done", hi: "हो गया", symbolId: "arasaac:5358" }
    ]
  },
  {
    id: "bedtime",
    kind: "ROUTINE",
    title: { en: "Bedtime", hi: "सोने का समय" },
    steps: [
      { en: "Bath", hi: "नहाओ", symbolId: "arasaac:25843" },
      { en: "Pyjamas", hi: "नाइट सूट", symbolId: "arasaac:2522" },
      { en: "Brush teeth", hi: "ब्रश करो", symbolId: "arasaac:2326" },
      { en: "Quiet time", hi: "शांत समय", symbolId: "arasaac:38050" },
      { en: "Bed", hi: "बिस्तर", symbolId: "arasaac:25900" }
    ]
  },
  {
    id: "therapy-day",
    kind: "DAY",
    title: { en: "Therapy day", hi: "थेरेपी का दिन" },
    steps: [
      { en: "Wake up", hi: "उठो", symbolId: "arasaac:8989" },
      { en: "Breakfast", hi: "नाश्ता", symbolId: "arasaac:4626" },
      { en: "Car", hi: "गाड़ी", symbolId: "arasaac:2339" },
      { en: "Therapy", hi: "थेरेपी", symbolId: "arasaac:6624" },
      { en: "Lunch", hi: "खाना", symbolId: "arasaac:6456" },
      { en: "Play", hi: "खेल", symbolId: "arasaac:6537" },
      { en: "Bath", hi: "नहाओ", symbolId: "arasaac:25843" },
      { en: "Bed", hi: "बिस्तर", symbolId: "arasaac:25900" }
    ]
  },
  {
    id: "bath-time",
    kind: "ROUTINE",
    title: { en: "Bath time", hi: "नहाने का समय" },
    steps: [
      { en: "Undress", hi: "कपड़े उतारो", symbolId: "arasaac:11233" },
      { en: "Step in", hi: "बाथ में बैठो", symbolId: "arasaac:25843" },
      { en: "Shampoo", hi: "शैम्पू", symbolId: "arasaac:2699" },
      { en: "Soap", hi: "साबुन", symbolId: "arasaac:8094" },
      { en: "Rinse", hi: "पानी डालो", symbolId: "arasaac:34824" },
      { en: "Towel dry", hi: "पोंछो", symbolId: "arasaac:2593" },
      { en: "Pyjamas", hi: "नाइट सूट", symbolId: "arasaac:2522" }
    ]
  },
  {
    id: "haircut",
    kind: "ROUTINE",
    title: { en: "Haircut", hi: "बाल कटवाना" },
    steps: [
      { en: "Sit in the chair", hi: "कुर्सी पर बैठो", symbolId: "arasaac:3155" },
      { en: "Comb hair", hi: "बाल काढ़ो", symbolId: "arasaac:2852" },
      { en: "Cut with scissors", hi: "कैंची से काटो", symbolId: "arasaac:2591" },
      { en: "Look in the mirror", hi: "शीशे में देखो", symbolId: "arasaac:8573" },
      { en: "All done", hi: "हो गया", symbolId: "arasaac:5358" },
      { en: "Home", hi: "घर", symbolId: "arasaac:6964" }
    ]
  },
  {
    id: "doctor-visit",
    kind: "ROUTINE",
    title: { en: "Going to the doctor", hi: "डॉक्टर के पास जाना" },
    steps: [
      { en: "Car", hi: "गाड़ी", symbolId: "arasaac:2339" },
      { en: "Wait", hi: "इंतज़ार", symbolId: "arasaac:16697" },
      { en: "Doctor", hi: "डॉक्टर", symbolId: "arasaac:2467" },
      { en: "Listen with the stethoscope", hi: "स्टेथोस्कोप से देखें", symbolId: "arasaac:6000" },
      { en: "Open mouth", hi: "मुँह खोलो", symbolId: "arasaac:2663" },
      { en: "Thermometer", hi: "थर्मामीटर", symbolId: "arasaac:32051" },
      { en: "All done", hi: "हो गया", symbolId: "arasaac:5358" },
      { en: "Home", hi: "घर", symbolId: "arasaac:6964" }
    ]
  },
  {
    id: "market-trip",
    kind: "ROUTINE",
    title: { en: "Going to the shop", hi: "दुकान जाना" },
    steps: [
      { en: "Shopping list", hi: "लिस्ट", symbolId: "arasaac:10312" },
      { en: "Car", hi: "गाड़ी", symbolId: "arasaac:2339" },
      { en: "Shop", hi: "दुकान", symbolId: "arasaac:8986" },
      { en: "Basket", hi: "टोकरी", symbolId: "arasaac:3012" },
      { en: "Pay", hi: "पैसे दो", symbolId: "arasaac:4630" },
      { en: "Home", hi: "घर", symbolId: "arasaac:6964" }
    ]
  },
  {
    id: "calming-down",
    kind: "ROUTINE",
    title: { en: "Calming down", hi: "शांत होना" },
    steps: [
      { en: "Stop", hi: "रुको", symbolId: "arasaac:2567" },
      { en: "Blow bubbles", hi: "बुलबुले उड़ाओ", symbolId: "arasaac:6945" },
      { en: "Count to 5", hi: "5 तक गिनो", symbolId: "arasaac:2714" },
      { en: "A tight hug", hi: "गले लगाओ", symbolId: "arasaac:4550" },
      { en: "A drink of water", hi: "पानी पिओ", symbolId: "arasaac:2816" },
      { en: "Quiet time", hi: "शांत समय", symbolId: "arasaac:38050" },
      { en: "Ready to go", hi: "अब तैयार", symbolId: "arasaac:4581" }
    ]
  },
  {
    id: "washing-hands",
    kind: "ROUTINE",
    title: { en: "Washing hands", hi: "हाथ धोना" },
    steps: [
      { en: "Water on", hi: "पानी खोलो", symbolId: "arasaac:2414" },
      { en: "Soap", hi: "साबुन", symbolId: "arasaac:8094" },
      { en: "Rub hands", hi: "रगड़ो", symbolId: "arasaac:8977" },
      { en: "Rinse", hi: "पानी से धोओ", symbolId: "arasaac:34824" },
      { en: "Dry hands", hi: "हाथ सुखाओ", symbolId: "arasaac:2566" }
    ]
  },
  {
    id: "waiting-turn",
    kind: "ROUTINE",
    title: { en: "Waiting for my turn", hi: "अपनी बारी का इंतज़ार" },
    steps: [
      { en: "Friends playing", hi: "दोस्त खेल रहे हैं", symbolId: "arasaac:6537" },
      { en: "Wait", hi: "इंतज़ार करो", symbolId: "arasaac:16697" },
      { en: "Watch the timer", hi: "टाइमर देखो", symbolId: "arasaac:35127" },
      { en: "My turn!", hi: "मेरी बारी!", symbolId: "arasaac:2752" },
      { en: "Share", hi: "मिल बाँटकर", symbolId: "arasaac:38900" }
    ]
  },
  {
    id: "therapy-session",
    kind: "ROUTINE",
    title: { en: "Therapy session (for home practice)", hi: "थेरेपी सेशन (घर पर)" },
    steps: [
      { en: "Say hello", hi: "नमस्ते", symbolId: "arasaac:6522" },
      { en: "Table work", hi: "टेबल का काम", symbolId: "arasaac:3129" },
      { en: "Short break", hi: "छोटा ब्रेक", symbolId: "arasaac:6604" },
      { en: "Speech practice", hi: "बोलने का अभ्यास", symbolId: "arasaac:6517" },
      { en: "Snack", hi: "खाने का समय", symbolId: "arasaac:2402" },
      { en: "Free play", hi: "खेलने का समय", symbolId: "arasaac:6537" },
      { en: "Pack up", hi: "समेटो", symbolId: "arasaac:2931" },
      { en: "All done", hi: "हो गया", symbolId: "arasaac:5358" }
    ]
  },
  {
    id: "morning-brush-potty-bath-milk",
    kind: "ROUTINE",
    title: { en: "Morning: brush, potty, bath, milk", hi: "सुबह: ब्रश, पॉटी, नहाना, दूध" },
    steps: [
      { en: "Wake up", hi: "उठो", symbolId: "arasaac:8989" },
      { en: "Brush teeth", hi: "ब्रश करो", symbolId: "arasaac:2326" },
      { en: "Potty", hi: "पॉटी", symbolId: "arasaac:5921" },
      { en: "Bath", hi: "नहाओ", symbolId: "arasaac:25843" },
      { en: "Towel dry", hi: "पोंछो", symbolId: "arasaac:2593" },
      { en: "Get dressed", hi: "कपड़े पहनो", symbolId: "arasaac:6627" },
      { en: "Milk", hi: "दूध", symbolId: "arasaac:2445" }
    ]
  },
  {
    id: "going-to-school",
    kind: "ROUTINE",
    title: { en: "Going to school", hi: "स्कूल जाना" },
    steps: [
      { en: "Uniform on", hi: "यूनिफ़ॉर्म पहनो", symbolId: "arasaac:6627" },
      { en: "Shoes", hi: "जूते", symbolId: "arasaac:2287" },
      { en: "School bag", hi: "स्कूल बैग", symbolId: "arasaac:2475" },
      { en: "Water bottle", hi: "पानी की बोतल", symbolId: "arasaac:2816" },
      { en: "Lunch box", hi: "टिफ़िन", symbolId: "arasaac:39457" },
      { en: "Say bye", hi: "अलविदा", symbolId: "arasaac:4550" },
      { en: "Car or bus", hi: "गाड़ी या बस", symbolId: "arasaac:2262" },
      { en: "School", hi: "स्कूल", symbolId: "arasaac:32446" }
    ]
  },
  {
    id: "going-to-therapy-centre",
    kind: "ROUTINE",
    title: { en: "Going to the therapy centre", hi: "थेरेपी सेंटर जाना" },
    steps: [
      { en: "Water bottle", hi: "पानी की बोतल", symbolId: "arasaac:2816" },
      { en: "A snack", hi: "थोड़ा सा नाश्ता", symbolId: "arasaac:2402" },
      { en: "Shoes on", hi: "जूते पहनो", symbolId: "arasaac:2287" },
      { en: "Car", hi: "गाड़ी", symbolId: "arasaac:2339" },
      { en: "Seat belt on", hi: "सीट बेल्ट लगाओ", symbolId: "arasaac:5962" },
      { en: "Say hello to the therapist", hi: "थेरेपिस्ट को नमस्ते", symbolId: "arasaac:6522" },
      { en: "Therapy", hi: "थेरेपी", symbolId: "arasaac:2395" },
      { en: "Go home", hi: "घर वापस", symbolId: "arasaac:6964" }
    ]
  },
  {
    id: "sports",
    kind: "ROUTINE",
    title: { en: "Sports", hi: "खेल-कूद" },
    steps: [
      { en: "Sports clothes", hi: "खेल के कपड़े", symbolId: "arasaac:6627" },
      { en: "Shoes", hi: "जूते", symbolId: "arasaac:5991" },
      { en: "Water bottle", hi: "पानी की बोतल", symbolId: "arasaac:2816" },
      { en: "Warm up", hi: "वार्म अप", symbolId: "arasaac:8989" },
      { en: "Play", hi: "खेलो", symbolId: "arasaac:6537" },
      { en: "Short break", hi: "छोटा ब्रेक", symbolId: "arasaac:6604" },
      { en: "A drink of water", hi: "पानी पिओ", symbolId: "arasaac:2816" },
      { en: "All done", hi: "हो गया", symbolId: "arasaac:5358" },
      { en: "Home", hi: "घर", symbolId: "arasaac:6964" }
    ]
  },
  {
    id: "shopping-mall",
    kind: "ROUTINE",
    title: { en: "Going to the shopping mall", hi: "मॉल जाना" },
    steps: [
      { en: "Car", hi: "गाड़ी", symbolId: "arasaac:2339" },
      { en: "Park the car", hi: "पार्किंग", symbolId: "arasaac:5379" },
      { en: "Lift or escalator", hi: "लिफ्ट या एस्केलेटर", symbolId: "arasaac:21830" },
      { en: "Shop", hi: "दुकान", symbolId: "arasaac:8986" },
      { en: "Hold hands, stay close", hi: "हाथ पकड़ो", symbolId: "arasaac:4550" },
      { en: "Eat something", hi: "कुछ खाओ", symbolId: "arasaac:6456" },
      { en: "Pay", hi: "पैसे दो", symbolId: "arasaac:4630" },
      { en: "Home", hi: "घर", symbolId: "arasaac:6964" }
    ]
  },
  {
    id: "grandparents-visit",
    kind: "ROUTINE",
    title: { en: "Going to Grandma and Grandpa's", hi: "दादा-दादी के घर जाना" },
    steps: [
      { en: "Pack a bag", hi: "बैग लगाओ", symbolId: "arasaac:2931" },
      { en: "Car", hi: "गाड़ी", symbolId: "arasaac:2339" },
      { en: "Seat belt on", hi: "सीट बेल्ट लगाओ", symbolId: "arasaac:5962" },
      { en: "Grandma and Grandpa", hi: "दादा-दादी", symbolId: "arasaac:6876" },
      { en: "A hug", hi: "झप्पी", symbolId: "arasaac:4550" },
      { en: "Eat together", hi: "साथ में खाओ", symbolId: "arasaac:6456" },
      { en: "Play", hi: "खेलो", symbolId: "arasaac:6537" },
      { en: "Say goodbye", hi: "अलविदा", symbolId: "arasaac:4550" },
      { en: "Home", hi: "घर", symbolId: "arasaac:6964" }
    ]
  },
  {
    id: "long-drive",
    kind: "ROUTINE",
    title: { en: "A long car journey", hi: "लंबी गाड़ी की यात्रा" },
    steps: [
      { en: "Toilet before we leave", hi: "निकलने से पहले टॉयलेट", symbolId: "arasaac:5921" },
      { en: "Water and a snack", hi: "पानी और नाश्ता", symbolId: "arasaac:2816" },
      { en: "Headphones or a book", hi: "हेडफ़ोन या किताब", symbolId: "arasaac:5915" },
      { en: "Seat belt on", hi: "सीट बेल्ट लगाओ", symbolId: "arasaac:5962" },
      { en: "Driving", hi: "गाड़ी चल रही है", symbolId: "arasaac:6458" },
      { en: "Stop for the toilet", hi: "टॉयलेट ब्रेक", symbolId: "arasaac:5921" },
      { en: "Short rest", hi: "थोड़ा आराम", symbolId: "arasaac:16643" },
      { en: "Driving again", hi: "फिर से चलो", symbolId: "arasaac:6458" },
      { en: "We're here", hi: "पहुँच गए", symbolId: "arasaac:5358" }
    ]
  }
];

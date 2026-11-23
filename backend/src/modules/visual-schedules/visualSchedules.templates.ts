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
      { en: "Work", hi: "काम", symbolId: "work_,_to", minutes: 5 },
      { en: "Play", hi: "खेल", symbolId: "play_,_to" }
    ]
  },
  {
    id: "brushing-teeth",
    kind: "ROUTINE",
    title: { en: "Brushing teeth", hi: "दाँत साफ़ करना" },
    steps: [
      { en: "Toothpaste", hi: "टूथपेस्ट", symbolId: "toothpaste" },
      { en: "Brush teeth", hi: "ब्रश करो", symbolId: "brush_teeth_,_to", minutes: 2 },
      { en: "Rinse", hi: "कुल्ला करो", symbolId: "rinse_,_to" },
      { en: "Wipe mouth", hi: "मुँह पोंछो", symbolId: "towel" },
      { en: "All done", hi: "हो गया", symbolId: "finish" }
    ]
  },
  {
    id: "using-the-toilet",
    kind: "ROUTINE",
    title: { en: "Using the toilet", hi: "टॉयलेट जाना" },
    steps: [
      { en: "Go to the toilet", hi: "टॉयलेट जाओ", symbolId: "toilet_,_go_to_the" },
      { en: "Pants down", hi: "पैंट नीचे", symbolId: "pants" },
      { en: "Sit on the toilet", hi: "टॉयलेट पर बैठो", symbolId: "toilet" },
      { en: "Wipe", hi: "पोंछो", symbolId: "toilet_roll" },
      { en: "Flush", hi: "फ्लश करो", symbolId: "flush_toilet_,_to" },
      { en: "Wash hands", hi: "हाथ धोओ", symbolId: "wash_hands_,_to" },
      { en: "Dry hands", hi: "हाथ सुखाओ", symbolId: "dry_hands_,_to" }
    ]
  },
  {
    id: "morning",
    kind: "ROUTINE",
    title: { en: "Getting ready in the morning", hi: "सुबह तैयार होना" },
    steps: [
      { en: "Wake up", hi: "उठो", symbolId: "wake_up_,_to" },
      { en: "Toilet", hi: "टॉयलेट", symbolId: "toilet_,_go_to_the" },
      { en: "Brush teeth", hi: "ब्रश करो", symbolId: "brush_teeth_,_to" },
      { en: "Get dressed", hi: "कपड़े पहनो", symbolId: "get_dressed_,_to" },
      { en: "Breakfast", hi: "नाश्ता", symbolId: "breakfast_1" },
      { en: "School bag", hi: "स्कूल बैग", symbolId: "school_bag" },
      { en: "Go to school", hi: "स्कूल चलो", symbolId: "school" }
    ]
  },
  {
    id: "mealtime",
    kind: "ROUTINE",
    title: { en: "Mealtime", hi: "खाने का समय" },
    steps: [
      { en: "Wash hands", hi: "हाथ धोओ", symbolId: "wash_hands_,_to" },
      { en: "Sit down", hi: "बैठो", symbolId: "sit_,_to" },
      { en: "Eat", hi: "खाओ", symbolId: "eat_,_to" },
      { en: "Drink", hi: "पियो", symbolId: "drink_,_to" },
      { en: "All done", hi: "हो गया", symbolId: "finish" }
    ]
  },
  {
    id: "bedtime",
    kind: "ROUTINE",
    title: { en: "Bedtime", hi: "सोने का समय" },
    steps: [
      { en: "Bath", hi: "नहाओ", symbolId: "bath" },
      { en: "Pyjamas", hi: "नाइट सूट", symbolId: "pyjamas" },
      { en: "Brush teeth", hi: "ब्रश करो", symbolId: "brush_teeth_,_to" },
      { en: "Quiet time", hi: "शांत समय", symbolId: "quiet" },
      { en: "Bed", hi: "बिस्तर", symbolId: "bed_time" }
    ]
  },
  {
    id: "therapy-day",
    kind: "DAY",
    title: { en: "Therapy day", hi: "थेरेपी का दिन" },
    steps: [
      { en: "Wake up", hi: "उठो", symbolId: "wake_up_,_to" },
      { en: "Breakfast", hi: "नाश्ता", symbolId: "breakfast_1" },
      { en: "Car", hi: "गाड़ी", symbolId: "car" },
      { en: "Therapy", hi: "थेरेपी", symbolId: "work_,_to" },
      { en: "Lunch", hi: "खाना", symbolId: "eat_,_to" },
      { en: "Play", hi: "खेल", symbolId: "play_,_to" },
      { en: "Bath", hi: "नहाओ", symbolId: "bath" },
      { en: "Bed", hi: "बिस्तर", symbolId: "bed_time" }
    ]
  },
  {
    id: "bath-time",
    kind: "ROUTINE",
    title: { en: "Bath time", hi: "नहाने का समय" },
    steps: [
      { en: "Undress", hi: "कपड़े उतारो", symbolId: "undress_,_to" },
      { en: "Step in", hi: "बाथ में बैठो", symbolId: "bath" },
      { en: "Shampoo", hi: "शैम्पू", symbolId: "shampoo" },
      { en: "Soap", hi: "साबुन", symbolId: "soap" },
      { en: "Rinse", hi: "पानी डालो", symbolId: "rinse_,_to" },
      { en: "Towel dry", hi: "पोंछो", symbolId: "towel" },
      { en: "Pyjamas", hi: "नाइट सूट", symbolId: "pyjamas" }
    ]
  },
  {
    id: "haircut",
    kind: "ROUTINE",
    title: { en: "Haircut", hi: "बाल कटवाना" },
    steps: [
      { en: "Sit in the chair", hi: "कुर्सी पर बैठो", symbolId: "chair" },
      { en: "Comb hair", hi: "बाल काढ़ो", symbolId: "comb" },
      { en: "Cut with scissors", hi: "कैंची से काटो", symbolId: "cut_with_scissors_,_to" },
      { en: "Look in the mirror", hi: "शीशे में देखो", symbolId: "mirror" },
      { en: "All done", hi: "हो गया", symbolId: "finish" },
      { en: "Home", hi: "घर", symbolId: "house" }
    ]
  },
  {
    id: "doctor-visit",
    kind: "ROUTINE",
    title: { en: "Going to the doctor", hi: "डॉक्टर के पास जाना" },
    steps: [
      { en: "Car", hi: "गाड़ी", symbolId: "car" },
      { en: "Wait", hi: "इंतज़ार", symbolId: "wait_,_to" },
      { en: "Doctor", hi: "डॉक्टर", symbolId: "doctor_1a" },
      { en: "Listen with the stethoscope", hi: "स्टेथोस्कोप से देखें", symbolId: "stethoscope" },
      { en: "Open mouth", hi: "मुँह खोलो", symbolId: "mouth" },
      { en: "Thermometer", hi: "थर्मामीटर", symbolId: "thermometer" },
      { en: "All done", hi: "हो गया", symbolId: "finish" },
      { en: "Home", hi: "घर", symbolId: "house" }
    ]
  },
  {
    id: "market-trip",
    kind: "ROUTINE",
    title: { en: "Going to the shop", hi: "दुकान जाना" },
    steps: [
      { en: "Shopping list", hi: "लिस्ट", symbolId: "pencil_and_paper" },
      { en: "Car", hi: "गाड़ी", symbolId: "car" },
      { en: "Shop", hi: "दुकान", symbolId: "shop" },
      { en: "Basket", hi: "टोकरी", symbolId: "basket" },
      { en: "Pay", hi: "पैसे दो", symbolId: "money" },
      { en: "Home", hi: "घर", symbolId: "house" }
    ]
  },
  {
    id: "calming-down",
    kind: "ROUTINE",
    title: { en: "Calming down", hi: "शांत होना" },
    steps: [
      { en: "Stop", hi: "रुको", symbolId: "traffic_lights" },
      { en: "Blow bubbles", hi: "बुलबुले उड़ाओ", symbolId: "bubbles_blow" },
      { en: "Count to 5", hi: "5 तक गिनो", symbolId: "count_,_to" },
      { en: "A tight hug", hi: "गले लगाओ", symbolId: "hug_,_to" },
      { en: "A drink of water", hi: "पानी पिओ", symbolId: "water" },
      { en: "Quiet time", hi: "शांत समय", symbolId: "quiet" },
      { en: "Ready to go", hi: "अब तैयार", symbolId: "good" }
    ]
  },
  {
    id: "washing-hands",
    kind: "ROUTINE",
    title: { en: "Washing hands", hi: "हाथ धोना" },
    steps: [
      { en: "Water on", hi: "पानी खोलो", symbolId: "tap" },
      { en: "Soap", hi: "साबुन", symbolId: "soap" },
      { en: "Rub hands", hi: "रगड़ो", symbolId: "wash_hands_,_to" },
      { en: "Rinse", hi: "पानी से धोओ", symbolId: "rinse_,_to" },
      { en: "Dry hands", hi: "हाथ सुखाओ", symbolId: "dry_hands_,_to" }
    ]
  },
  {
    id: "waiting-turn",
    kind: "ROUTINE",
    title: { en: "Waiting for my turn", hi: "अपनी बारी का इंतज़ार" },
    steps: [
      { en: "Friends playing", hi: "दोस्त खेल रहे हैं", symbolId: "play_,_to" },
      { en: "Wait", hi: "इंतज़ार करो", symbolId: "wait_,_to" },
      { en: "Watch the timer", hi: "टाइमर देखो", symbolId: "timer_2" },
      { en: "My turn!", hi: "मेरी बारी!", symbolId: "star" },
      { en: "Share", hi: "मिल बाँटकर", symbolId: "share_,_to" }
    ]
  },
  {
    id: "therapy-session",
    kind: "ROUTINE",
    title: { en: "Therapy session (for home practice)", hi: "थेरेपी सेशन (घर पर)" },
    steps: [
      { en: "Say hello", hi: "नमस्ते", symbolId: "hello" },
      { en: "Table work", hi: "टेबल का काम", symbolId: "table" },
      { en: "Short break", hi: "छोटा ब्रेक", symbolId: "break_time_1" },
      { en: "Speech practice", hi: "बोलने का अभ्यास", symbolId: "talk_1_,_to" },
      { en: "Snack", hi: "खाने का समय", symbolId: "biscuits" },
      { en: "Free play", hi: "खेलने का समय", symbolId: "play_,_to" },
      { en: "Pack up", hi: "समेटो", symbolId: "pack_suitcase_,_to" },
      { en: "All done", hi: "हो गया", symbolId: "finish" }
    ]
  },
  {
    id: "morning-brush-potty-bath-milk",
    kind: "ROUTINE",
    title: { en: "Morning: brush, potty, bath, milk", hi: "सुबह: ब्रश, पॉटी, नहाना, दूध" },
    steps: [
      { en: "Wake up", hi: "उठो", symbolId: "wake_up_,_to" },
      { en: "Brush teeth", hi: "ब्रश करो", symbolId: "brush_teeth_,_to" },
      { en: "Potty", hi: "पॉटी", symbolId: "potty_chair" },
      { en: "Bath", hi: "नहाओ", symbolId: "bath" },
      { en: "Towel dry", hi: "पोंछो", symbolId: "towel" },
      { en: "Get dressed", hi: "कपड़े पहनो", symbolId: "get_dressed_,_to" },
      { en: "Milk", hi: "दूध", symbolId: "milk" }
    ]
  },
  {
    id: "going-to-school",
    kind: "ROUTINE",
    title: { en: "Going to school", hi: "स्कूल जाना" },
    steps: [
      { en: "Uniform on", hi: "यूनिफ़ॉर्म पहनो", symbolId: "get_dressed_,_to" },
      { en: "Shoes", hi: "जूते", symbolId: "boots" },
      { en: "School bag", hi: "स्कूल बैग", symbolId: "school_bag" },
      { en: "Water bottle", hi: "पानी की बोतल", symbolId: "water" },
      { en: "Lunch box", hi: "टिफ़िन", symbolId: "lunch_box" },
      { en: "Say bye", hi: "अलविदा", symbolId: "hug_,_to" },
      { en: "Car or bus", hi: "गाड़ी या बस", symbolId: "bus" },
      { en: "School", hi: "स्कूल", symbolId: "school" }
    ]
  },
  {
    id: "going-to-therapy-centre",
    kind: "ROUTINE",
    title: { en: "Going to the therapy centre", hi: "थेरेपी सेंटर जाना" },
    steps: [
      { en: "Water bottle", hi: "पानी की बोतल", symbolId: "water" },
      { en: "A snack", hi: "थोड़ा सा नाश्ता", symbolId: "biscuits" },
      { en: "Shoes on", hi: "जूते पहनो", symbolId: "boots" },
      { en: "Car", hi: "गाड़ी", symbolId: "car" },
      { en: "Seat belt on", hi: "सीट बेल्ट लगाओ", symbolId: "seat_belt" },
      { en: "Say hello to the therapist", hi: "थेरेपिस्ट को नमस्ते", symbolId: "hello" },
      { en: "Therapy", hi: "थेरेपी", symbolId: "occupational_therapist_1b" },
      { en: "Go home", hi: "घर वापस", symbolId: "house" }
    ]
  },
  {
    id: "sports",
    kind: "ROUTINE",
    title: { en: "Sports", hi: "खेल-कूद" },
    steps: [
      { en: "Sports clothes", hi: "खेल के कपड़े", symbolId: "get_dressed_,_to" },
      { en: "Shoes", hi: "जूते", symbolId: "trainers" },
      { en: "Water bottle", hi: "पानी की बोतल", symbolId: "water" },
      { en: "Warm up", hi: "वार्म अप", symbolId: "stretch_,_to" },
      { en: "Play", hi: "खेलो", symbolId: "play_,_to" },
      { en: "Short break", hi: "छोटा ब्रेक", symbolId: "break_time_1" },
      { en: "A drink of water", hi: "पानी पिओ", symbolId: "water" },
      { en: "All done", hi: "हो गया", symbolId: "finish" },
      { en: "Home", hi: "घर", symbolId: "house" }
    ]
  },
  {
    id: "shopping-mall",
    kind: "ROUTINE",
    title: { en: "Going to the shopping mall", hi: "मॉल जाना" },
    steps: [
      { en: "Car", hi: "गाड़ी", symbolId: "car" },
      { en: "Park the car", hi: "पार्किंग", symbolId: "park_,_to" },
      { en: "Lift or escalator", hi: "लिफ्ट या एस्केलेटर", symbolId: "escalator" },
      { en: "Shop", hi: "दुकान", symbolId: "shop" },
      { en: "Hold hands, stay close", hi: "हाथ पकड़ो", symbolId: "hug_,_to" },
      { en: "Eat something", hi: "कुछ खाओ", symbolId: "eat_,_to" },
      { en: "Pay", hi: "पैसे दो", symbolId: "money" },
      { en: "Home", hi: "घर", symbolId: "house" }
    ]
  },
  {
    id: "grandparents-visit",
    kind: "ROUTINE",
    title: { en: "Going to Grandma and Grandpa's", hi: "दादा-दादी के घर जाना" },
    steps: [
      { en: "Pack a bag", hi: "बैग लगाओ", symbolId: "pack_suitcase_,_to" },
      { en: "Car", hi: "गाड़ी", symbolId: "car" },
      { en: "Seat belt on", hi: "सीट बेल्ट लगाओ", symbolId: "seat_belt" },
      { en: "Grandma and Grandpa", hi: "दादा-दादी", symbolId: "grandparents" },
      { en: "A hug", hi: "झप्पी", symbolId: "hug_,_to" },
      { en: "Eat together", hi: "साथ में खाओ", symbolId: "eat_,_to" },
      { en: "Play", hi: "खेलो", symbolId: "play_,_to" },
      { en: "Say goodbye", hi: "अलविदा", symbolId: "hug_,_to" },
      { en: "Home", hi: "घर", symbolId: "house" }
    ]
  },
  {
    id: "long-drive",
    kind: "ROUTINE",
    title: { en: "A long car journey", hi: "लंबी गाड़ी की यात्रा" },
    steps: [
      { en: "Toilet before we leave", hi: "निकलने से पहले टॉयलेट", symbolId: "toilet_,_go_to_the" },
      { en: "Water and a snack", hi: "पानी और नाश्ता", symbolId: "water" },
      { en: "Headphones or a book", hi: "हेडफ़ोन या किताब", symbolId: "headphones" },
      { en: "Seat belt on", hi: "सीट बेल्ट लगाओ", symbolId: "seat_belt" },
      { en: "Driving", hi: "गाड़ी चल रही है", symbolId: "drive_,_to" },
      { en: "Stop for the toilet", hi: "टॉयलेट ब्रेक", symbolId: "toilet_,_go_to_the" },
      { en: "Short rest", hi: "थोड़ा आराम", symbolId: "rest_,_to" },
      { en: "Driving again", hi: "फिर से चलो", symbolId: "drive_,_to" },
      { en: "We're here", hi: "पहुँच गए", symbolId: "finish" }
    ]
  }
];

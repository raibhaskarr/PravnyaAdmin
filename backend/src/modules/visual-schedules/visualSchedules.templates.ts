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
  }
];

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
  }
];

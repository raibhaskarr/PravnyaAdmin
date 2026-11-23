// The AAC boards Pravnya ships with (English and Hindi). Created once in the database as Pravnya
// templates (see aacTemplates.service.ts); a superadmin can change or hide them after that.
// Pictures are Mulberry symbol ids, checked by aac.integration.test.ts; null where Mulberry has
// no symbol (shown as a coloured word; anyone can add a picture or photo).

type W = "pronoun" | "verb" | "describe" | "noun" | "social" | "question" | "misc";
/** [en, hi, symbol, word class] or a folder: [en, hi, symbol, "folder", page key]. */
type Spec = [string, string, string | null, W] | [string, string, string | null, "folder", string];

export type BuiltInBoard = { key: string; name: { en: string; hi: string }; rows: number; cols: number; pages: { key: string; name: { en: string; hi: string }; cells: (Spec | null)[] }[] };

// "more" and "all done" sit in the same squares on every page, so the child finds them by habit.
const MORE: Spec = ["more", "और", "more", "describe"];
const DONE: Spec = ["all done", "हो गया", "finish", "social"];

export const BUILT_IN_BOARDS: BuiltInBoard[] = [
  {
    key: "first-words",
    name: { en: "First words (6 buttons)", hi: "पहले शब्द (6 बटन)" },
    rows: 2,
    cols: 3,
    pages: [
      {
        key: "home",
        name: { en: "Home", hi: "होम" },
        cells: [MORE, DONE, ["help", "मदद", "help_,_to", "verb"], ["eat", "खाना", "eat_,_to", "verb"], ["drink", "पीना", "drink_,_to", "verb"], ["play", "खेलना", "play_,_to", "verb"]]
      }
    ]
  },
  {
    key: "core-24",
    name: { en: "Core words (24 buttons, 5 pages)", hi: "मुख्य शब्द (24 बटन, 5 पेज)" },
    rows: 4,
    cols: 6,
    pages: [
      {
        key: "home",
        name: { en: "Home", hi: "होम" },
        cells: [
          ["I", "मैं", "I", "pronoun"], ["you", "तुम", null, "pronoun"], ["want", "चाहिए", "want_,_to", "verb"], MORE, ["help", "मदद", "help_,_to", "verb"], DONE,
          ["go", "चलो", "go_,_to", "verb"], ["stop", "रुको", null, "verb"], ["eat", "खाना", "eat_,_to", "verb"], ["drink", "पीना", "drink_,_to", "verb"], ["play", "खेलना", "play_,_to", "verb"], ["look", "देखो", "look_,_to", "verb"],
          ["yes", "हाँ", null, "social"], ["no", "नहीं", null, "social"], ["open", "खोलो", "open_,_to", "verb"], ["up", "ऊपर", "up", "describe"], ["down", "नीचे", "down", "describe"], ["good", "अच्छा", "good", "describe"],
          ["what", "क्या", "what", "question"], ["where", "कहाँ", "where", "question"], ["Food", "खाना-पीना", "food", "folder", "food"], ["Toys", "खिलौने", "toys", "folder", "toys"], ["Feelings", "भावनाएँ", "happy_man", "folder", "feelings"], ["People", "लोग", "family", "folder", "people"]
        ]
      },
      {
        key: "food",
        name: { en: "Food", hi: "खाना-पीना" },
        cells: [
          ["apple", "सेब", "apple", "noun"], ["banana", "केला", "banana", "noun"], ["biscuit", "बिस्कुट", "biscuits", "noun"], MORE, ["rice", "चावल", "rice", "noun"], DONE,
          ["bread", "रोटी", "bread", "noun"], ["milk", "दूध", "milk", "noun"], ["water", "पानी", "water", "noun"], ["juice", "जूस", "apple_juice", "noun"], ["hot", "गरम", "hot", "describe"], ["eat", "खाना", "eat_,_to", "verb"]
        ]
      },
      {
        key: "toys",
        name: { en: "Toys", hi: "खिलौने" },
        cells: [
          ["ball", "गेंद", "ball", "noun"], ["car", "गाड़ी", "toy_car", "noun"], ["bubbles", "बुलबुले", "bubbles", "noun"], MORE, ["doll", "गुड़िया", "doll", "noun"], DONE,
          ["swing", "झूला", "swing", "noun"], ["music", "गाना", "music", "noun"], ["book", "किताब", "read_book_,_to", "noun"], ["outside", "बाहर", "outside", "describe"], ["my turn", "मेरी बारी", null, "social"], ["play", "खेलना", "play_,_to", "verb"]
        ]
      },
      {
        key: "feelings",
        name: { en: "Feelings", hi: "भावनाएँ" },
        cells: [
          ["happy", "खुश", "happy_man", "describe"], ["sad", "उदास", "sad_man", "describe"], ["angry", "गुस्सा", "angry_man", "describe"], MORE, ["scared", "डर", "afraid_man", "describe"], DONE,
          ["tired", "थका", null, "describe"], ["hurts", "दर्द", null, "describe"], ["funny", "मज़ेदार", "funny_laugh", "describe"], ["help", "मदद", "help_,_to", "verb"]
        ]
      },
      {
        key: "people",
        name: { en: "People", hi: "लोग" },
        cells: [
          ["Mummy", "मम्मी", "mum_parent", "pronoun"], ["Papa", "पापा", "dad_parent", "pronoun"], ["brother", "भाई", "brother", "pronoun"], MORE, ["sister", "बहन", "sister", "pronoun"], DONE,
          ["Grandma", "दादी", "grandmother", "pronoun"], ["teacher", "टीचर", "teacher_1a", "pronoun"], ["I", "मैं", "I", "pronoun"], ["you", "तुम", null, "pronoun"]
        ]
      }
    ]
  },
  // A tiny starter board for a child brand-new to AAC: four high-use words, same place every time.
  {
    key: "first-four",
    name: { en: "First four (2x2)", hi: "पहले चार (2x2)" },
    rows: 2,
    cols: 2,
    pages: [
      {
        key: "home",
        name: { en: "Home", hi: "होम" },
        cells: [MORE, ["help", "मदद", "help_,_to", "verb"], ["stop", "रुको", "traffic_lights", "verb"], DONE]
      }
    ]
  },
  {
    key: "mealtime",
    name: { en: "Mealtime (3x4)", hi: "खाने का समय (3x4)" },
    rows: 3,
    cols: 4,
    pages: [
      {
        key: "home",
        name: { en: "Home", hi: "होम" },
        cells: [
          ["eat", "खाना", "eat_,_to", "verb"], ["drink", "पीना", "drink_,_to", "verb"], MORE, DONE,
          ["hungry", "भूख", "hungry", "describe"], ["thirsty", "प्यास", "thirsty", "describe"], ["hot", "गरम", "hot", "describe"], ["help", "मदद", "help_,_to", "verb"],
          ["water", "पानी", "water", "noun"], ["milk", "दूध", "milk", "noun"], ["rice", "चावल", "rice", "noun"], ["spoon", "चम्मच", "spoon", "noun"]
        ]
      }
    ]
  },
  {
    key: "play",
    name: { en: "Play (3x4)", hi: "खेल (3x4)" },
    rows: 3,
    cols: 4,
    pages: [
      {
        key: "home",
        name: { en: "Home", hi: "होम" },
        cells: [
          ["play", "खेलना", "play_,_to", "verb"], ["more", "और", "more", "describe"], ["my turn", "मेरी बारी", "star", "social"], DONE,
          ["your turn", "तुम्हारी बारी", null, "social"], ["help", "मदद", "help_,_to", "verb"], ["stop", "रुको", "traffic_lights", "verb"], ["share", "साथ में", "share_,_to", "verb"],
          ["ball", "गेंद", "ball", "noun"], ["car", "गाड़ी", "toy_car", "noun"], ["doll", "गुड़िया", "doll", "noun"], ["book", "किताब", "read_book_,_to", "noun"]
        ]
      }
    ]
  },
  {
    key: "feelings",
    name: { en: "Feelings (3x4)", hi: "भावनाएँ (3x4)" },
    rows: 3,
    cols: 4,
    pages: [
      {
        key: "home",
        name: { en: "Home", hi: "होम" },
        cells: [
          ["happy", "खुश", "happy_man", "describe"], ["sad", "उदास", "sad_man", "describe"], ["angry", "गुस्सा", "angry_man", "describe"], ["scared", "डर", "afraid_man", "describe"],
          ["tired", "थका", null, "describe"], ["hurts", "दर्द", null, "describe"], ["funny", "मज़ेदार", "funny_laugh", "describe"], ["excited", "उत्साहित", "excited_man", "describe"],
          ["I", "मैं", "I", "pronoun"], ["help", "मदद", "help_,_to", "verb"], ["hug", "झप्पी", "hug_,_to", "verb"], DONE
        ]
      }
    ]
  },
  {
    key: "outing",
    name: { en: "Out and about (3x4)", hi: "बाहर जाना (3x4)" },
    rows: 3,
    cols: 4,
    pages: [
      {
        key: "home",
        name: { en: "Home", hi: "होम" },
        cells: [
          ["go", "चलो", "go_,_to", "verb"], ["stop", "रुको", "traffic_lights", "verb"], MORE, DONE,
          ["car", "गाड़ी", "car", "noun"], ["bus", "बस", "bus", "noun"], ["auto", "ऑटो", null, "noun"], ["park", "पार्क", "park_,_to", "noun"],
          ["shop", "दुकान", "shop", "noun"], ["home", "घर", "house", "noun"], ["toilet", "टॉयलेट", "toilet_,_go_to_the", "noun"], ["help", "मदद", "help_,_to", "verb"]
        ]
      }
    ]
  },
  {
    key: "bedtime",
    name: { en: "Bedtime (3x3)", hi: "सोने का समय (3x3)" },
    rows: 3,
    cols: 3,
    pages: [
      {
        key: "home",
        name: { en: "Home", hi: "होम" },
        cells: [
          ["brush teeth", "ब्रश", "brush_teeth_,_to", "verb"], ["pyjamas", "नाइट सूट", "pyjamas", "noun"], ["book", "किताब", "read_book_,_to", "noun"],
          ["water", "पानी", "water", "noun"], ["song", "गाना", "music", "noun"], ["hug", "झप्पी", "hug_,_to", "verb"],
          ["light off", "लाइट बंद", "turn_off_light_switch_,_to", "verb"], ["bed", "बिस्तर", "bed_time", "noun"], DONE
        ]
      }
    ]
  },
  {
    key: "school-16",
    name: { en: "School / class (4x4)", hi: "स्कूल / क्लास (4x4)" },
    rows: 4,
    cols: 4,
    pages: [
      {
        key: "home",
        name: { en: "Home", hi: "होम" },
        cells: [
          ["I", "मैं", "I", "pronoun"], ["help", "मदद", "help_,_to", "verb"], ["toilet", "टॉयलेट", "toilet_,_go_to_the", "noun"], ["water", "पानी", "water", "noun"],
          ["break", "ब्रेक", "break_time_1", "noun"], ["snack", "नाश्ता", "biscuits", "noun"], ["more", "और", "more", "describe"], DONE,
          ["teacher", "टीचर", "teacher_1a", "pronoun"], ["friend", "दोस्त", null, "pronoun"], ["pencil", "पेंसिल", "pencil", "noun"], ["book", "किताब", "read_book_,_to", "noun"],
          ["I don't understand", "समझ नहीं आया", "confused_man", "social"], ["my turn", "मेरी बारी", "star", "social"], ["listen", "सुनो", null, "verb"], ["music", "गाना", "music", "noun"]
        ]
      }
    ]
  },
  // "First Words Together" Pranav-style core: a 4-column home with four sub-pages (actions, feelings, body, food).
  // Modelled on Pranav Roy's own Proloquo2Go layout; "more" and "all done" pinned top-right on every page.
  {
    key: "words-together",
    name: { en: "Words Together (4x3 with sub-pages)", hi: "शब्द मिलकर (4x3, सब-पेज के साथ)" },
    rows: 3,
    cols: 4,
    pages: [
      {
        key: "home",
        name: { en: "Home", hi: "होम" },
        cells: [
          ["I", "मैं", "I", "pronoun"], ["you", "तुम", null, "pronoun"], ["want", "चाहिए", "want_,_to", "verb"], MORE,
          ["not", "नहीं", "cross", "describe"], ["help", "मदद", "help_,_to", "verb"], ["go", "चलो", "go_,_to", "verb"], DONE,
          ["Actions", "कर्म", "run_,_to", "folder", "actions"], ["Feelings", "भावनाएँ", "happy_man", "folder", "feelings"], ["Body", "शरीर", "body_outline", "folder", "body"], ["Food", "खाना-पीना", "eat_,_to", "folder", "food"]
        ]
      },
      {
        key: "actions",
        name: { en: "Actions", hi: "कर्म" },
        cells: [
          ["eat", "खाना", "eat_,_to", "verb"], ["drink", "पीना", "drink_,_to", "verb"], ["play", "खेलना", "play_,_to", "verb"], MORE,
          ["run", "दौड़ो", "run_,_to", "verb"], ["jump", "कूदो", "jump_,_to", "verb"], ["sleep", "सोना", "sleep_male_,_to", "verb"], DONE,
          ["dance", "नाचो", "dance_,_to", "verb"], ["read", "पढ़ो", "read_book_,_to", "verb"], ["write", "लिखो", "write_,_to", "verb"], ["sing", "गाओ", "sing_,_to", "verb"]
        ]
      },
      {
        key: "feelings",
        name: { en: "Feelings", hi: "भावनाएँ" },
        cells: [
          ["happy", "खुश", "happy_man", "describe"], ["sad", "उदास", "sad_man", "describe"], ["angry", "गुस्सा", "angry_man", "describe"], MORE,
          ["scared", "डर", "afraid_man", "describe"], ["love", "प्यार", "heart", "describe"], ["like", "अच्छा लगा", "thumbs", "describe"], DONE,
          ["bored", "बोर", null, "describe"], ["excited", "उत्साहित", "excited_man", "describe"], ["funny", "मज़ेदार", "funny_laugh", "describe"], ["tired", "थका", null, "describe"]
        ]
      },
      {
        key: "body",
        name: { en: "Body", hi: "शरीर" },
        cells: [
          ["head", "सिर", "head", "noun"], ["ear", "कान", "ear", "noun"], ["eye", "आँख", "eye", "noun"], MORE,
          ["mouth", "मुँह", "mouth", "noun"], ["hand", "हाथ", "clean_hands", "noun"], ["stomach", "पेट", "stomach", "noun"], DONE,
          ["shoulder", "कंधा", "shoulder", "noun"], ["foot", "पैर", "foot", "noun"], ["leg", "टांग", "leg", "noun"], ["arm", "बाँह", "arm", "noun"]
        ]
      },
      {
        key: "food",
        name: { en: "Food", hi: "खाना-पीना" },
        cells: [
          ["milk", "दूध", "milk", "noun"], ["water", "पानी", "water", "noun"], ["rice", "चावल", "rice", "noun"], MORE,
          ["bread", "ब्रेड", "bread", "noun"], ["chapati", "रोटी", "bread", "noun"], ["apple", "सेब", "apple", "noun"], DONE,
          ["banana", "केला", "banana", "noun"], ["biscuit", "बिस्कुट", "biscuits", "noun"], ["egg", "अंडा", "egg", "noun"], ["juice", "जूस", "apple_juice", "noun"]
        ]
      }
    ]
  },
  // Topic sub-boards. Small, single-page, reusable. Match the "pin more/done top-right" habit.
  {
    key: "order-words",
    name: { en: "Order words (3x3)", hi: "क्रम के शब्द (3x3)" },
    rows: 3,
    cols: 3,
    pages: [
      {
        key: "home",
        name: { en: "Home", hi: "होम" },
        cells: [
          ["before", "पहले", "before", "describe"], ["next", "अगला", "next", "describe"], ["after", "बाद में", "after", "describe"],
          ["beginning", "शुरू", "begin_start", "describe"], ["middle", "बीच", "middle", "describe"], ["end", "अंत", "finish", "describe"],
          ["first", "पहला", "first", "describe"], ["last", "आखिरी", "last", "describe"], ["close", "बंद", "close_,_to", "describe"]
        ]
      }
    ]
  },
  {
    key: "prepositions",
    name: { en: "Prepositions (3x3)", hi: "सम्बन्धबोधक (3x3)" },
    rows: 3,
    cols: 3,
    pages: [
      {
        key: "home",
        name: { en: "Home", hi: "होम" },
        cells: [
          ["in", "अंदर", "in", "describe"], ["on", "ऊपर", "on", "describe"], ["under", "नीचे", "under_1", "describe"],
          ["over", "ऊपर से", "over", "describe"], ["between", "बीच में", "between", "describe"], ["near", "पास", "near", "describe"],
          ["behind", "पीछे", "behind", "describe"], ["in front", "सामने", null, "describe"], ["beside", "बग़ल में", null, "describe"]
        ]
      }
    ]
  },
  {
    key: "wh-questions",
    name: { en: "Wh- questions (3x3)", hi: "प्रश्न शब्द (3x3)" },
    rows: 3,
    cols: 3,
    pages: [
      {
        key: "home",
        name: { en: "Home", hi: "होम" },
        cells: [
          ["who", "कौन", "who", "question"], ["what", "क्या", "what", "question"], MORE,
          ["where", "कहाँ", "where", "question"], ["when", "कब", "when", "question"], DONE,
          ["why", "क्यों", "why", "question"], ["how", "कैसे", "how", "question"], ["how many", "कितने", "how_many", "question"]
        ]
      }
    ]
  },
  {
    key: "action-verbs",
    name: { en: "Action verbs (3x3)", hi: "क्रिया शब्द (3x3)" },
    rows: 3,
    cols: 3,
    pages: [
      {
        key: "home",
        name: { en: "Home", hi: "होम" },
        cells: [
          ["eat", "खाना", "eat_,_to", "verb"], ["drink", "पीना", "drink_,_to", "verb"], MORE,
          ["run", "दौड़ो", "run_,_to", "verb"], ["jump", "कूदो", "jump_,_to", "verb"], DONE,
          ["sleep", "सोना", "sleep_male_,_to", "verb"], ["dance", "नाचो", "dance_,_to", "verb"], ["play", "खेलना", "play_,_to", "verb"]
        ]
      }
    ]
  },
  {
    key: "body-full",
    name: { en: "Body parts (3x3)", hi: "शरीर के अंग (3x3)" },
    rows: 3,
    cols: 3,
    pages: [
      {
        key: "home",
        name: { en: "Home", hi: "होम" },
        cells: [
          ["head", "सिर", "head", "noun"], ["ear", "कान", "ear", "noun"], ["mouth", "मुँह", "mouth", "noun"],
          ["eye", "आँख", "eye", "noun"], ["nose", "नाक", null, "noun"], ["hand", "हाथ", "clean_hands", "noun"],
          ["stomach", "पेट", "stomach", "noun"], ["foot", "पैर", "foot", "noun"], ["back", "पीठ", "back", "noun"]
        ]
      }
    ]
  },
  {
    key: "feelings-full",
    name: { en: "Feelings (3x3)", hi: "भावनाएँ (3x3)" },
    rows: 3,
    cols: 3,
    pages: [
      {
        key: "home",
        name: { en: "Home", hi: "होम" },
        cells: [
          ["happy", "खुश", "happy_man", "describe"], ["sad", "उदास", "sad_man", "describe"], ["angry", "गुस्सा", "angry_man", "describe"],
          ["scared", "डर", "afraid_man", "describe"], ["love", "प्यार", "heart", "describe"], ["like", "अच्छा लगा", "thumbs", "describe"],
          ["bored", "बोर", null, "describe"], ["excited", "उत्साहित", "excited_man", "describe"], ["funny", "मज़ेदार", "funny_laugh", "describe"]
        ]
      }
    ]
  },
  {
    key: "clothes",
    name: { en: "Clothes (3x3)", hi: "कपड़े (3x3)" },
    rows: 3,
    cols: 3,
    pages: [
      {
        key: "home",
        name: { en: "Home", hi: "होम" },
        cells: [
          ["t-shirt", "टी-शर्ट", "t-shirt", "noun"], ["pants", "पैंट", "pants", "noun"], MORE,
          ["jumper", "स्वेटर", "jumper", "noun"], ["jacket", "जैकेट", "jacket", "noun"], DONE,
          ["shoes", "जूते", "trainers", "noun"], ["socks", "मोज़े", "socks", "noun"], ["cap", "टोपी", "cap", "noun"]
        ]
      }
    ]
  },
  {
    key: "currency-india",
    name: { en: "Indian currency (2x3)", hi: "भारतीय मुद्रा (2x3)" },
    rows: 2,
    cols: 3,
    pages: [
      {
        key: "home",
        name: { en: "Home", hi: "होम" },
        cells: [
          ["10 rupees", "10 रुपये", "money", "noun"], ["20 rupees", "20 रुपये", "money", "noun"], ["50 rupees", "50 रुपये", "money", "noun"],
          ["100 rupees", "100 रुपये", "money", "noun"], ["200 rupees", "200 रुपये", "money", "noun"], ["500 rupees", "500 रुपये", "money", "noun"]
        ]
      }
    ]
  },
  {
    key: "safe-dangerous",
    name: { en: "Safe / dangerous (2x2)", hi: "सुरक्षित / ख़तरनाक (2x2)" },
    rows: 2,
    cols: 2,
    pages: [
      {
        key: "home",
        name: { en: "Home", hi: "होम" },
        cells: [
          ["safe", "सुरक्षित", "thumbs", "describe"], ["dangerous", "ख़तरनाक", "sharp", "describe"],
          ["don't touch", "मत छुओ", "cross", "verb"], ["I'm not sure", "मुझे पता नहीं", null, "social"]
        ]
      }
    ]
  },
  {
    key: "public-private",
    name: { en: "Public / private (2x2)", hi: "सार्वजनिक / निजी (2x2)" },
    rows: 2,
    cols: 2,
    pages: [
      {
        key: "home",
        name: { en: "Home", hi: "होम" },
        cells: [
          ["public place", "सार्वजनिक जगह", null, "noun"], ["private place", "निजी जगह", null, "noun"],
          ["at home", "घर पर", "house", "noun"], ["at school", "स्कूल में", "school", "noun"]
        ]
      }
    ]
  },
  {
    key: "social-questions",
    name: { en: "Social questions (2x2)", hi: "सामाजिक प्रश्न (2x2)" },
    rows: 2,
    cols: 2,
    pages: [
      {
        key: "home",
        name: { en: "Home", hi: "होम" },
        cells: [
          ["Who are you?", "आप कौन हैं?", null, "question"], ["What's your name?", "तुम्हारा नाम क्या है?", null, "question"],
          ["Where do you live?", "कहाँ रहते हो?", null, "question"], ["How are you?", "कैसे हो?", null, "question"]
        ]
      }
    ]
  }
];

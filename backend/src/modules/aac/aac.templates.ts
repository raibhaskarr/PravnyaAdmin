// The AAC boards Pravnya ships with (English and Hindi). Created once in the database as Pravnya
// templates (see aacTemplates.service.ts); a superadmin can change or hide them after that.
// Pictures are Mulberry symbol ids, checked by aac.integration.test.ts; null where Mulberry has
// no symbol (shown as a coloured word; anyone can add a picture or photo).

type W = "pronoun" | "verb" | "describe" | "noun" | "social" | "question" | "misc";
/** [en, hi, symbol, word class] or a folder: [en, hi, symbol, "folder", page key]. */
type Spec = [string, string, string | null, W] | [string, string, string | null, "folder", string];

export type BuiltInBoard = { key: string; name: { en: string; hi: string }; rows: number; cols: number; pages: { key: string; name: { en: string; hi: string }; cells: (Spec | null)[] }[] };

// "arasaac:5508" and "all done" sit in the same squares on every page, so the child finds them by habit.
const MORE: Spec = ["arasaac:5508", "और", "arasaac:5508", "describe"];
const DONE: Spec = ["all done", "हो गया", "arasaac:5358", "social"];

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
        cells: [MORE, DONE, ["help", "मदद", "arasaac:32648", "verb"], ["eat", "खाना", "arasaac:6456", "verb"], ["drink", "पीना", "arasaac:4575", "verb"], ["play", "खेलना", "arasaac:6537", "verb"]]
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
          ["arasaac:6632", "मैं", "arasaac:6632", "pronoun"], ["you", "तुम", null, "pronoun"], ["want", "चाहिए", "arasaac:5441", "verb"], MORE, ["help", "मदद", "arasaac:32648", "verb"], DONE,
          ["go", "चलो", "arasaac:8142", "verb"], ["stop", "रुको", null, "verb"], ["eat", "खाना", "arasaac:6456", "verb"], ["drink", "पीना", "arasaac:4575", "verb"], ["play", "खेलना", "arasaac:6537", "verb"], ["look", "देखो", "arasaac:6564", "verb"],
          ["yes", "हाँ", null, "social"], ["no", "नहीं", null, "social"], ["open", "खोलो", "arasaac:24825", "verb"], ["arasaac:5388", "ऊपर", "arasaac:5388", "describe"], ["arasaac:5355", "नीचे", "arasaac:5355", "describe"], ["arasaac:4581", "अच्छा", "arasaac:4581", "describe"],
          ["arasaac:22620", "क्या", "arasaac:22620", "question"], ["arasaac:7764", "कहाँ", "arasaac:7764", "question"], ["Food", "खाना-पीना", "arasaac:4610", "folder", "arasaac:4610"], ["Toys", "खिलौने", "arasaac:9813", "folder", "arasaac:9813"], ["Feelings", "भावनाएँ", "arasaac:35533", "folder", "feelings"], ["People", "लोग", "arasaac:2392", "folder", "people"]
        ]
      },
      {
        key: "arasaac:4610",
        name: { en: "Food", hi: "खाना-पीना" },
        cells: [
          ["arasaac:2462", "सेब", "arasaac:2462", "noun"], ["arasaac:2530", "केला", "arasaac:2530", "noun"], ["biscuit", "बिस्कुट", "arasaac:2402", "noun"], MORE, ["arasaac:6911", "चावल", "arasaac:6911", "noun"], DONE,
          ["arasaac:2494", "रोटी", "arasaac:2494", "noun"], ["arasaac:2445", "दूध", "arasaac:2445", "noun"], ["arasaac:2816", "पानी", "arasaac:2816", "noun"], ["juice", "जूस", "arasaac:11403", "noun"], ["arasaac:2300", "गरम", "arasaac:2300", "describe"], ["eat", "खाना", "arasaac:6456", "verb"]
        ]
      },
      {
        key: "arasaac:9813",
        name: { en: "Toys", hi: "खिलौने" },
        cells: [
          ["arasaac:3241", "गेंद", "arasaac:3241", "noun"], ["arasaac:2339", "गाड़ी", "arasaac:2340", "noun"], ["arasaac:6945", "बुलबुले", "arasaac:6945", "noun"], MORE, ["arasaac:26238", "गुड़िया", "arasaac:26238", "noun"], DONE,
          ["arasaac:4608", "झूला", "arasaac:4608", "noun"], ["arasaac:24791", "गाना", "arasaac:24791", "noun"], ["book", "किताब", "arasaac:7141", "noun"], ["arasaac:5475", "बाहर", "arasaac:5475", "describe"], ["my turn", "मेरी बारी", null, "social"], ["play", "खेलना", "arasaac:6537", "verb"]
        ]
      },
      {
        key: "feelings",
        name: { en: "Feelings", hi: "भावनाएँ" },
        cells: [
          ["happy", "खुश", "arasaac:35533", "describe"], ["sad", "उदास", "arasaac:35545", "describe"], ["angry", "गुस्सा", "arasaac:35539", "describe"], MORE, ["scared", "डर", "arasaac:35535", "describe"], DONE,
          ["tired", "थका", null, "describe"], ["hurts", "दर्द", null, "describe"], ["funny", "मज़ेदार", "arasaac:8593", "describe"], ["help", "मदद", "arasaac:32648", "verb"]
        ]
      },
      {
        key: "people",
        name: { en: "People", hi: "लोग" },
        cells: [
          ["Mummy", "मम्मी", "arasaac:2458", "pronoun"], ["Papa", "पापा", "arasaac:2497", "pronoun"], ["arasaac:2423", "भाई", "arasaac:2423", "pronoun"], MORE, ["arasaac:2422", "बहन", "arasaac:2422", "pronoun"], DONE,
          ["Grandma", "दादी", "arasaac:23710", "pronoun"], ["teacher", "टीचर", "arasaac:2457", "pronoun"], ["arasaac:6632", "मैं", "arasaac:6632", "pronoun"], ["you", "तुम", null, "pronoun"]
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
        cells: [MORE, ["help", "मदद", "arasaac:32648", "verb"], ["stop", "रुको", "arasaac:2567", "verb"], DONE]
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
          ["eat", "खाना", "arasaac:6456", "verb"], ["drink", "पीना", "arasaac:4575", "verb"], MORE, DONE,
          ["arasaac:4962", "भूख", "arasaac:4962", "describe"], ["arasaac:4963", "प्यास", "arasaac:4963", "describe"], ["arasaac:2300", "गरम", "arasaac:2300", "describe"], ["help", "मदद", "arasaac:32648", "verb"],
          ["arasaac:2816", "पानी", "arasaac:2816", "noun"], ["arasaac:2445", "दूध", "arasaac:2445", "noun"], ["arasaac:6911", "चावल", "arasaac:6911", "noun"], ["arasaac:2362", "चम्मच", "arasaac:2362", "noun"]
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
          ["play", "खेलना", "arasaac:6537", "verb"], ["arasaac:5508", "और", "arasaac:5508", "describe"], ["my turn", "मेरी बारी", "arasaac:2752", "social"], DONE,
          ["your turn", "तुम्हारी बारी", null, "social"], ["help", "मदद", "arasaac:32648", "verb"], ["stop", "रुको", "arasaac:2567", "verb"], ["share", "साथ में", "arasaac:38900", "verb"],
          ["arasaac:3241", "गेंद", "arasaac:3241", "noun"], ["arasaac:2339", "गाड़ी", "arasaac:2340", "noun"], ["arasaac:26238", "गुड़िया", "arasaac:26238", "noun"], ["book", "किताब", "arasaac:7141", "noun"]
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
          ["happy", "खुश", "arasaac:35533", "describe"], ["sad", "उदास", "arasaac:35545", "describe"], ["angry", "गुस्सा", "arasaac:35539", "describe"], ["scared", "डर", "arasaac:35535", "describe"],
          ["tired", "थका", null, "describe"], ["hurts", "दर्द", null, "describe"], ["funny", "मज़ेदार", "arasaac:8593", "describe"], ["excited", "उत्साहित", "arasaac:39090", "describe"],
          ["arasaac:6632", "मैं", "arasaac:6632", "pronoun"], ["help", "मदद", "arasaac:32648", "verb"], ["hug", "झप्पी", "arasaac:4550", "verb"], DONE
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
          ["go", "चलो", "arasaac:8142", "verb"], ["stop", "रुको", "arasaac:2567", "verb"], MORE, DONE,
          ["arasaac:2339", "गाड़ी", "arasaac:2339", "noun"], ["arasaac:2262", "बस", "arasaac:2262", "noun"], ["auto", "ऑटो", null, "noun"], ["park", "पार्क", "arasaac:5379", "noun"],
          ["arasaac:8986", "दुकान", "arasaac:8986", "noun"], ["home", "घर", "arasaac:6964", "noun"], ["arasaac:5921", "टॉयलेट", "arasaac:5921", "noun"], ["help", "मदद", "arasaac:32648", "verb"]
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
          ["brush teeth", "ब्रश", "arasaac:2326", "verb"], ["arasaac:2522", "नाइट सूट", "arasaac:2522", "noun"], ["book", "किताब", "arasaac:7141", "noun"],
          ["arasaac:2816", "पानी", "arasaac:2816", "noun"], ["song", "गाना", "arasaac:24791", "noun"], ["hug", "झप्पी", "arasaac:4550", "verb"],
          ["light off", "लाइट बंद", "arasaac:8619", "verb"], ["bed", "बिस्तर", "arasaac:25900", "noun"], DONE
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
          ["arasaac:6632", "मैं", "arasaac:6632", "pronoun"], ["help", "मदद", "arasaac:32648", "verb"], ["arasaac:5921", "टॉयलेट", "arasaac:5921", "noun"], ["arasaac:2816", "पानी", "arasaac:2816", "noun"],
          ["break", "ब्रेक", "arasaac:6604", "noun"], ["snack", "नाश्ता", "arasaac:2402", "noun"], ["arasaac:5508", "और", "arasaac:5508", "describe"], DONE,
          ["teacher", "टीचर", "arasaac:2457", "pronoun"], ["friend", "दोस्त", null, "pronoun"], ["arasaac:2440", "पेंसिल", "arasaac:2440", "noun"], ["book", "किताब", "arasaac:7141", "noun"],
          ["I don't understand", "समझ नहीं आया", "arasaac:2352", "social"], ["my turn", "मेरी बारी", "arasaac:2752", "social"], ["listen", "सुनो", null, "verb"], ["arasaac:24791", "गाना", "arasaac:24791", "noun"]
        ]
      }
    ]
  },
  // "First Words Together" Pranav-style core: a 4-column home with four sub-pages (actions, feelings, body, food).
  // Modelled on Pranav Roy's own Proloquo2Go layout; "arasaac:5508" and "all done" pinned top-right on every page.
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
          ["arasaac:6632", "मैं", "arasaac:6632", "pronoun"], ["you", "तुम", null, "pronoun"], ["want", "चाहिए", "arasaac:5441", "verb"], MORE,
          ["not", "नहीं", "arasaac:5976", "describe"], ["help", "मदद", "arasaac:32648", "verb"], ["go", "चलो", "arasaac:8142", "verb"], DONE,
          ["Actions", "कर्म", "arasaac:6465", "folder", "actions"], ["Feelings", "भावनाएँ", "arasaac:35533", "folder", "feelings"], ["Body", "शरीर", "arasaac:6473", "folder", "body"], ["Food", "खाना-पीना", "arasaac:6456", "folder", "arasaac:4610"]
        ]
      },
      {
        key: "actions",
        name: { en: "Actions", hi: "कर्म" },
        cells: [
          ["eat", "खाना", "arasaac:6456", "verb"], ["drink", "पीना", "arasaac:4575", "verb"], ["play", "खेलना", "arasaac:6537", "verb"], MORE,
          ["run", "दौड़ो", "arasaac:6465", "verb"], ["jump", "कूदो", "arasaac:6607", "verb"], ["sleep", "सोना", "arasaac:6479", "verb"], DONE,
          ["dance", "नाचो", "arasaac:6052", "verb"], ["read", "पढ़ो", "arasaac:7141", "verb"], ["write", "लिखो", "arasaac:2380", "verb"], ["sing", "गाओ", "arasaac:6960", "verb"]
        ]
      },
      {
        key: "feelings",
        name: { en: "Feelings", hi: "भावनाएँ" },
        cells: [
          ["happy", "खुश", "arasaac:35533", "describe"], ["sad", "उदास", "arasaac:35545", "describe"], ["angry", "गुस्सा", "arasaac:35539", "describe"], MORE,
          ["scared", "डर", "arasaac:35535", "describe"], ["love", "प्यार", "arasaac:4613", "describe"], ["like", "अच्छा लगा", "arasaac:7799", "describe"], DONE,
          ["bored", "बोर", null, "describe"], ["excited", "उत्साहित", "arasaac:39090", "describe"], ["funny", "मज़ेदार", "arasaac:8593", "describe"], ["tired", "थका", null, "describe"]
        ]
      },
      {
        key: "body",
        name: { en: "Body", hi: "शरीर" },
        cells: [
          ["arasaac:2673", "सिर", "arasaac:2673", "noun"], ["arasaac:2871", "कान", "arasaac:2871", "noun"], ["arasaac:6573", "आँख", "arasaac:6573", "noun"], MORE,
          ["arasaac:2663", "मुँह", "arasaac:2663", "noun"], ["hand", "हाथ", "arasaac:3351", "noun"], ["arasaac:2786", "पेट", "arasaac:2786", "noun"], DONE,
          ["arasaac:2977", "कंधा", "arasaac:2977", "noun"], ["arasaac:25327", "पैर", "arasaac:25327", "noun"], ["arasaac:8666", "टांग", "arasaac:8666", "noun"], ["arasaac:2669", "बाँह", "arasaac:2669", "noun"]
        ]
      },
      {
        key: "arasaac:4610",
        name: { en: "Food", hi: "खाना-पीना" },
        cells: [
          ["arasaac:2445", "दूध", "arasaac:2445", "noun"], ["arasaac:2816", "पानी", "arasaac:2816", "noun"], ["arasaac:6911", "चावल", "arasaac:6911", "noun"], MORE,
          ["arasaac:2494", "ब्रेड", "arasaac:2494", "noun"], ["chapati", "रोटी", "arasaac:2494", "noun"], ["arasaac:2462", "सेब", "arasaac:2462", "noun"], DONE,
          ["arasaac:2530", "केला", "arasaac:2530", "noun"], ["biscuit", "बिस्कुट", "arasaac:2402", "noun"], ["arasaac:2427", "अंडा", "arasaac:2427", "noun"], ["juice", "जूस", "arasaac:11403", "noun"]
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
          ["arasaac:7044", "पहले", "arasaac:7044", "describe"], ["arasaac:27331", "अगला", "arasaac:27331", "describe"], ["arasaac:32749", "बाद में", "arasaac:32749", "describe"],
          ["beginning", "शुरू", "arasaac:5431", "describe"], ["arasaac:5449", "बीच", "arasaac:5449", "describe"], ["end", "अंत", "arasaac:5358", "describe"],
          ["arasaac:32129", "पहला", "arasaac:32129", "describe"], ["arasaac:4765", "आखिरी", "arasaac:4765", "describe"], ["close", "बंद", "arasaac:24976", "describe"]
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
          ["arasaac:7034", "अंदर", "arasaac:7034", "describe"], ["arasaac:7814", "ऊपर", "arasaac:7814", "describe"], ["under", "नीचे", "under_1", "describe"],
          ["arasaac:7814", "ऊपर से", "arasaac:7814", "describe"], ["arasaac:7765", "बीच में", "arasaac:7765", "describe"], ["arasaac:30383", "पास", "arasaac:30383", "describe"],
          ["arasaac:7818", "पीछे", "arasaac:7818", "describe"], ["in front", "सामने", null, "describe"], ["beside", "बग़ल में", null, "describe"]
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
          ["arasaac:9853", "कौन", "arasaac:9853", "question"], ["arasaac:22620", "क्या", "arasaac:22620", "question"], MORE,
          ["arasaac:7764", "कहाँ", "arasaac:7764", "question"], ["arasaac:32874", "कब", "arasaac:32874", "question"], DONE,
          ["arasaac:36719", "क्यों", "arasaac:36719", "question"], ["arasaac:22619", "कैसे", "arasaac:22619", "question"], ["how many", "कितने", "arasaac:24731", "question"]
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
          ["eat", "खाना", "arasaac:6456", "verb"], ["drink", "पीना", "arasaac:4575", "verb"], MORE,
          ["run", "दौड़ो", "arasaac:6465", "verb"], ["jump", "कूदो", "arasaac:6607", "verb"], DONE,
          ["sleep", "सोना", "arasaac:6479", "verb"], ["dance", "नाचो", "arasaac:6052", "verb"], ["play", "खेलना", "arasaac:6537", "verb"]
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
          ["arasaac:2673", "सिर", "arasaac:2673", "noun"], ["arasaac:2871", "कान", "arasaac:2871", "noun"], ["arasaac:2663", "मुँह", "arasaac:2663", "noun"],
          ["arasaac:6573", "आँख", "arasaac:6573", "noun"], ["nose", "नाक", null, "noun"], ["hand", "हाथ", "arasaac:3351", "noun"],
          ["arasaac:2786", "पेट", "arasaac:2786", "noun"], ["arasaac:25327", "पैर", "arasaac:25327", "noun"], ["arasaac:2748", "पीठ", "arasaac:2748", "noun"]
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
          ["happy", "खुश", "arasaac:35533", "describe"], ["sad", "उदास", "arasaac:35545", "describe"], ["angry", "गुस्सा", "arasaac:35539", "describe"],
          ["scared", "डर", "arasaac:35535", "describe"], ["love", "प्यार", "arasaac:4613", "describe"], ["like", "अच्छा लगा", "arasaac:7799", "describe"],
          ["bored", "बोर", null, "describe"], ["excited", "उत्साहित", "arasaac:39090", "describe"], ["funny", "मज़ेदार", "arasaac:8593", "describe"]
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
          ["arasaac:2309", "टी-शर्ट", "arasaac:2309", "noun"], ["arasaac:2565", "पैंट", "arasaac:2565", "noun"], MORE,
          ["arasaac:2436", "स्वेटर", "arasaac:2436", "noun"], ["arasaac:4872", "जैकेट", "arasaac:4872", "noun"], DONE,
          ["shoes", "जूते", "arasaac:5991", "noun"], ["arasaac:2298", "मोज़े", "arasaac:2298", "noun"], ["arasaac:2412", "टोपी", "arasaac:2412", "noun"]
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
          ["10 rupees", "10 रुपये", "arasaac:4630", "noun"], ["20 rupees", "20 रुपये", "arasaac:4630", "noun"], ["50 rupees", "50 रुपये", "arasaac:4630", "noun"],
          ["100 rupees", "100 रुपये", "arasaac:4630", "noun"], ["200 rupees", "200 रुपये", "arasaac:4630", "noun"], ["500 rupees", "500 रुपये", "arasaac:4630", "noun"]
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
          ["safe", "सुरक्षित", "arasaac:7799", "describe"], ["dangerous", "ख़तरनाक", "arasaac:5362", "describe"],
          ["don't touch", "मत छुओ", "arasaac:5976", "verb"], ["I'm not sure", "मुझे पता नहीं", null, "social"]
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
          ["at home", "घर पर", "arasaac:6964", "noun"], ["at school", "स्कूल में", "arasaac:32446", "noun"]
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

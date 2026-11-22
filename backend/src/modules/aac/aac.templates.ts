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
  }
];

// Inflect an English word for a grammar affix tapped after it. Covers the four markers Proloquo2Go
// and other AAC systems expose on starter boards: +ed (past), +ing (present participle), +s
// (plural / 3rd-person), 's (possessive). Deliberately English-only; Hindi grammar is a separate
// future piece.
//
// How it chooses a form:
//   1. Look up the word in the irregular table (over 60 common verbs + a handful of nouns like
//      child -> children). An exact match wins.
//   2. Otherwise apply the regular spelling rule: drop silent -e, double a final consonant after a
//      short vowel, -y after a consonant turns to -ied / -ies.
//
// Called from AacTalk when the user taps an affix cell: the last word in the sentence is replaced
// with the inflected form. Silent on empty input.

export type Affix = "ed" | "ing" | "s" | "'s";

/** Irregular verbs: [past, past participle, present participle, 3rd person singular]. */
const IRREGULARS: Record<string, [string, string, string, string]> = {
  "be":     ["was",      "been",     "being",     "is"],
  "have":   ["had",      "had",      "having",    "has"],
  "do":     ["did",      "done",     "doing",     "does"],
  "go":     ["went",     "gone",     "going",     "goes"],
  "say":    ["said",     "said",     "saying",    "says"],
  "see":    ["saw",      "seen",     "seeing",    "sees"],
  "come":   ["came",     "come",     "coming",    "comes"],
  "get":    ["got",      "got",      "getting",   "gets"],
  "give":   ["gave",     "given",    "giving",    "gives"],
  "make":   ["made",     "made",     "making",    "makes"],
  "take":   ["took",     "taken",    "taking",    "takes"],
  "find":   ["found",    "found",    "finding",   "finds"],
  "know":   ["knew",     "known",    "knowing",   "knows"],
  "think":  ["thought",  "thought",  "thinking",  "thinks"],
  "want":   ["wanted",   "wanted",   "wanting",   "wants"],
  "look":   ["looked",   "looked",   "looking",   "looks"],
  "run":    ["ran",      "run",      "running",   "runs"],
  "put":    ["put",      "put",      "putting",   "puts"],
  "sit":    ["sat",      "sat",      "sitting",   "sits"],
  "stand":  ["stood",    "stood",    "standing",  "stands"],
  "read":   ["read",     "read",     "reading",   "reads"],
  "write":  ["wrote",    "written",  "writing",   "writes"],
  "sleep":  ["slept",    "slept",    "sleeping",  "sleeps"],
  "wake":   ["woke",     "woken",    "waking",    "wakes"],
  "eat":    ["ate",      "eaten",    "eating",    "eats"],
  "drink":  ["drank",    "drunk",    "drinking",  "drinks"],
  "bring":  ["brought",  "brought",  "bringing",  "brings"],
  "buy":    ["bought",   "bought",   "buying",    "buys"],
  "catch":  ["caught",   "caught",   "catching",  "catches"],
  "teach":  ["taught",   "taught",   "teaching",  "teaches"],
  "fight":  ["fought",   "fought",   "fighting",  "fights"],
  "feel":   ["felt",     "felt",     "feeling",   "feels"],
  "keep":   ["kept",     "kept",     "keeping",   "keeps"],
  "leave":  ["left",     "left",     "leaving",   "leaves"],
  "lose":   ["lost",     "lost",     "losing",    "loses"],
  "mean":   ["meant",    "meant",    "meaning",   "means"],
  "meet":   ["met",      "met",      "meeting",   "meets"],
  "pay":    ["paid",     "paid",     "paying",    "pays"],
  "send":   ["sent",     "sent",     "sending",   "sends"],
  "spend":  ["spent",    "spent",    "spending",  "spends"],
  "swim":   ["swam",     "swum",     "swimming",  "swims"],
  "sing":   ["sang",     "sung",     "singing",   "sings"],
  "draw":   ["drew",     "drawn",    "drawing",   "draws"],
  "drive":  ["drove",    "driven",   "driving",   "drives"],
  "ride":   ["rode",     "ridden",   "riding",    "rides"],
  "fly":    ["flew",     "flown",    "flying",    "flies"],
  "break":  ["broke",    "broken",   "breaking",  "breaks"],
  "choose": ["chose",    "chosen",   "choosing",  "chooses"],
  "speak":  ["spoke",    "spoken",   "speaking",  "speaks"],
  "throw":  ["threw",    "thrown",   "throwing",  "throws"],
  "fall":   ["fell",     "fallen",   "falling",   "falls"],
  "cry":    ["cried",    "cried",    "crying",    "cries"],
  "play":   ["played",   "played",   "playing",   "plays"],
  "stay":   ["stayed",   "stayed",   "staying",   "stays"]
};
/** Irregular plurals. */
const IRREG_PLURAL: Record<string, string> = {
  "child":  "children",
  "foot":   "feet",
  "tooth":  "teeth",
  "man":    "men",
  "woman":  "women",
  "person": "people",
  "mouse":  "mice",
  "sheep":  "sheep",
  "fish":   "fish"
};

const VOWELS = /[aeiouAEIOU]/;
const CONS = /[^aeiouAEIOU]/;

/** -y after a consonant turns to -ie/-i (play -> played, cry -> cried). */
function endsConsonantY(w: string) {
  return w.length > 1 && w.endsWith("y") && CONS.test(w[w.length - 2]);
}
/** Short monosyllable with a single final consonant: double for +ed/+ing (hop -> hopped, sit -> sitting). */
function doublesFinalCons(w: string) {
  if (w.length < 3) return false;
  const [a, b, c] = [w[w.length - 3], w[w.length - 2], w[w.length - 1]];
  if (!CONS.test(a) || !VOWELS.test(b) || !CONS.test(c)) return false;
  // Don't double w, x, y, h, or final -y/-w (common pitfalls).
  if ("wxyh".includes(c)) return false;
  return true;
}

/** Keep the original casing of the first letter (Eat -> Ate, cup -> cups). */
function matchCase(src: string, out: string) {
  if (!src) return out;
  if (src[0] === src[0].toUpperCase()) return out[0].toUpperCase() + out.slice(1);
  return out;
}

/** Add +ed (past tense / past participle). */
function pastOf(word: string): string {
  const w = word.toLowerCase();
  const hit = IRREGULARS[w];
  if (hit) return matchCase(word, hit[0]);
  if (w.endsWith("e")) return matchCase(word, w + "d");
  if (endsConsonantY(w)) return matchCase(word, w.slice(0, -1) + "ied");
  if (doublesFinalCons(w)) return matchCase(word, w + w.slice(-1) + "ed");
  return matchCase(word, w + "ed");
}

/** Add +ing. */
function ingOf(word: string): string {
  const w = word.toLowerCase();
  const hit = IRREGULARS[w];
  if (hit) return matchCase(word, hit[2]);
  if (w.endsWith("ie")) return matchCase(word, w.slice(0, -2) + "ying");  // lie -> lying
  if (w.endsWith("e") && w.length > 2 && !w.endsWith("ee")) return matchCase(word, w.slice(0, -1) + "ing");
  if (doublesFinalCons(w)) return matchCase(word, w + w.slice(-1) + "ing");
  return matchCase(word, w + "ing");
}

/** Add +s (plural / 3rd person). */
function sOf(word: string): string {
  const w = word.toLowerCase();
  // Irregular verbs' 3rd-person form.
  const hit = IRREGULARS[w];
  if (hit) return matchCase(word, hit[3]);
  // Irregular plurals.
  if (IRREG_PLURAL[w]) return matchCase(word, IRREG_PLURAL[w]);
  if (/(s|x|z|ch|sh)$/.test(w)) return matchCase(word, w + "es");
  if (endsConsonantY(w)) return matchCase(word, w.slice(0, -1) + "ies");
  if (w.endsWith("o") && w.length > 1 && CONS.test(w[w.length - 2])) return matchCase(word, w + "es"); // go -> goes, do -> does (also in irregulars)
  if (w.endsWith("f")) return matchCase(word, w.slice(0, -1) + "ves"); // leaf -> leaves
  if (w.endsWith("fe")) return matchCase(word, w.slice(0, -2) + "ves"); // knife -> knives
  return matchCase(word, w + "s");
}

/** Append possessive 's (Pranava -> Pranava's). When the word already ends in s, use just '. */
function possessive(word: string): string {
  if (word.endsWith("s")) return word + "'";
  return word + "'s";
}

export function inflect(word: string, affix: Affix): string {
  if (!word) return word;
  switch (affix) {
    case "ed": return pastOf(word);
    case "ing": return ingOf(word);
    case "s": return sOf(word);
    case "'s": return possessive(word);
  }
}

/** The label a parent sees on an affix cell. */
export const AFFIX_LABEL: Record<Affix, string> = {
  "ed": "+ ed",
  "ing": "+ ing",
  "s": "+ s",
  "'s": "+ 's"
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

function tokenJaccard(a: string, b: string): number {
  const setA = new Set(a.split(" ").filter(Boolean));
  const setB = new Set(b.split(" ").filter(Boolean));
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const t of setA) if (setB.has(t)) intersection += 1;
  const union = setA.size + setB.size - intersection;
  return intersection / union;
}

export type MatchMethod = "exact" | "substring" | "token_overlap" | "levenshtein" | "no_match";

export interface MatchResult {
  itemId: string | null;
  itemName: string | null;
  score: number;
  method: MatchMethod;
}

const MIN_ACCEPT_SCORE = 0.5;

/** Deterministic, no AI call -- the candidate set here is one skill's own items (a handful to a
 * few dozen), not the full 1081-item bank, so this is cheap and fast enough to run over every
 * evidence row locally. */
export function matchItem(hint: string, candidates: { id: string; displayName: string }[]): MatchResult {
  const hintNorm = normalize(hint);
  if (!hintNorm || candidates.length === 0) return { itemId: null, itemName: null, score: 0, method: "no_match" };

  let best: MatchResult = { itemId: null, itemName: null, score: 0, method: "no_match" };

  for (const candidate of candidates) {
    const candNorm = normalize(candidate.displayName);

    if (candNorm === hintNorm) {
      return { itemId: candidate.id, itemName: candidate.displayName, score: 1, method: "exact" };
    }

    if (candNorm.includes(hintNorm) || hintNorm.includes(candNorm)) {
      const score = 0.85;
      if (score > best.score) best = { itemId: candidate.id, itemName: candidate.displayName, score, method: "substring" };
      continue;
    }

    const jaccard = tokenJaccard(hintNorm, candNorm);
    if (jaccard >= 0.5 && jaccard > best.score) {
      best = { itemId: candidate.id, itemName: candidate.displayName, score: jaccard, method: "token_overlap" };
      continue;
    }

    const maxLen = Math.max(hintNorm.length, candNorm.length);
    const ratio = maxLen === 0 ? 0 : 1 - levenshtein(hintNorm, candNorm) / maxLen;
    if (ratio >= 0.7 && ratio > best.score) {
      best = { itemId: candidate.id, itemName: candidate.displayName, score: ratio, method: "levenshtein" };
    }
  }

  return best.score >= MIN_ACCEPT_SCORE ? best : { itemId: null, itemName: null, score: best.score, method: "no_match" };
}

// Guess normalisation + fuzzy matching.

const STOP = new Set(["the", "a", "an", "of", "and", "in", "on", "to", "s"]);

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/^(the|a|an) /, "")
    .trim()
    .replace(/\s+/g, " ");
}

const squash = (s: string) => normalize(s).replace(/ /g, "");

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

function typoAllowance(len: number) {
  if (len <= 4) return 0;
  if (len <= 8) return 1;
  if (len <= 14) return 2;
  return 3;
}

export function isCorrect(guess: string, answers: string[]): boolean {
  const g = squash(guess);
  if (!g) return false;
  for (const a of answers) {
    const t = squash(a);
    if (!t) continue;
    if (g === t) return true;
    if (levenshtein(g, t) <= typoAllowance(t.length)) return true;
  }
  return false;
}

/** "Close" = shares a meaningful word with the answer, or is a near-miss spelling. */
export function isClose(guess: string, answers: string[]): boolean {
  const g = normalize(guess);
  if (!g) return false;
  const gWords = g.split(" ").filter((w) => w.length >= 3 && !STOP.has(w));
  for (const a of answers) {
    const t = normalize(a);
    const tWords = t.split(" ").filter((w) => w.length >= 3 && !STOP.has(w));
    for (const gw of gWords) {
      for (const tw of tWords) {
        if (gw === tw) return true;
        if (tw.length >= 5 && levenshtein(gw, tw) <= 1) return true;
      }
    }
    const gs = g.replace(/ /g, "");
    const ts = t.replace(/ /g, "");
    if (ts.length >= 6 && Math.abs(gs.length - ts.length) <= 2 && levenshtein(gs, ts) <= typoAllowance(ts.length) + 1)
      return true;
  }
  return false;
}

/** "_ _ _ _   _ _ _ _" style pattern; optionally reveal the first letter of each word. */
export function hintPattern(answer: string, revealFirst: boolean): string {
  return answer
    .split(" ")
    .map((word) => {
      let seenLetter = false;
      return word
        .split("")
        .map((ch) => {
          if (/[a-z0-9]/i.test(ch)) {
            const out = revealFirst && !seenLetter ? ch.toUpperCase() : "_";
            seenLetter = true;
            return out;
          }
          return ch;
        })
        .join(" ");
    })
    .join("   ");
}

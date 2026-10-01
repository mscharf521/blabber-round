import { PROMPTS, KINDS, TEMPLATES, GENERIC } from "../src/lib/content";
import { isClose, isCorrect } from "../src/lib/matching";
let problems = 0;
const ids = new Set<string>();
const counts: Record<string, number> = {};
for (const p of PROMPTS) {
  if (ids.has(p.id)) { console.log("DUP id", p.id); problems++; }
  ids.add(p.id);
  counts[`${p.category}-${p.difficulty}`] = (counts[`${p.category}-${p.difficulty}`] ?? 0) + 1;
  if (!KINDS[p.category].includes(p.kind)) { console.log("kind not in list", p.answer, p.kind); problems++; }
  for (const [slot, words] of Object.entries(p.words)) {
    for (const w of words ?? []) {
      if (isCorrect(w, [p.answer, ...p.alts]) || isClose(w, [p.answer, ...p.alts])) console.log(`  leak (auto-filtered) ${p.answer}: ${slot}=${w}`);
    }
  }
  for (const s of ["adj","noun","person","place","verb"]) if (!(p.words as any)[s]?.length) { console.log("missing slot", p.answer, s); }
  if (!isCorrect(p.answer, [p.answer])) { console.log("self-match fail", p.answer); problems++; }
}
console.log(counts, "total", PROMPTS.length, "templates", TEMPLATES.length);
for (const [k, v] of Object.entries(GENERIC)) console.log(k, v.length);
// matching spot checks
const t = (g: string, a: string[], exp: boolean) => { const r = isCorrect(g, a); if (r !== exp) { console.log("MATCH FAIL", g, a, r); problems++; } };
t("jaws", ["Jaws"], true); t("the lion king", ["The Lion King"], true); t("lion king", ["The Lion King"], true);
t("spiderman", ["Spider-Man"], true); t("smartphone", ["A Smartphone"], true); t("mcdonalds", ["McDonald's"], true);
t("jaw", ["Jaws"], false); t("mars", ["Cars"], false); t("Harry Poter", ["Harry Potter"], true);
t("pokemon", ["Pokémon"], true); t("lion", ["The Lion King"], false);
console.log("close lion", isClose("lion", ["The Lion King"]), "close shark", isClose("shark", ["Jaws"]));
console.log(problems ? `${problems} PROBLEMS` : "OK");

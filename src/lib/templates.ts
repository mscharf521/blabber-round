import type { Category, Difficulty, Slot, Template } from "./types";

/* =====================================================================
 * SENTENCE TEMPLATES
 * [adj] [noun] [person] [place] [verb] [cat] [guess] are blanks.
 * {a} inserts "a"/"an" to agree with the word chosen for the next blank.
 * ===================================================================== */

const ALL: Category[] = ["story", "person", "place", "thing"];

export const TEMPLATES: Template[] = [
  // The mandatory opening sentence
  { id: "open", cats: ALL, group: "start", pattern: "It's {a} [adj] [cat]." },

  // Describe — every category
  { id: "adj", cats: ALL, group: "describe", pattern: "It's [adj]." },
  { id: "very", cats: ALL, group: "describe", pattern: "It's really, really [adj]." },
  { id: "notadj", cats: ALL, group: "describe", pattern: "It's not [adj]." },
  { id: "adj2", cats: ALL, group: "describe", pattern: "It's [adj] and [adj]." },
  { id: "kinda", cats: ALL, group: "describe", pattern: "It's kinda like [noun]." },

  // Story
  { id: "s_about", cats: ["story"], group: "describe", pattern: "It's about [noun]." },
  { id: "s_aboutp", cats: ["story"], group: "describe", pattern: "It's about [person]." },
  { id: "s_pp", cats: ["story"], group: "describe", pattern: "It's about [person] and [person]." },
  { id: "s_has", cats: ["story"], group: "describe", pattern: "There's [noun] in it." },
  { id: "s_where", cats: ["story"], group: "describe", pattern: "It takes place in [place]." },
  { id: "s_wants", cats: ["story"], group: "describe", pattern: "[person] wants to [verb]." },
  { id: "s_must", cats: ["story"], group: "describe", pattern: "Someone has to [verb]." },
  { id: "s_hero", cats: ["story"], group: "describe", pattern: "The hero is [person]." },
  { id: "s_villain", cats: ["story"], group: "describe", pattern: "The bad guy is [person]." },
  { id: "s_ends", cats: ["story"], group: "describe", pattern: "It ends with [noun]." },

  // Person
  { id: "p_is", cats: ["person"], group: "describe", pattern: "They're [person]." },
  { id: "p_like", cats: ["person"], group: "describe", pattern: "They're kinda like [person]." },
  { id: "p_known", cats: ["person"], group: "describe", pattern: "They're known for [noun]." },
  { id: "p_can", cats: ["person"], group: "describe", pattern: "They can [verb]." },
  { id: "p_love", cats: ["person"], group: "describe", pattern: "They love to [verb]." },
  { id: "p_from", cats: ["person"], group: "describe", pattern: "They're from [place]." },
  { id: "p_has", cats: ["person"], group: "describe", pattern: "They have [noun]." },
  { id: "p_friend", cats: ["person"], group: "describe", pattern: "Their friend is [person]." },
  { id: "p_enemy", cats: ["person"], group: "describe", pattern: "Their enemy is [person]." },

  // Place
  { id: "l_in", cats: ["place"], group: "describe", pattern: "It's in [place]." },
  { id: "l_near", cats: ["place"], group: "describe", pattern: "It's near [place]." },
  { id: "l_like", cats: ["place"], group: "describe", pattern: "It's a lot like [place]." },
  { id: "l_has", cats: ["place"], group: "describe", pattern: "It has [noun]." },
  { id: "l_can", cats: ["place"], group: "describe", pattern: "You can [verb] there." },
  { id: "l_see", cats: ["place"], group: "describe", pattern: "You'll see [person] there." },
  { id: "l_go", cats: ["place"], group: "describe", pattern: "People go there to [verb]." },

  // Thing
  { id: "t_use", cats: ["thing"], group: "describe", pattern: "You use it to [verb]." },
  { id: "t_can", cats: ["thing"], group: "describe", pattern: "It can [verb]." },
  { id: "t_made", cats: ["thing"], group: "describe", pattern: "It's made of [noun]." },
  { id: "t_has", cats: ["thing"], group: "describe", pattern: "It has [noun]." },
  { id: "t_find", cats: ["thing"], group: "describe", pattern: "You find it in [place]." },
  { id: "t_for", cats: ["thing"], group: "describe", pattern: "It's for [person]." },
  { id: "t_looks", cats: ["thing"], group: "describe", pattern: "It looks like [noun]." },

  // Reacting to guesses
  { id: "g_like", cats: ALL, group: "guess", pattern: "It's like [guess]." },
  { id: "g_not", cats: ALL, group: "guess", pattern: "It's NOT [guess]." },
  { id: "g_close", cats: ALL, group: "guess", pattern: "[guess] is close!" },
  { id: "g_but", cats: ALL, group: "guess", pattern: "It's like [guess], but [adj]." },
  { id: "g_with", cats: ALL, group: "guess", pattern: "It's like [guess], but with [noun]." },
  { id: "g_less", cats: ALL, group: "guess", pattern: "It's like [guess], but less [adj]." },
];

export const TEMPLATE_MAP: Record<string, Template> = Object.fromEntries(
  TEMPLATES.map((t) => [t.id, t]),
);

/** Parse "It's {a} [adj] [cat]." into tokens. */
export type Token = { kind: "text"; text: string } | { kind: "blank"; slot: Slot; article: boolean };

export function parseTemplate(pattern: string): Token[] {
  const tokens: Token[] = [];
  const re = /(\{a\}\s*)?\[(adj|noun|person|place|verb|cat|guess)\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(pattern))) {
    if (m.index > last) tokens.push({ kind: "text", text: pattern.slice(last, m.index) });
    tokens.push({ kind: "blank", slot: m[2] as Slot, article: !!m[1] });
    last = m.index + m[0].length;
  }
  if (last < pattern.length) tokens.push({ kind: "text", text: pattern.slice(last) });
  return tokens;
}

export function article(word: string): string {
  const w = word.trim().toLowerCase();
  if (/^(honest|hour|heir)/.test(w)) return "an";
  if (/^(uni|use|usu|eu|one|once)/.test(w)) return "a";
  return /^[aeiou]/.test(w) ? "an" : "a";
}

export const CATEGORY_LABEL: Record<Category, string> = {
  story: "Story",
  person: "Person",
  place: "Place",
  thing: "Thing",
};

export const CATEGORY_ICON: Record<Category, string> = {
  story: "🎬",
  person: "🧑",
  place: "🗺️",
  thing: "📦",
};

export const DIFFICULTY_LABEL: Record<Difficulty, string> = { 1: "Easy", 2: "Medium", 3: "Hard" };


/**
 * Search ranking shared by every front end (mobile 7.2, desktop D14, the ⌘K palette).
 *
 * Text is folded before matching: lower case, accents dropped (Gonçalo = Goncalo),
 * Cyrillic transliterated to Latin (Гонсало = Gonsalo), Uzbek apostrophes removed
 * (O‘zbek = Ozbek), punctuation turned into spaces. Names also get a phonetic fold,
 * so the usual spellings of one name meet (Khasanov = Xasanov = Hasanov = Хасанов,
 * Yulia = Iuliia).
 *
 * Every query word must match a word of the item. A word matches, best first:
 * exactly, as the start of a word, inside a word (3+ letters), or with typos
 * (Damerau–Levenshtein: 1 edit for 4–7 letters, 2 for 8+). Typos are only tried
 * for a word that matches nothing exactly or by prefix, so "math" never drags in
 * "path", while "calculas" still finds Calculus.
 *
 * Items are ranked by tier, then by score inside the tier:
 *   exact code or whole name  >  code or name prefix  >  word prefixes  >  substrings  >  typos.
 * Codes are compared without spaces, so "math111", "MATH 111" and "Math-111" are one code.
 */

/* ───────────── folding ───────────── */

const CYRILLIC: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n",
  о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "",
  э: "e", ю: "yu", я: "ya", ў: "o", қ: "q", ғ: "g", ҳ: "h", і: "i", ї: "yi", є: "ye", ґ: "g",
};
const SPECIAL: Record<string, string> = { ø: "o", ł: "l", ß: "ss", æ: "ae", œ: "oe", đ: "d", ı: "i", þ: "th", ð: "d" };
const APOSTROPHES = /['’‘ʻʼ`´]/g;

/** Lower-case Latin letters, digits and single spaces. */
export function fold(text: string | null | undefined): string {
  if (!text) return "";
  const lower = text.toLowerCase().replace(APOSTROPHES, "");
  let out = "";
  for (const ch of lower) out += CYRILLIC[ch] ?? SPECIAL[ch] ?? ch;
  return out
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Spelling variants of one person's name collapse to one key: kh/x→h, dj/zh→j, y→i, q→k, doubled letters once. */
export function phonetic(word: string): string {
  return word
    .replace(/shch/g, "sh")
    .replace(/kh|x/g, "h")
    .replace(/dzh|dj|zh/g, "j")
    .replace(/ph/g, "f")
    .replace(/ck|q/g, "k")
    .replace(/w/g, "v")
    .replace(/y/g, "i")
    .replace(/(.)\1+/g, "$1");
}

/** Words of a text; a code like "MATH111" also yields "math" and "111". */
export function words(text: string | null | undefined, names = false): string[] {
  const out: string[] = [];
  for (const w of fold(text).split(" ")) {
    if (!w) continue;
    out.push(names ? phonetic(w) : w);
    if (!names) for (const part of w.split(/(?<=[a-z])(?=\d)|(?<=\d)(?=[a-z])/)) if (part !== w) out.push(part);
  }
  return out;
}

/** "MATH 111" → "math111". */
export const compact = (text: string | null | undefined) => fold(text).replace(/ /g, "");

/* ───────────── typos ───────────── */

/** Optimal string alignment distance (Damerau–Levenshtein with adjacent swaps), giving up past `max`. */
export function editDistance(a: string, b: string, max = Infinity): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      row[j] = v;
      if (v < best) best = v;
    }
    if (best > max) return max + 1;
    prev2 = prev;
    prev = row;
  }
  return prev[b.length];
}

/** Edits forgiven for a query word of this length. */
export const typoBudget = (length: number) => (length >= 8 ? 2 : length >= 4 ? 1 : 0);

/* ───────────── index ───────────── */

export type SearchDoc<T> = {
  item: T;
  /** Main text: course name, professor's given name + surname, file title, program name. */
  text: string;
  /** Course code; compared without spaces. */
  code?: string | null;
  /** Lower-weight text that can satisfy a query word (a file's course code and name). */
  extra?: string | null;
  /** Small tie-breaker inside a tier (popularity, current term), 0–1. */
  boost?: number;
};

/** Match quality of one query word against one item word. */
const EXACT = 4, PREFIX = 3, SUBSTRING = 2, TYPO = 1;

/** Ranking tiers, best first. */
export const TIER = { exact: 6, prefix: 5, wordPrefix: 4, substring: 3, typo: 2 } as const;

type Doc<T> = { item: T; text: string; folded: string; reversed: string | null; code: string; words: string[]; boost: number; length: number };
type Posting = { doc: number; extra: boolean; position: number };

export type Hit<T> = { item: T; tier: number; score: number; text: string };

export type SearchIndex<T> = {
  size: number;
  search(query: string, limit: number): Hit<T>[];
};

/**
 * Builds an in-memory index. `names: true` for people: phonetic folding, and the
 * name matches whole in either order ("Pinto Gonçalo" = "Gonçalo Pinto").
 */
export function createIndex<T>(input: Array<SearchDoc<T>>, opts: { names?: boolean } = {}): SearchIndex<T> {
  const names = !!opts.names;
  const docs: Doc<T>[] = [];
  const vocab = new Map<string, Posting[]>();
  const add = (word: string, posting: Posting) => {
    const list = vocab.get(word);
    if (list) list.push(posting);
    else vocab.set(word, [posting]);
  };
  for (const d of input) {
    const doc = docs.length;
    const main = words(d.text, names);
    const code = compact(d.code);
    const folded = names ? main.join(" ") : fold(d.text);
    docs.push({
      item: d.item, text: d.text, folded, code, words: main, boost: d.boost ?? 0, length: folded.length,
      reversed: names && main.length > 1 ? [...main.slice(1), main[0]].join(" ") : null,
    });
    main.forEach((w, position) => add(w, { doc, extra: false, position }));
    if (code) {
      add(code, { doc, extra: false, position: 0 });
      for (const w of words(d.code)) add(w, { doc, extra: false, position: 0 });
    }
    for (const w of words(d.extra)) add(w, { doc, extra: true, position: 99 });
  }
  const vocabulary = [...vocab.keys()];

  /** Every item word a query word reaches, with its quality. */
  function reach(token: string): Map<string, number> {
    const found = new Map<string, number>();
    let strong = false;
    for (const w of vocabulary) {
      if (w === token) { found.set(w, EXACT); strong = true; }
      else if (w.startsWith(token)) { found.set(w, PREFIX); strong = true; }
      else if (token.length >= 3 && w.includes(token)) found.set(w, SUBSTRING);
    }
    const budget = typoBudget(token.length);
    if (!strong && budget) {
      for (const w of vocabulary) {
        if (found.has(w) || w.length < token.length - budget) continue;
        // The whole word, or its start while the word is still being typed ("calculas" ~ "calculus", "calcu" ~ "calcul…").
        const d = Math.min(editDistance(token, w, budget), w.length > token.length ? editDistance(token, w.slice(0, token.length), budget) : budget + 1);
        // Fewer edits rank higher inside the typo tier.
        if (d <= budget) found.set(w, TYPO + (budget - d) * 0.25);
      }
    }
    return found;
  }

  return {
    size: docs.length,
    search(query, limit) {
      const tokens = [...new Set(words(query, names))].slice(0, 8);
      // A code split into letters and digits adds words; the whole query still has to match.
      const qFolded = names ? tokens.join(" ") : fold(query);
      const qCode = compact(query);
      if (!tokens.length || limit <= 0) return [];
      const queryWords = names ? tokens : fold(query).split(" ").filter(Boolean).slice(0, 8);

      // Per item: best quality per query word, and a score.
      const quality = new Map<number, { min: number; sum: number; extra: number; position: number; seen: number }>();
      queryWords.forEach((token, i) => {
        const perDoc = new Map<number, { q: number; extra: boolean; position: number }>();
        for (const [w, q] of reach(token)) {
          for (const p of vocab.get(w)!) {
            const cur = perDoc.get(p.doc);
            const better = !cur || q > cur.q || (q === cur.q && cur.extra && !p.extra);
            if (better) perDoc.set(p.doc, { q, extra: p.extra, position: p.position });
          }
        }
        for (const [doc, m] of perDoc) {
          const acc = quality.get(doc);
          if (i === 0) quality.set(doc, { min: m.q, sum: m.q, extra: m.extra ? 1 : 0, position: m.position, seen: 1 });
          else if (acc && acc.seen === i) {
            acc.min = Math.min(acc.min, m.q);
            acc.sum += m.q;
            acc.extra += m.extra ? 1 : 0;
            acc.position = Math.min(acc.position, m.position);
            acc.seen++;
          }
        }
      });

      const hits: Hit<T>[] = [];
      const whole = (doc: Doc<T>) =>
        doc.folded === qFolded || doc.reversed === qFolded || (!!doc.code && doc.code === qCode);
      const starts = (doc: Doc<T>) =>
        (qFolded.length >= 2 && (doc.folded.startsWith(qFolded) || !!doc.reversed?.startsWith(qFolded))) || (!!doc.code && qCode.length >= 2 && doc.code.startsWith(qCode));
      for (const [i, acc] of quality) {
        if (acc.seen !== queryWords.length) continue;
        const doc = docs[i];
        const tier = whole(doc) ? TIER.exact : starts(doc) ? TIER.prefix : acc.min >= PREFIX ? TIER.wordPrefix : acc.min >= SUBSTRING ? TIER.substring : TIER.typo;
        // Inside a tier: code hits, more exact words, fewer words matched only in the extra text,
        // a match near the start, shorter texts, then the item's own boost.
        const codeHit = doc.code && (doc.code === qCode ? 2 : doc.code.startsWith(qCode) ? 1 : 0);
        const score = (codeHit || 0) * 10 + acc.sum - acc.extra * 3 - Math.min(acc.position, 5) * 0.2 - Math.min(doc.length, 80) / 100 + doc.boost;
        hits.push({ item: doc.item, tier, score, text: doc.text });
      }
      // A query that is exactly a code but not split into words ("math111" against "MATH 111") is still an exact hit.
      if (qCode.length >= 3) {
        docs.forEach((doc, i) => {
          if (doc.code === qCode && quality.get(i)?.seen !== queryWords.length) hits.push({ item: doc.item, tier: TIER.exact, score: 20 + doc.boost, text: doc.text });
        });
      }
      return hits
        .sort((a, b) => b.tier - a.tier || b.score - a.score || a.text.localeCompare(b.text))
        .slice(0, limit);
    },
  };
}


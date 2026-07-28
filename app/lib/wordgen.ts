import {
  lexemes,
  phoneme_groups,
  phonemes,
  syllable_structures,
  users,
} from '../db/schema';
import { generateWordsInputSchema } from '../db/validation';
import { db } from '../db';
import { and, eq, inArray } from 'drizzle-orm';
import { notFound, validationMessage, type Result } from './result';
import { parseInput } from './parse';
import { parseAndRequireVisibleLanguage } from './ownership';
import { applyRules, type WordToken } from './rule-apply';
import { loadCompiledRules } from './rules';

type DbUser = typeof users.$inferSelect;
export type Rng = () => number;
export type LiteralTemplate = {
  template: {
    phonemes: {
      id: string;
      symbol: string;
      ipa: string | null;
      weight: number;
    }[];
    optional: boolean;
  }[];
  weight: number;
};
type SyllableStructure = typeof syllable_structures.$inferSelect;
type GroupComplex = {
  id: string;
  name: string;
  language_id: string;
  memberships: {
    group_id: string;
    phoneme_id: string;
    phoneme: {
      symbol: string;
      id: string;
      language_id: string;
      ipa: string | null;
      weight: number;
    };
  }[];
};
type Phoneme = typeof phonemes.$inferSelect;

/** Seeded PRNG (mulberry32). Returns a closure with the same signature as Math.random(). */
export function makeRng(seed: number): Rng {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 *  Selects a random item in an array based on weight prop
 * 0 <= Weight <= 2 (step: 0.1)
 */
export function selectRandomItemByWeight<T extends { weight: number }>(
  items: T[],
  rng: Rng,
): T {
  const total = items.reduce((sum, i) => sum + i.weight, 0);
  if (total === 0) return items[Math.floor(rng() * items.length)];
  let r = rng() * total;
  for (const item of items) {
    r -= item.weight;
    if (r < 0) return item;
  }
  return items[items.length - 1];
}

/**
 * Yields syllables as {@link WordToken} arrays rather than joined strings so
 * phoneme identity survives until rule application — a joined string cannot
 * be re-tokenized unambiguously once multigraph symbols exist.
 */
export function* generateRandomSyllableStream(
  templates: LiteralTemplate[],
  rng: Rng,
): Generator<WordToken[]> {
  while (true) {
    const selected = selectRandomItemByWeight(templates, rng);

    const newSyllable: WordToken[] = [];
    // If all optional slots are skipped and the syllable ends up empty, re-attempt
    do
      for (let i = 0; i < selected.template.length; i++) {
        const slot = selected.template[i];
        if (slot.optional && rng() < 0.5) continue;
        const nextPhoneme = selectRandomItemByWeight(slot.phonemes, rng);
        newSyllable.push({ id: nextPhoneme.id, symbol: nextPhoneme.symbol });
      }
    while (newSyllable.length === 0);

    yield newSyllable;
  }
}

/** Draws a syllable count in [minSyllables, maxSyllables] and concatenates that many syllables' tokens. */
export function generateRandomWord(
  generator: Generator<WordToken[]>,
  minSyllables: number,
  maxSyllables: number,
  rng: Rng,
): WordToken[] {
  const word: WordToken[] = [];
  const syllableCount =
    Math.floor(rng() * (maxSyllables - minSyllables + 1)) + minSyllables;
  for (let i = 0; i < syllableCount; i++) word.push(...generator.next().value!);
  return word;
}

export function separateTemplateIds(
  parsedStructures: { template: SyllableStructure['template'] }[],
): [Set<string>, Set<string>] {
  const phonemeIds = new Set<string>();
  const groupIds = new Set<string>();
  for (const { template } of parsedStructures) {
    for (const slot of template) {
      if (slot.kind === 'phoneme') phonemeIds.add(slot.phonemeId);
      else groupIds.add(slot.groupId);
    }
  }
  return [phonemeIds, groupIds];
}

export function builtLiteralTemplates(
  phonemesList: Phoneme[],
  groupsWithMembersList: GroupComplex[],
  parsedStructures: SyllableStructure[],
) {
  const phonemesById = new Map(phonemesList.map((p) => [p.id, p]));
  const groupsById = new Map(groupsWithMembersList.map((g) => [g.id, g]));

  /** Templates with weight and phoneme list */
  const literalTemplates: LiteralTemplate[] = parsedStructures.map(
    ({ template, weight }) => ({
      template: template.map((slot) => {
        if (slot.kind === 'group')
          return {
            phonemes: groupsById
              .get(slot.groupId)!
              .memberships.map(({ phoneme: { id, symbol, ipa, weight } }) => ({
                id,
                symbol,
                ipa,
                weight,
              })),
            optional: slot.optional,
          };
        else {
          const { id, symbol, ipa, weight } = phonemesById.get(slot.phonemeId)!;
          return {
            phonemes: [{ id, symbol, ipa, weight }],
            optional: slot.optional,
          };
        }
      }),
      weight,
    }),
  );

  return literalTemplates;
}

/**
 * Loads the phonemes and phoneme groups referenced by `parsedStructures` and
 * resolves them into {@link LiteralTemplate}s — the shared representation
 * consumed by both word generation and the phonotactics matcher.
 *
 * Empty groups are reported by name rather than turned into a failure because
 * callers disagree on severity: word generation rejects them (a slot that can
 * never be filled makes generation impossible), while the phonotactics check
 * tolerates them (a required slot with no symbols simply never matches, which
 * is the correct legality semantics).
 */
export async function loadLiteralTemplates(
  parsedStructures: SyllableStructure[],
): Promise<{ templates: LiteralTemplate[]; emptyGroupNames: string[] }> {
  const [phonemeIds, groupIds] = separateTemplateIds(parsedStructures);

  const [phonemesList, groupsWithMembersList] = await Promise.all([
    phonemeIds.size
      ? db
          .select()
          .from(phonemes)
          .where(inArray(phonemes.id, [...phonemeIds]))
      : ([] as Phoneme[]),
    groupIds.size
      ? db.query.phoneme_groups.findMany({
          where: inArray(phoneme_groups.id, [...groupIds]),
          with: {
            memberships: {
              with: {
                phoneme: true,
              },
            },
          },
        })
      : ([] as GroupComplex[]),
  ]);

  return {
    templates: builtLiteralTemplates(
      phonemesList,
      groupsWithMembersList,
      parsedStructures,
    ),
    emptyGroupNames: groupsWithMembersList
      .filter((g) => g.memberships.length === 0)
      .map((g) => g.name),
  };
}

/**
 * Draws words from the syllable stream until `wordsToGenerate` unique surface
 * forms exist (or the 10× attempt cap is hit). `transformWord` is the rule
 * application step, run on the token array before it is joined to a string —
 * so uniqueness is defined over **post-rule** surface forms (two raw words a
 * rule merges count once). Pass the identity function when no rules apply.
 */
export function generateWordSet(
  wordsToGenerate: number,
  minSyllables: number,
  maxSyllables: number,
  syllableStream: Generator<WordToken[]>,
  rng: Rng,
  transformWord: (word: WordToken[]) => WordToken[],
  checkIfExists: (word: string) => boolean,
) {
  const newWords = new Set<string>();
  const maxAttempts = wordsToGenerate * 10;
  let attempts = 0;
  while (newWords.size < wordsToGenerate && attempts < maxAttempts) {
    const word = generateRandomWord(
      syllableStream,
      minSyllables,
      maxSyllables,
      rng,
    );
    const formedWord = transformWord(word)
      .map((t) => t.symbol)
      .join('');
    if (!checkIfExists(formedWord)) newWords.add(formedWord);
    attempts++;
  }

  return newWords;
}

/**
 * Generates a set of unique random words for a language owned by `user` or
 * public (`user` may be `null` for an anonymous visitor — generation performs
 * no DB write, so it's safe to open up alongside the other reads).
 * `rawLanguageId` and `rawInput` are untrusted — schema validation and visibility are enforced here.
 *
 * `data.words` may contain fewer entries than `data.requested` if the phonological space is too
 * constrained to produce that many unique words within 10× `wordsToGenerate` generation attempts
 * (including zero, if every attempt collided or the space is a single word). `requested` is
 * returned alongside so callers can detect and surface a partial result without threading
 * `wordsToGenerate` back in from their own scope.
 *
 * Pass `seed` to make word generation deterministic — the same seed and language definition always
 * produce the same word list. Omit it for random output in production.
 *
 * All of the language's phonological rules are applied to every word (in `position` order,
 * simultaneous application within a rule — see `applyRules`), so `data.words` contains
 * post-rule surface forms and uniqueness is defined over those.
 */
export async function generateWordSvc(
  user: DbUser | null,
  rawLanguageId: unknown,
  rawInput: unknown,
  seed?: number,
): Promise<Result<{ words: Set<string>; requested: number }>> {
  const input = parseInput(generateWordsInputSchema, rawInput);
  if (!input.ok) return input;

  const { wordsToGenerate, structures, minSyllables, maxSyllables } =
    input.data;

  if (maxSyllables < minSyllables)
    return validationMessage(
      'The minimum amount of syllables cannot exceed the maximum amount.',
    );

  const lang = await parseAndRequireVisibleLanguage(user, rawLanguageId);
  if (!lang.ok) return lang;

  const parsedStructures = await db
    .select()
    .from(syllable_structures)
    .where(
      and(
        eq(syllable_structures.language_id, lang.data.id),
        inArray(syllable_structures.id, structures),
      ),
    );

  if (!parsedStructures.length) return notFound();

  const { templates: literalTemplates, emptyGroupNames } =
    await loadLiteralTemplates(parsedStructures);

  if (emptyGroupNames.length)
    return validationMessage(
      `Phoneme group "${emptyGroupNames[0]}" has no members and cannot be used in word generation.`,
    );

  const compiledRules = await loadCompiledRules(lang.data.id);

  const rng = seed !== undefined ? makeRng(seed) : Math.random;
  const syllableStream = generateRandomSyllableStream(literalTemplates, rng);

  const terms = await db
    .select({ term: lexemes.term })
    .from(lexemes)
    .where(eq(lexemes.language_id, lang.data.id));

  const termsSet = new Set(terms.map(({ term }) => term));

  const newWords = generateWordSet(
    wordsToGenerate,
    minSyllables,
    maxSyllables,
    syllableStream,
    rng,
    (word) => applyRules(word, compiledRules),
    (word) => termsSet.has(word),
  );

  return { ok: true, data: { words: newWords, requested: wordsToGenerate } };
}

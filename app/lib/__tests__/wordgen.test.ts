import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../db', () => ({
  db: {
    query: {
      languages: { findFirst: vi.fn() },
      phoneme_groups: { findMany: vi.fn() },
    },
    select: vi.fn(),
  },
}));

import { db } from '../../db';
import type { syllable_structures, users } from '../../db/schema';
import {
  selectRandomItemByWeight,
  generateRandomSyllableStream,
  generateRandomWord,
  separateTemplateIds,
  builtLiteralTemplates,
  generateWordSet,
  generateWordSvc,
} from '../wordgen';

type SyllableStructure = typeof syllable_structures.$inferSelect;

/** Creates an Rng that cycles through `values` in order, wrapping around. */
function seqRng(values: number[]) {
  let i = 0;
  return () => values[i++ % values.length];
}

/**
 * Casts a minimal stub of drizzle's fluent select chain to its real type —
 * the tests only exercise the `.from().where()` (and `.orderBy()`) calls the
 * service actually makes.
 */
function asSelectChain(stub: object) {
  return stub as unknown as ReturnType<typeof db.select>;
}

const LANG_ID = '550e8400-e29b-41d4-a716-446655440000';
const STRUCT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const PHONEME_ID_1 = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const PHONEME_ID_2 = 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const GROUP_ID = 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

const mockUser: typeof users.$inferSelect = {
  id: 'ef000000-0000-0000-0000-000000000001',
  clerk_id: 'clerk-test',
  email: 'test@example.com',
  created_at: new Date(),
  updated_at: new Date(),
};

const mockLanguage = {
  id: LANG_ID, user_id: mockUser.id, name: 'Testlang', is_public: false,
  created_at: new Date(), updated_at: new Date(),
};

// ---------------------------------------------------------------------------
// selectRandomItemByWeight
// ---------------------------------------------------------------------------

describe('selectRandomItemByWeight', () => {
  const items = [
    { label: 'a', weight: 1 },
    { label: 'b', weight: 1 },
    { label: 'c', weight: 1 },
  ];

  it('always returns the sole item in a single-element array', () => {
    const single = [{ label: 'only', weight: 1 }];
    expect(selectRandomItemByWeight(single, () => 0).label).toBe('only');
    expect(selectRandomItemByWeight(single, () => 0.999).label).toBe('only');
  });

  it('selects the first item when rng returns 0', () => {
    expect(selectRandomItemByWeight(items, () => 0).label).toBe('a');
  });

  it('selects the last item when rng returns just below 1', () => {
    expect(selectRandomItemByWeight(items, () => 1 - Number.EPSILON).label).toBe('c');
  });

  it('falls back to uniform index selection when all weights are zero', () => {
    const zeroItems = [
      { label: 'x', weight: 0 },
      { label: 'y', weight: 0 },
    ];
    expect(selectRandomItemByWeight(zeroItems, () => 0).label).toBe('x');
    expect(selectRandomItemByWeight(zeroItems, () => 0.999).label).toBe('y');
  });
});

// ---------------------------------------------------------------------------
// generateRandomSyllableStream
// ---------------------------------------------------------------------------

/** Joins a syllable/word of tokens back into its surface string. */
function symbols(tokens: { symbol: string }[] | undefined): string {
  return (tokens ?? []).map((t) => t.symbol).join('');
}

describe('generateRandomSyllableStream', () => {
  it('yields the sole phoneme from a single required slot', () => {
    const templates = [{
      weight: 1,
      template: [{ phonemes: [{ id: PHONEME_ID_1, symbol: 'k', ipa: null, weight: 1 }], optional: false }],
    }];
    const gen = generateRandomSyllableStream(templates, seqRng([0]));
    expect(symbols(gen.next().value)).toBe('k');
    expect(symbols(gen.next().value)).toBe('k');
  });

  it('carries the phoneme id on each yielded token', () => {
    const templates = [{
      weight: 1,
      template: [{ phonemes: [{ id: PHONEME_ID_1, symbol: 'k', ipa: null, weight: 1 }], optional: false }],
    }];
    const gen = generateRandomSyllableStream(templates, seqRng([0]));
    expect(gen.next().value).toEqual([{ id: PHONEME_ID_1, symbol: 'k' }]);
  });

  it('skips an optional slot when rng returns < 0.5', () => {
    const templates = [{
      weight: 1,
      template: [
        { phonemes: [{ id: PHONEME_ID_1, symbol: 'a', ipa: null, weight: 1 }], optional: true },
        { phonemes: [{ id: PHONEME_ID_2, symbol: 'k', ipa: null, weight: 1 }], optional: false },
      ],
    }];
    // rng call order: template-select (0), optional-check (0.25 < 0.5 → skip), phoneme-select (0)
    const gen = generateRandomSyllableStream(templates, seqRng([0, 0.25, 0]));
    expect(symbols(gen.next().value)).toBe('k');
  });

  it('includes an optional slot when rng returns >= 0.5', () => {
    const templates = [{
      weight: 1,
      template: [
        { phonemes: [{ id: PHONEME_ID_1, symbol: 'a', ipa: null, weight: 1 }], optional: true },
        { phonemes: [{ id: PHONEME_ID_2, symbol: 'k', ipa: null, weight: 1 }], optional: false },
      ],
    }];
    // rng call order: template-select (0), optional-check (0.75 >= 0.5 → include), phoneme-selects (0, 0)
    const gen = generateRandomSyllableStream(templates, seqRng([0, 0.75, 0, 0]));
    expect(symbols(gen.next().value)).toBe('ak');
  });
});

// ---------------------------------------------------------------------------
// generateRandomWord
// ---------------------------------------------------------------------------

/** Endless stream of the same syllable, given as one token per character. */
function* repeatSyllable(s: string): Generator<{ id: string; symbol: string }[]> {
  const syllable = [...s].map((symbol) => ({ id: `id-${symbol}`, symbol }));
  while (true) yield syllable;
}

describe('generateRandomWord', () => {
  it('concatenates exactly the right number of syllables when min equals max', () => {
    const word = generateRandomWord(repeatSyllable('ka'), 2, 2, () => 0);
    expect(symbols(word)).toBe('kaka');
  });

  it('produces a word with syllable count within [minSyllables, maxSyllables]', () => {
    // Each syllable is one 'x' token so word.length equals syllable count
    for (const r of [0, 0.33, 0.66, 0.999]) {
      const word = generateRandomWord(repeatSyllable('x'), 2, 4, () => r);
      expect(word.length).toBeGreaterThanOrEqual(2);
      expect(word.length).toBeLessThanOrEqual(4);
    }
  });
});

// ---------------------------------------------------------------------------
// separateTemplateIds
// ---------------------------------------------------------------------------

describe('separateTemplateIds', () => {
  it('collects phoneme ids and leaves groupIds empty when all slots are phonemes', () => {
    const structures: { template: SyllableStructure['template'] }[] = [
      { template: [{ kind: 'phoneme', phonemeId: PHONEME_ID_1, optional: false }] },
      { template: [{ kind: 'phoneme', phonemeId: PHONEME_ID_2, optional: true }] },
    ];
    const [phonemeIds, groupIds] = separateTemplateIds(structures);
    expect(phonemeIds).toEqual(new Set([PHONEME_ID_1, PHONEME_ID_2]));
    expect(groupIds.size).toBe(0);
  });

  it('collects group ids and leaves phonemeIds empty when all slots are groups', () => {
    const structures: { template: SyllableStructure['template'] }[] = [
      { template: [{ kind: 'group', groupId: GROUP_ID, optional: false }] },
    ];
    const [phonemeIds, groupIds] = separateTemplateIds(structures);
    expect(phonemeIds.size).toBe(0);
    expect(groupIds).toEqual(new Set([GROUP_ID]));
  });

  it('deduplicates ids that appear in multiple structures', () => {
    const structures: { template: SyllableStructure['template'] }[] = [
      { template: [{ kind: 'phoneme', phonemeId: PHONEME_ID_1, optional: false }] },
      { template: [{ kind: 'phoneme', phonemeId: PHONEME_ID_1, optional: false }] },
    ];
    const [phonemeIds] = separateTemplateIds(structures);
    expect(phonemeIds.size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// builtLiteralTemplates
// ---------------------------------------------------------------------------

describe('builtLiteralTemplates', () => {
  it('maps a phoneme slot to the phoneme symbol/ipa/weight', () => {
    const phonemesList = [
      { id: PHONEME_ID_1, symbol: 'k', ipa: 'k', weight: 2, language_id: LANG_ID, created_at: new Date(), updated_at: new Date() },
    ];
    const structures: SyllableStructure[] = [{
      id: STRUCT_ID, language_id: LANG_ID, weight: 3, created_at: new Date(), updated_at: new Date(),
      template: [{ kind: 'phoneme', phonemeId: PHONEME_ID_1, optional: false }],
    }];
    const result = builtLiteralTemplates(phonemesList, [], structures);
    expect(result).toHaveLength(1);
    expect(result[0].weight).toBe(3);
    expect(result[0].template[0].optional).toBe(false);
    expect(result[0].template[0].phonemes).toEqual([{ id: PHONEME_ID_1, symbol: 'k', ipa: 'k', weight: 2 }]);
  });

  it('maps a group slot to all of its members', () => {
    const group = {
      id: GROUP_ID, name: 'vowels', language_id: LANG_ID,
      memberships: [
        { group_id: GROUP_ID, phoneme_id: PHONEME_ID_1, phoneme: { id: PHONEME_ID_1, symbol: 'a', ipa: 'a', weight: 1, language_id: LANG_ID } },
        { group_id: GROUP_ID, phoneme_id: PHONEME_ID_2, phoneme: { id: PHONEME_ID_2, symbol: 'e', ipa: 'e', weight: 3, language_id: LANG_ID } },
      ],
    };
    const structures: SyllableStructure[] = [{
      id: STRUCT_ID, language_id: LANG_ID, weight: 1, created_at: new Date(), updated_at: new Date(),
      template: [{ kind: 'group', groupId: GROUP_ID, optional: true }],
    }];
    const result = builtLiteralTemplates([], [group], structures);
    expect(result[0].template[0].optional).toBe(true);
    expect(result[0].template[0].phonemes).toEqual(
      expect.arrayContaining([
        { id: PHONEME_ID_1, symbol: 'a', ipa: 'a', weight: 1 },
        { id: PHONEME_ID_2, symbol: 'e', ipa: 'e', weight: 3 },
      ]),
    );
  });
});

// ---------------------------------------------------------------------------
// generateWordSet
// ---------------------------------------------------------------------------

describe('generateWordSet', () => {
  const identity = <T,>(w: T) => w;
  const noneExist = () => false;

  function* uniqueSyllables(): Generator<{ id: string; symbol: string }[]> {
    let n = 0;
    while (true) yield [{ id: `id-${n}`, symbol: `w${n++}` }];
  }

  it('returns the requested number of words when the phonological space is large enough', () => {
    const words = generateWordSet(5, 1, 1, uniqueSyllables(), () => 0, identity, noneExist);
    expect(words.size).toBe(5);
  });

  it('returns fewer than requested when the space is too constrained', () => {
    // Only one possible word exists: 'kaka' (fixed syllable, fixed 2-syllable count)
    const words = generateWordSet(5, 2, 2, repeatSyllable('ka'), () => 0, identity, noneExist);
    expect(words.size).toBe(1);
  });

  it('never returns duplicate words', () => {
    const words = generateWordSet(10, 1, 1, uniqueSyllables(), () => 0, identity, noneExist);
    expect(new Set([...words]).size).toBe(words.size);
  });

  it('dedupes on the post-transform surface form', () => {
    // The transform rewrites every token to 'x', merging all raw words into one
    const toX = (w: { id: string; symbol: string }[]) =>
      w.map(() => ({ id: 'id-x', symbol: 'x' }));
    const words = generateWordSet(5, 1, 1, uniqueSyllables(), () => 0, toX, noneExist);
    expect([...words]).toEqual(['x']);
  });

  it('excludes words reported as already existing, without consuming a slot for them', () => {
    // uniqueSyllables yields w0, w1, w2, ... in order; treat w0 and w2 as pre-existing
    const existing = new Set(['w0', 'w2']);
    const words = generateWordSet(
      3, 1, 1, uniqueSyllables(), () => 0, identity, (w) => existing.has(w),
    );
    expect(words.size).toBe(3);
    expect([...words]).toEqual(expect.arrayContaining(['w1', 'w3', 'w4']));
  });

  it('returns fewer than requested when checkIfExists rejects every generated word', () => {
    const words = generateWordSet(5, 1, 1, uniqueSyllables(), () => 0, identity, () => true);
    expect(words.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// generateWordSvc
// ---------------------------------------------------------------------------

describe('generateWordSvc', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Default: all select chains return empty arrays; tests override as needed
    vi.mocked(db.select).mockReturnValue(
      asSelectChain({
        from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
      }),
    );
  });

  it('returns a validation error for malformed input', async () => {
    const result = await generateWordSvc(mockUser, LANG_ID, { wordsToGenerate: 'not-a-number' });
    expect(result).toMatchObject({ ok: false, kind: 'validation' });
  });

  it('returns a validation error when maxSyllables is less than minSyllables', async () => {
    const result = await generateWordSvc(mockUser, LANG_ID, {
      wordsToGenerate: 5,
      structures: [STRUCT_ID],
      minSyllables: 3,
      maxSyllables: 1,
    });
    expect(result).toMatchObject({ ok: false, kind: 'validation' });
  });

  it('returns invalid_id for a non-UUID language id', async () => {
    const result = await generateWordSvc(mockUser, 'not-a-uuid', {
      wordsToGenerate: 5,
      structures: [STRUCT_ID],
    });
    expect(result).toMatchObject({ ok: false, kind: 'invalid_id' });
  });

  it('returns not_found when the language does not belong to the user', async () => {
    // findFirst returns undefined by default after vi.resetAllMocks()
    const result = await generateWordSvc(mockUser, LANG_ID, {
      wordsToGenerate: 5,
      structures: [STRUCT_ID],
    });
    expect(result).toMatchObject({ ok: false, kind: 'not_found' });
  });

  it('returns not_found when no syllable structures match', async () => {
    vi.mocked(db.query.languages.findFirst).mockResolvedValue(mockLanguage);
    // Default select mock returns [] → no structures found
    const result = await generateWordSvc(mockUser, LANG_ID, {
      wordsToGenerate: 5,
      structures: [STRUCT_ID],
    });
    expect(result).toMatchObject({ ok: false, kind: 'not_found' });
  });

  it('returns a validation error when a phoneme group has no members', async () => {
    vi.mocked(db.query.languages.findFirst).mockResolvedValue(mockLanguage);
    vi.mocked(db.select).mockReturnValue(
      asSelectChain({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{
            id: STRUCT_ID,
            language_id: LANG_ID,
            template: [{ kind: 'group', groupId: GROUP_ID, optional: false }],
            weight: 1,
          }]),
        }),
      }),
    );
    const emptyGroup = {
      id: GROUP_ID,
      language_id: LANG_ID,
      name: 'vowels',
      memberships: [],
      created_at: new Date(),
      updated_at: new Date(),
    };
    vi.mocked(db.query.phoneme_groups.findMany).mockResolvedValue([emptyGroup]);

    const result = await generateWordSvc(mockUser, LANG_ID, {
      wordsToGenerate: 5,
      structures: [STRUCT_ID],
    });
    expect(result).toMatchObject({ ok: false, kind: 'validation' });
    if (!result.ok && result.kind === 'validation')
      expect(result.issues).toContain('vowels');
  });

  it('generates a deterministic word set given the same seed', async () => {
    const structure = {
      id: STRUCT_ID,
      language_id: LANG_ID,
      template: [
        { kind: 'phoneme', phonemeId: PHONEME_ID_1, optional: false },
        { kind: 'phoneme', phonemeId: PHONEME_ID_2, optional: false },
      ],
      weight: 1,
    };
    const phonemes = [
      { id: PHONEME_ID_1, symbol: 'k', ipa: null, weight: 1 },
      { id: PHONEME_ID_2, symbol: 'a', ipa: null, weight: 1 },
    ];
    const input = {
      wordsToGenerate: 5,
      structures: [STRUCT_ID],
      minSyllables: 1,
      maxSyllables: 2,
    };

    function setupMocks() {
      vi.mocked(db.query.languages.findFirst).mockResolvedValue(mockLanguage);
      vi.mocked(db.query.phoneme_groups.findMany).mockResolvedValue([]);
      // Select order: structures, then template phonemes, then the language's
      // rules — the last is awaited via .where(...).orderBy(...), so the
      // default implementation returns a thenable that also carries orderBy.
      const mockWhere = vi.fn()
        .mockResolvedValueOnce([structure])
        .mockResolvedValueOnce(phonemes)
        .mockImplementation(() =>
          Object.assign(Promise.resolve([]), {
            orderBy: vi.fn().mockResolvedValue([]),
          }),
        );
      vi.mocked(db.select).mockReturnValue(
        asSelectChain({ from: vi.fn().mockReturnValue({ where: mockWhere }) }),
      );
    }

    setupMocks();
    const result1 = await generateWordSvc(mockUser, LANG_ID, input, 42);

    vi.resetAllMocks();
    setupMocks();
    const result2 = await generateWordSvc(mockUser, LANG_ID, input, 42);

    expect(result1.ok).toBe(true);
    expect(result2.ok).toBe(true);
    if (result1.ok && result2.ok) {
      expect(result1.data.requested).toBe(5);
      expect([...result1.data.words]).toEqual([...result2.data.words]);
    }
  });

  it('excludes words that already exist as lexemes in the language', async () => {
    // A single syllable structure with one phoneme per slot always yields
    // 'ka', regardless of rng — so if 'ka' is already a lexeme, every
    // attempt collides and the result is empty.
    const structure = {
      id: STRUCT_ID,
      language_id: LANG_ID,
      template: [
        { kind: 'phoneme', phonemeId: PHONEME_ID_1, optional: false },
        { kind: 'phoneme', phonemeId: PHONEME_ID_2, optional: false },
      ],
      weight: 1,
    };
    const phonemes = [
      { id: PHONEME_ID_1, symbol: 'k', ipa: null, weight: 1 },
      { id: PHONEME_ID_2, symbol: 'a', ipa: null, weight: 1 },
    ];

    vi.mocked(db.query.languages.findFirst).mockResolvedValue(mockLanguage);
    vi.mocked(db.query.phoneme_groups.findMany).mockResolvedValue([]);
    // Select order: structures, template phonemes, rules (via .orderBy()), lexicon terms
    const mockWhere = vi.fn()
      .mockResolvedValueOnce([structure])
      .mockResolvedValueOnce(phonemes)
      .mockImplementationOnce(() =>
        Object.assign(Promise.resolve([]), {
          orderBy: vi.fn().mockResolvedValue([]),
        }),
      )
      .mockResolvedValueOnce([{ term: 'ka' }]);
    vi.mocked(db.select).mockReturnValue(
      asSelectChain({ from: vi.fn().mockReturnValue({ where: mockWhere }) }),
    );

    const result = await generateWordSvc(mockUser, LANG_ID, {
      wordsToGenerate: 5,
      structures: [STRUCT_ID],
      minSyllables: 1,
      maxSyllables: 1,
    }, 42);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.requested).toBe(5);
      expect(result.data.words.size).toBe(0);
    }
  });
});

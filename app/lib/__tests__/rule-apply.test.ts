import { describe, expect, it } from 'vitest';
import {
  applyRules,
  compileRules,
  type RuleParts,
  type WordToken,
} from '../rule-apply';
import type { RuleContext } from '../../db/json-shapes';

// Readable ids: phoneme ids are their symbol prefixed, groups are g:NAME.
const P = (symbol: string) => `phoneme-${symbol}`;
const G_VOWELS = 'group-vowels';
const G_EMPTY = 'group-empty';

const phonemeSymbolById = new Map(
  ['t', 'd', 'a', 'i', 'b', 'x'].map((s) => [P(s), s]),
);
const memberIdsByGroupId = new Map<string, ReadonlySet<string>>([
  [G_VOWELS, new Set([P('a'), P('i')])],
  [G_EMPTY, new Set()],
]);

/** Builds a word's token array from one symbol per character. */
function word(s: string): WordToken[] {
  return [...s].map((symbol) => ({ id: P(symbol), symbol }));
}

/** Renders a token array back to its surface string. */
function surface(tokens: WordToken[]): string {
  return tokens.map((t) => t.symbol).join('');
}

const phonemeSlot = (symbol: string, optional = false): RuleContext[number] => ({
  kind: 'phoneme',
  phonemeId: P(symbol),
  optional,
});
const groupSlot = (groupId: string, optional = false): RuleContext[number] => ({
  kind: 'group',
  groupId,
  optional,
});
const boundary: RuleContext[number] = { kind: 'boundary' };

/**
 * Compiles a single rule with defaults: phoneme target, empty contexts.
 * Omitting `output` compiles a deletion rule (Ø): `output_phoneme_id` null.
 */
function rule(parts: Partial<RuleParts> & { output?: string }) {
  const row: RuleParts = {
    target_phoneme_id: parts.target_phoneme_id ?? null,
    target_group_id: parts.target_group_id ?? null,
    output_phoneme_id: parts.output ? P(parts.output) : null,
    left_context: parts.left_context ?? [],
    right_context: parts.right_context ?? [],
  };
  return compileRules([row], phonemeSymbolById, memberIdsByGroupId);
}

describe('applyRules — targets', () => {
  it('rewrites every occurrence of a phoneme target (unconditional rule)', () => {
    const rules = rule({ target_phoneme_id: P('t'), output: 'd' });
    expect(surface(applyRules(word('tati'), rules))).toBe('dadi');
  });

  it('rewrites every member of a group target', () => {
    const rules = rule({ target_group_id: G_VOWELS, output: 'x' });
    expect(surface(applyRules(word('tati'), rules))).toBe('txtx');
  });

  it('a rule targeting an empty group never fires', () => {
    const rules = rule({ target_group_id: G_EMPTY, output: 'x' });
    expect(surface(applyRules(word('tati'), rules))).toBe('tati');
  });

  it('does not mutate the input word', () => {
    const input = word('ta');
    applyRules(input, rule({ target_phoneme_id: P('t'), output: 'd' }));
    expect(surface(input)).toBe('ta');
  });

  it('preserves word length (one phoneme in, one phoneme out)', () => {
    const rules = rule({ target_group_id: G_VOWELS, output: 'a' });
    expect(applyRules(word('tatit'), rules)).toHaveLength(5);
  });
});

describe('applyRules — contexts', () => {
  it('left phoneme context: only applies after the required phoneme', () => {
    const rules = rule({
      target_phoneme_id: P('a'),
      output: 'i',
      left_context: [phonemeSlot('t')],
    });
    expect(surface(applyRules(word('tada'), rules))).toBe('tida');
  });

  it('right group context: only applies before a group member', () => {
    const rules = rule({
      target_phoneme_id: P('t'),
      output: 'd',
      right_context: [groupSlot(G_VOWELS)],
    });
    expect(surface(applyRules(word('tatb'), rules))).toBe('datb');
  });

  it('word-initial boundary in the left context', () => {
    const rules = rule({
      target_phoneme_id: P('t'),
      output: 'd',
      left_context: [boundary],
    });
    expect(surface(applyRules(word('tat'), rules))).toBe('dat');
  });

  it('word-final boundary in the right context', () => {
    const rules = rule({
      target_phoneme_id: P('t'),
      output: 'd',
      right_context: [boundary],
    });
    expect(surface(applyRules(word('tat'), rules))).toBe('tad');
  });

  it('multi-slot context matches in order', () => {
    // a → i / t d _  (both required, adjacent, in that order)
    const rules = rule({
      target_phoneme_id: P('a'),
      output: 'i',
      left_context: [phonemeSlot('t'), phonemeSlot('d')],
    });
    expect(surface(applyRules(word('tdada'), rules))).toBe('tdida');
  });

  it('optional context slot matches with and without the token', () => {
    // t → d / # (b) _  : word-initial t, optionally after a b
    const rules = rule({
      target_phoneme_id: P('t'),
      output: 'd',
      left_context: [boundary, phonemeSlot('b', true)],
    });
    expect(surface(applyRules(word('ta'), rules))).toBe('da');
    expect(surface(applyRules(word('bta'), rules))).toBe('bda');
    // not word-initial (even allowing the optional b): no match
    expect(surface(applyRules(word('abta'), rules))).toBe('abta');
  });

  it('a required empty-group context slot never matches; an optional one is skipped', () => {
    const required = rule({
      target_phoneme_id: P('t'),
      output: 'd',
      left_context: [groupSlot(G_EMPTY)],
    });
    expect(surface(applyRules(word('ata'), required))).toBe('ata');

    const optional = rule({
      target_phoneme_id: P('t'),
      output: 'd',
      left_context: [groupSlot(G_EMPTY, true)],
    });
    expect(surface(applyRules(word('ata'), optional))).toBe('ada');
  });

  it('context matching does not run past the word edges', () => {
    const rules = rule({
      target_phoneme_id: P('t'),
      output: 'd',
      left_context: [phonemeSlot('a')],
    });
    // t is word-initial: no token to the left, required slot fails
    expect(surface(applyRules(word('ta'), rules))).toBe('ta');
  });
});

describe('applyRules — application semantics', () => {
  it('applies simultaneously within a rule: its own output does not retrigger it', () => {
    // a → b / b _  on "baa": only the first a follows a b in the snapshot
    const rules = rule({
      target_phoneme_id: P('a'),
      output: 'b',
      left_context: [phonemeSlot('b')],
    });
    expect(surface(applyRules(word('baa'), rules))).toBe('bba');
  });

  it('applies rules in order, each feeding the next', () => {
    // rule 1: t → d; rule 2: d → b — a t becomes b via feeding
    const rules = [
      ...rule({ target_phoneme_id: P('t'), output: 'd' }),
      ...rule({ target_phoneme_id: P('d'), output: 'b' }),
    ];
    expect(surface(applyRules(word('ta'), rules))).toBe('ba');
    // reversed order: t → d happens last, no feeding
    expect(surface(applyRules(word('ta'), [rules[1], rules[0]]))).toBe('da');
  });

  it('replaced tokens carry the output id for later rules and contexts', () => {
    // t → d, then a → i / d _ : the context must see the *new* d
    const rules = [
      ...rule({ target_phoneme_id: P('t'), output: 'd' }),
      ...rule({
        target_phoneme_id: P('a'),
        output: 'i',
        left_context: [phonemeSlot('d')],
      }),
    ];
    expect(surface(applyRules(word('ta'), rules))).toBe('di');
  });

  it('returns the word unchanged when there are no rules', () => {
    expect(surface(applyRules(word('tati'), []))).toBe('tati');
  });
});

describe('applyRules — deletion (Ø output)', () => {
  it('deletes every occurrence of a phoneme target, shortening the word', () => {
    const rules = rule({ target_phoneme_id: P('t') });
    const result = applyRules(word('tati'), rules);
    expect(surface(result)).toBe('ai');
    expect(result).toHaveLength(2);
  });

  it('deletes every member of a group target', () => {
    const rules = rule({ target_group_id: G_VOWELS });
    expect(surface(applyRules(word('tati'), rules))).toBe('tt');
  });

  it('respects context when deleting', () => {
    // t → Ø / _ #  (word-final t only)
    const rules = rule({
      target_phoneme_id: P('t'),
      right_context: [boundary],
    });
    expect(surface(applyRules(word('tatat'), rules))).toBe('tata');
  });

  it('deletes multiple non-adjacent matches from the same snapshot in one pass', () => {
    // a → Ø / t _ t  on "tatat": both a's sit between two t's
    const rules = rule({
      target_phoneme_id: P('a'),
      left_context: [phonemeSlot('t')],
      right_context: [phonemeSlot('t')],
    });
    expect(surface(applyRules(word('tatat'), rules))).toBe('ttt');
  });

  it('a later rule sees the word as shortened by an earlier deletion', () => {
    // rule 1: t → Ø ; rule 2: a → i / # _ (word-initial a)
    const rules = [
      ...rule({ target_phoneme_id: P('t') }),
      ...rule({
        target_phoneme_id: P('a'),
        output: 'i',
        left_context: [boundary],
      }),
    ];
    // "tata" -> delete t's -> "aa" -> word-initial a -> i -> "ia"
    expect(surface(applyRules(word('tata'), rules))).toBe('ia');
  });

  it('deleting an entire word yields an empty token array', () => {
    const rules = rule({ target_group_id: G_VOWELS });
    const result = applyRules(word('ai'), rules);
    expect(result).toHaveLength(0);
  });
});

import { describe, expect, it } from 'vitest';
import { formatContext, formatPair, formatRule, formatSlot } from '../rule-notation';
import type { RuleContext, RuleCorrespondences } from '../../db/json-shapes';

const P_T = '11111111-1111-4111-8111-111111111111';
const P_D = '22222222-2222-4222-8222-222222222222';
const P_P = '44444444-4444-4444-8444-444444444444';
const P_B = '55555555-5555-4555-8555-555555555555';
const P_K = '66666666-6666-4666-8666-666666666666';
const P_G = '77777777-7777-4777-8777-777777777777';
const G_V = '33333333-3333-4333-8333-333333333333';
const G_N = '11111111-2222-4222-8222-222222222222';

const phonemeSymbolById = new Map([
  [P_T, 't'],
  [P_D, 'd'],
  [P_P, 'p'],
  [P_B, 'b'],
  [P_K, 'k'],
  [P_G, 'g'],
]);
const groupNameById = new Map([
  [G_V, 'V'],
  [G_N, 'N'],
]);

const boundary = { kind: 'boundary' } as const;
const vowel = (optional = false): RuleContext[number] => ({
  kind: 'group',
  groupId: G_V,
  optional,
});
const phoneme = (id: string, optional = false): RuleContext[number] => ({
  kind: 'phoneme',
  phonemeId: id,
  optional,
});

const phonemeFrom = (id: string) => ({ kind: 'phoneme' as const, phonemeId: id });
const groupFrom = (id: string) => ({ kind: 'group' as const, groupId: id });

describe('formatSlot', () => {
  it('renders a boundary as #', () => {
    expect(formatSlot(boundary, phonemeSymbolById, groupNameById)).toBe('#');
  });

  it('renders phoneme symbols and group names', () => {
    expect(formatSlot(phoneme(P_T), phonemeSymbolById, groupNameById)).toBe('t');
    expect(formatSlot(vowel(), phonemeSymbolById, groupNameById)).toBe('V');
  });

  it('wraps optional slots in parentheses', () => {
    expect(formatSlot(vowel(true), phonemeSymbolById, groupNameById)).toBe('(V)');
    expect(formatSlot(phoneme(P_D, true), phonemeSymbolById, groupNameById)).toBe(
      '(d)',
    );
  });

  it('falls back to ? for unknown ids', () => {
    const unknown = '99999999-9999-4999-8999-999999999999';
    expect(
      formatSlot(phoneme(unknown), phonemeSymbolById, groupNameById),
    ).toBe('?');
    expect(
      formatSlot(
        { kind: 'group', groupId: unknown, optional: true },
        phonemeSymbolById,
        groupNameById,
      ),
    ).toBe('(?)');
  });
});

describe('formatContext', () => {
  it('joins slots with spaces', () => {
    expect(
      formatContext([vowel(), boundary], phonemeSymbolById, groupNameById),
    ).toBe('V #');
  });

  it('renders an empty context as an empty string', () => {
    expect(formatContext([], phonemeSymbolById, groupNameById)).toBe('');
  });
});

describe('formatPair', () => {
  it('renders a phoneme-to-phoneme pair', () => {
    expect(
      formatPair(
        { from: phonemeFrom(P_T), to: P_D },
        phonemeSymbolById,
        groupNameById,
      ),
    ).toBe('t → d');
  });

  it('renders a group from-side', () => {
    expect(
      formatPair(
        { from: groupFrom(G_V), to: P_D },
        phonemeSymbolById,
        groupNameById,
      ),
    ).toBe('V → d');
  });

  it('renders a null to-side as ∅', () => {
    expect(
      formatPair(
        { from: phonemeFrom(P_T), to: null },
        phonemeSymbolById,
        groupNameById,
      ),
    ).toBe('t → ∅');
  });
});

describe('formatRule', () => {
  const base: { correspondences: RuleCorrespondences } = {
    correspondences: [{ from: phonemeFrom(P_T), to: P_D }],
  };

  it('elides the environment when both contexts are empty', () => {
    expect(
      formatRule(
        { ...base, left_context: [], right_context: [] },
        phonemeSymbolById,
        groupNameById,
      ),
    ).toBe('t → d');
  });

  it('renders a full environment', () => {
    expect(
      formatRule(
        { ...base, left_context: [vowel()], right_context: [boundary] },
        phonemeSymbolById,
        groupNameById,
      ),
    ).toBe('t → d / V _ #');
  });

  it('renders one-sided environments without dangling spaces', () => {
    expect(
      formatRule(
        { ...base, left_context: [vowel()], right_context: [] },
        phonemeSymbolById,
        groupNameById,
      ),
    ).toBe('t → d / V _');
    expect(
      formatRule(
        { ...base, left_context: [], right_context: [vowel()] },
        phonemeSymbolById,
        groupNameById,
      ),
    ).toBe('t → d / _ V');
  });

  it('uses the group name for a group from-side', () => {
    expect(
      formatRule(
        {
          correspondences: [{ from: groupFrom(G_V), to: P_D }],
          left_context: [],
          right_context: [boundary],
        },
        phonemeSymbolById,
        groupNameById,
      ),
    ).toBe('V → d / _ #');
  });

  it('falls back to ? for unknown from and to ids', () => {
    expect(
      formatRule(
        {
          correspondences: [
            {
              from: phonemeFrom('99999999-9999-4999-8999-999999999999'),
              to: '88888888-8888-4888-8888-888888888888',
            },
          ],
          left_context: [],
          right_context: [],
        },
        phonemeSymbolById,
        groupNameById,
      ),
    ).toBe('? → ?');
  });

  it('renders a null to as ∅ (deletion)', () => {
    expect(
      formatRule(
        {
          correspondences: [{ from: phonemeFrom(P_T), to: null }],
          left_context: [],
          right_context: [],
        },
        phonemeSymbolById,
        groupNameById,
      ),
    ).toBe('t → ∅');
  });

  it('renders a deletion rule with an environment', () => {
    expect(
      formatRule(
        {
          correspondences: [{ from: phonemeFrom(P_T), to: null }],
          left_context: [vowel()],
          right_context: [boundary],
        },
        phonemeSymbolById,
        groupNameById,
      ),
    ).toBe('t → ∅ / V _ #');
  });

  it('renders multiple pairs as comma-joined lists sharing one environment', () => {
    // p, t, k → b, d, g / _ N — the demo language's three rules as one
    expect(
      formatRule(
        {
          correspondences: [
            { from: phonemeFrom(P_P), to: P_B },
            { from: phonemeFrom(P_T), to: P_D },
            { from: phonemeFrom(P_K), to: P_G },
          ],
          left_context: [],
          right_context: [{ kind: 'group', groupId: G_N, optional: false }],
        },
        phonemeSymbolById,
        groupNameById,
      ),
    ).toBe('p, t, k → b, d, g / _ N');
  });

  it('mixes a deletion pair into a multi-pair rendering', () => {
    expect(
      formatRule(
        {
          correspondences: [
            { from: phonemeFrom(P_P), to: null },
            { from: phonemeFrom(P_T), to: P_D },
          ],
          left_context: [],
          right_context: [],
        },
        phonemeSymbolById,
        groupNameById,
      ),
    ).toBe('p, t → ∅, d');
  });
});

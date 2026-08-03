import { describe, expect, it } from 'vitest';
import { formatContext, formatRule, formatSlot } from '../rule-notation';
import type { RuleContext } from '../../db/json-shapes';

const P_T = '11111111-1111-4111-8111-111111111111';
const P_D = '22222222-2222-4222-8222-222222222222';
const G_V = '33333333-3333-4333-8333-333333333333';

const phonemeSymbolById = new Map([
  [P_T, 't'],
  [P_D, 'd'],
]);
const groupNameById = new Map([[G_V, 'V']]);

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

describe('formatRule', () => {
  const base = {
    target_phoneme_id: P_T,
    target_group_id: null,
    output_phoneme_id: P_D,
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

  it('uses the group name for group targets', () => {
    expect(
      formatRule(
        {
          target_phoneme_id: null,
          target_group_id: G_V,
          output_phoneme_id: P_D,
          left_context: [],
          right_context: [boundary],
        },
        phonemeSymbolById,
        groupNameById,
      ),
    ).toBe('V → d / _ #');
  });

  it('falls back to ? for unknown target and output ids', () => {
    expect(
      formatRule(
        {
          target_phoneme_id: '99999999-9999-4999-8999-999999999999',
          target_group_id: null,
          output_phoneme_id: '88888888-8888-4888-8888-888888888888',
          left_context: [],
          right_context: [],
        },
        phonemeSymbolById,
        groupNameById,
      ),
    ).toBe('? → ?');
  });

  it('renders a null output as ∅ (deletion)', () => {
    expect(
      formatRule(
        { ...base, output_phoneme_id: null, left_context: [], right_context: [] },
        phonemeSymbolById,
        groupNameById,
      ),
    ).toBe('t → ∅');
  });

  it('renders a deletion rule with an environment', () => {
    expect(
      formatRule(
        {
          ...base,
          output_phoneme_id: null,
          left_context: [vowel()],
          right_context: [boundary],
        },
        phonemeSymbolById,
        groupNameById,
      ),
    ).toBe('t → ∅ / V _ #');
  });
});

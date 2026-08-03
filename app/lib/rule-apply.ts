import type { RuleContext, RuleCorrespondences } from '../db/json-shapes';

/**
 * One phoneme of a generated word. Generation carries tokens (not a joined
 * string) all the way to rule application because a finished string cannot be
 * re-tokenized unambiguously — multigraph symbols make "tsa" either ts+a or
 * t+s+a (see the same argument in `compilePhonotacticsMatcher`).
 */
export type WordToken = { id: string; symbol: string };

/**
 * The fields of a rule row that compilation needs. Typed structurally (rather
 * than importing the Drizzle row type) so this module stays free of schema
 * imports — pure and unit-testable, like `rule-notation.ts`.
 */
export type RuleParts = {
  correspondences: RuleCorrespondences;
  left_context: RuleContext;
  right_context: RuleContext;
};

/**
 * One environment slot resolved to the phoneme-id set it accepts. A group
 * slot with no members compiles to an empty set: required → never matches,
 * optional → only ever skipped. Mirrors the phonotactics matcher's tolerance
 * of empty groups rather than treating them as an error.
 */
type CompiledContextSlot =
  | { kind: 'match'; ids: ReadonlySet<string>; optional: boolean }
  | { kind: 'boundary' };

/**
 * One resolved correspondence pair: every token whose id is in `fromIds`
 * becomes `output`, or is deleted (Ø) when `output` is null.
 */
type CompiledCorrespondence = {
  fromIds: ReadonlySet<string>;
  output: WordToken | null;
};

/** A rule resolved from ids to the sets and pairs matching needs. */
export type CompiledRule = {
  /**
   * Checked in list order for each word position — the first pair whose
   * `fromIds` contains the token there wins. Order only matters when two
   * pairs' `fromIds` overlap (e.g. a phoneme listed individually and also
   * via a group used by another pair), which `correspondencesSchema` allows.
   */
  correspondences: CompiledCorrespondence[];
  left: CompiledContextSlot[];
  right: CompiledContextSlot[];
};

function compileContext(
  context: RuleContext,
  memberIdsByGroupId: ReadonlyMap<string, ReadonlySet<string>>,
): CompiledContextSlot[] {
  return context.map((slot) => {
    if (slot.kind === 'boundary') return { kind: 'boundary' };
    return {
      kind: 'match',
      ids:
        slot.kind === 'phoneme'
          ? new Set([slot.phonemeId])
          : (memberIdsByGroupId.get(slot.groupId) ?? new Set()),
      optional: slot.optional,
    };
  });
}

function compileCorrespondence(
  pair: RuleCorrespondences[number],
  phonemeSymbolById: ReadonlyMap<string, string>,
  memberIdsByGroupId: ReadonlyMap<string, ReadonlySet<string>>,
): CompiledCorrespondence {
  return {
    fromIds:
      pair.from.kind === 'phoneme'
        ? new Set([pair.from.phonemeId])
        : (memberIdsByGroupId.get(pair.from.groupId) ?? new Set()),
    output:
      pair.to === null
        ? null
        : { id: pair.to, symbol: phonemeSymbolById.get(pair.to) ?? '?' },
  };
}

/**
 * Resolves rule rows (already in application order) into {@link CompiledRule}s.
 * `phonemeSymbolById` only needs entries for every pair's **output** (`to`)
 * phoneme — `from` and context phonemes are matched by id and never rendered.
 * An output id missing from the map yields symbol `'?'` rather than throwing;
 * it cannot happen through the service layer (deletion of a referenced
 * phoneme is blocked), so it is not worth failing generation over. A pair's
 * `to: null` (Ø) compiles to a `null` output rather than a token.
 */
export function compileRules(
  ruleRows: RuleParts[],
  phonemeSymbolById: ReadonlyMap<string, string>,
  memberIdsByGroupId: ReadonlyMap<string, ReadonlySet<string>>,
): CompiledRule[] {
  return ruleRows.map((rule) => ({
    correspondences: rule.correspondences.map((pair) =>
      compileCorrespondence(pair, phonemeSymbolById, memberIdsByGroupId),
    ),
    left: compileContext(rule.left_context, memberIdsByGroupId),
    right: compileContext(rule.right_context, memberIdsByGroupId),
  }));
}

/**
 * Matches `slots` right-to-left against the tokens immediately before `end`.
 * `slotIdx` walks backwards (the last slot sits adjacent to the target);
 * optional slots branch into consume-or-skip, so this is a small backtracking
 * recursion — contexts are a handful of slots, cost is negligible.
 * A boundary slot consumes nothing and matches only at the word's start.
 */
function matchLeft(
  word: WordToken[],
  slots: CompiledContextSlot[],
  slotIdx: number,
  end: number,
): boolean {
  if (slotIdx < 0) return true;
  const slot = slots[slotIdx];
  if (slot.kind === 'boundary')
    return end === 0 && matchLeft(word, slots, slotIdx - 1, end);
  if (slot.optional && matchLeft(word, slots, slotIdx - 1, end)) return true;
  return (
    end > 0 &&
    slot.ids.has(word[end - 1].id) &&
    matchLeft(word, slots, slotIdx - 1, end - 1)
  );
}

/**
 * Mirror of {@link matchLeft}: matches `slots` left-to-right against the
 * tokens from `start` onward (the first slot sits adjacent to the target).
 * A boundary slot consumes nothing and matches only at the word's end.
 */
function matchRight(
  word: WordToken[],
  slots: CompiledContextSlot[],
  slotIdx: number,
  start: number,
): boolean {
  if (slotIdx === slots.length) return true;
  const slot = slots[slotIdx];
  if (slot.kind === 'boundary')
    return start === word.length && matchRight(word, slots, slotIdx + 1, start);
  if (slot.optional && matchRight(word, slots, slotIdx + 1, start)) return true;
  return (
    start < word.length &&
    slot.ids.has(word[start].id) &&
    matchRight(word, slots, slotIdx + 1, start + 1)
  );
}

/**
 * Applies compiled rules to a word, in array order (the caller supplies them
 * in `position` order, so earlier rules feed later ones).
 *
 * Within one rule, application is **simultaneous**: all match sites — and the
 * pair each resolves to — are found against the word as it stood when the
 * rule started, then applied at once. A rule's own output never retriggers
 * the same rule (`a → b / b _` turns "baa" into "bba", not "bbb"), and a
 * deletion never closes a gap that lets a later match site in the same pass
 * see a token that has already moved. Different positions in the same rule
 * can resolve to different pairs' outputs (`p, t, k → b, d, g / _ N` rewrites
 * each place differently in one pass) or to deletion (Ø) — either way the
 * next rule in the pipeline reads the word as it now stands.
 *
 * The input array is not mutated.
 */
export function applyRules(
  word: WordToken[],
  rules: CompiledRule[],
): WordToken[] {
  let current = word;
  for (const rule of rules) {
    const outputs = new Map<number, WordToken | null>();
    for (let i = 0; i < current.length; i++) {
      const pair = rule.correspondences.find((p) => p.fromIds.has(current[i].id));
      if (
        pair &&
        matchLeft(current, rule.left, rule.left.length - 1, i) &&
        matchRight(current, rule.right, 0, i + 1)
      )
        outputs.set(i, pair.output);
    }
    if (outputs.size === 0) continue;
    const next: WordToken[] = [];
    for (let i = 0; i < current.length; i++) {
      if (!outputs.has(i)) next.push(current[i]);
      else {
        const output = outputs.get(i)!;
        if (output !== null) next.push(output);
      }
    }
    current = next;
  }
  return current;
}

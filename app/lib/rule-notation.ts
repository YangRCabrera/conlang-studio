import type { RuleContext, RuleCorrespondences } from '../db/json-shapes';

/**
 * The fields of a rule row that notation formatting needs. Typed structurally
 * (rather than importing the Drizzle row type) so this module stays free of
 * schema imports.
 */
export type RuleNotationParts = {
  correspondences: RuleCorrespondences;
  left_context: RuleContext;
  right_context: RuleContext;
};

/**
 * Renders one context slot in rule notation: `#` for a word boundary, the
 * phoneme symbol or group name otherwise (wrapped in parentheses when the
 * slot is optional). Unknown ids render as `?` rather than throwing — the
 * referenced row may have been renamed away between fetch and render.
 */
export function formatSlot(
  slot: RuleContext[number],
  phonemeSymbolById: Map<string, string>,
  groupNameById: Map<string, string>,
): string {
  if (slot.kind === 'boundary') return '#';
  const label =
    slot.kind === 'phoneme'
      ? (phonemeSymbolById.get(slot.phonemeId) ?? '?')
      : (groupNameById.get(slot.groupId) ?? '?');
  return slot.optional ? `(${label})` : label;
}

/**
 * Renders one side of a rule's environment as space-separated slots.
 * An empty context renders as an empty string ("no restriction on this side").
 */
export function formatContext(
  context: RuleContext,
  phonemeSymbolById: Map<string, string>,
  groupNameById: Map<string, string>,
): string {
  return context
    .map((slot) => formatSlot(slot, phonemeSymbolById, groupNameById))
    .join(' ');
}

/** Renders one correspondence pair's `from` side: a phoneme symbol or group name. */
function formatFrom(
  from: RuleCorrespondences[number]['from'],
  phonemeSymbolById: Map<string, string>,
  groupNameById: Map<string, string>,
): string {
  return from.kind === 'phoneme'
    ? (phonemeSymbolById.get(from.phonemeId) ?? '?')
    : (groupNameById.get(from.groupId) ?? '?');
}

/** Renders one correspondence pair's `to` side: a phoneme symbol, or `∅` for deletion. */
function formatTo(
  to: string | null,
  phonemeSymbolById: Map<string, string>,
): string {
  return to === null ? '∅' : (phonemeSymbolById.get(to) ?? '?');
}

/**
 * Renders one correspondence pair standalone, e.g. `p → b` or `t → ∅` —
 * used for the rule form's per-pair chip display, distinct from
 * {@link formatRule}'s comma-joined whole-rule rendering.
 */
export function formatPair(
  pair: RuleCorrespondences[number],
  phonemeSymbolById: Map<string, string>,
  groupNameById: Map<string, string>,
): string {
  return `${formatFrom(pair.from, phonemeSymbolById, groupNameById)} → ${formatTo(pair.to, phonemeSymbolById)}`;
}

/**
 * Renders a rule in standard phonological notation: `t → d / V _ #`.
 * Multiple correspondence pairs render as comma-joined lists on each side, in
 * pair order — `p, t, k → b, d, g / _ N` — so a single pair (the common case)
 * degenerates to exactly the plain `t → d` form. A pair's `to: null` renders
 * as `∅` (deletion) in that position of the output list.
 * The environment (`/ left _ right`) is elided entirely when both contexts
 * are empty.
 *
 * Pure and dependency-free (like `app/db/json-shapes.ts`), so unlike the rest
 * of `app/lib/*` it is safe to import from Client Components — the rules UI
 * uses it for both row display and the form's live preview.
 */
export function formatRule(
  rule: RuleNotationParts,
  phonemeSymbolById: Map<string, string>,
  groupNameById: Map<string, string>,
): string {
  const target = rule.correspondences
    .map((pair) => formatFrom(pair.from, phonemeSymbolById, groupNameById))
    .join(', ');
  const output = rule.correspondences
    .map((pair) => formatTo(pair.to, phonemeSymbolById))
    .join(', ');

  const left = formatContext(
    rule.left_context,
    phonemeSymbolById,
    groupNameById,
  );
  const right = formatContext(
    rule.right_context,
    phonemeSymbolById,
    groupNameById,
  );
  if (!left && !right) return `${target} → ${output}`;

  const environment = `${left ? `${left} ` : ''}_${right ? ` ${right}` : ''}`;
  return `${target} → ${output} / ${environment}`;
}

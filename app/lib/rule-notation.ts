import type { RuleContext } from '../db/json-shapes';

/**
 * The fields of a rule row that notation formatting needs. Typed structurally
 * (rather than importing the Drizzle row type) so this module stays free of
 * schema imports.
 */
export type RuleNotationParts = {
  target_phoneme_id: string | null;
  target_group_id: string | null;
  output_phoneme_id: string | null;
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

/**
 * Renders a rule in standard phonological notation: `t → d / V _ #`.
 * The environment (`/ left _ right`) is elided entirely when both contexts
 * are empty — an unconditional rewrite reads as just `t → d`. A `null`
 * `output_phoneme_id` renders as `∅` (deletion).
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
  const target =
    rule.target_phoneme_id !== null
      ? (phonemeSymbolById.get(rule.target_phoneme_id) ?? '?')
      : rule.target_group_id !== null
        ? (groupNameById.get(rule.target_group_id) ?? '?')
        : '?';
  const output =
    rule.output_phoneme_id === null
      ? '∅'
      : (phonemeSymbolById.get(rule.output_phoneme_id) ?? '?');

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

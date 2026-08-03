'use server';

import { rules } from '@/app/db/schema';
import { getOrCreateDbUser } from '@/app/lib/current-user';
import { Result } from '@/app/lib/result';
import {
  createRuleSvc,
  deleteRuleSvc,
  moveRuleSvc,
  updateRuleSvc,
} from '@/app/lib/rules';
import { revalidatePath } from 'next/cache';

type Rule = typeof rules.$inferSelect;

/**
 * Rebuilds the service input from the rule form's fields. The contexts are
 * structured arrays shipped as JSON-encoded hidden inputs (same pattern as the
 * syllable structure form's `template`), so they are parsed here; a parse
 * failure returns a field-shaped validation Result instead of forwarding.
 * The target radio (`target_kind`) + picker (`target_id`) pair is translated
 * into the XOR `target_phoneme_id`/`target_group_id` fields the schema expects.
 * `output_phoneme_id` is sent as `undefined` when the form's ∅ option is
 * selected (an empty string), which the schema treats as deletion.
 */
function ruleInputFromForm(formData: FormData): Result<never> | { ok: true; data: unknown } {
  const contexts: Record<'left_context' | 'right_context', unknown> = {
    left_context: undefined,
    right_context: undefined,
  };
  for (const field of ['left_context', 'right_context'] as const) {
    try {
      contexts[field] = JSON.parse(String(formData.get(field)));
    } catch {
      return {
        ok: false,
        kind: 'validation',
        issues: { properties: { [field]: { errors: ['Invalid JSON'] } } },
      };
    }
  }

  const targetKind = String(formData.get('target_kind'));
  const targetId = String(formData.get('target_id'));
  const rawOutput = formData.get('output_phoneme_id');

  return {
    ok: true,
    data: {
      target_phoneme_id: targetKind === 'phoneme' ? targetId : undefined,
      target_group_id: targetKind === 'group' ? targetId : undefined,
      output_phoneme_id: rawOutput ? String(rawOutput) : undefined,
      left_context: contexts.left_context,
      right_context: contexts.right_context,
    },
  };
}

/**
 * Server Action: creates a new rule for the given language, appended to the
 * end of the application order.
 */
export async function createRule(
  languageId: string,
  _prevState: Result<Rule> | null,
  formData: FormData,
): Promise<Result<Rule>> {
  const user = await getOrCreateDbUser();
  if (!user) return { ok: false, kind: 'unauthorized' };

  const input = ruleInputFromForm(formData);
  if (!input.ok) return input;

  const result = await createRuleSvc(user, languageId, input.data);

  if (result.ok) revalidatePath(`/languages/${languageId}/rules`);
  return result;
}

/**
 * Server Action: replaces a rule's target, output, and contexts.
 * `position` is not editable here — reordering goes through {@link moveRule}.
 */
export async function updateRule(
  languageId: string,
  ruleId: string,
  _prevState: Result<Rule> | null,
  formData: FormData,
): Promise<Result<Rule>> {
  const user = await getOrCreateDbUser();
  if (!user) return { ok: false, kind: 'unauthorized' };

  const input = ruleInputFromForm(formData);
  if (!input.ok) return input;

  const result = await updateRuleSvc(user, ruleId, input.data);

  if (result.ok) revalidatePath(`/languages/${languageId}/rules`);
  return result;
}

/**
 * Server Action: moves a rule one step up or down in the application order.
 * All three ids are bound at render time; the form body is unused.
 */
export async function moveRule(
  languageId: string,
  ruleId: string,
  direction: 'up' | 'down',
  _prevState: Result<Rule> | null,
  _formData: FormData,
): Promise<Result<Rule>> {
  const user = await getOrCreateDbUser();
  if (!user) return { ok: false, kind: 'unauthorized' };

  const result = await moveRuleSvc(user, ruleId, { direction });

  if (result.ok) revalidatePath(`/languages/${languageId}/rules`);
  return result;
}

/**
 * Server Action: deletes a rule. `languageId` is used only for cache
 * revalidation after a successful delete; ownership is enforced in the service.
 */
export async function deleteRule(
  languageId: string,
  ruleId: string,
  _prevState: Result<Rule> | null,
  _formData: FormData,
): Promise<Result<Rule>> {
  const user = await getOrCreateDbUser();
  if (!user) return { ok: false, kind: 'unauthorized' };

  const result = await deleteRuleSvc(user, ruleId);

  if (result.ok) revalidatePath(`/languages/${languageId}/rules`);
  return result;
}

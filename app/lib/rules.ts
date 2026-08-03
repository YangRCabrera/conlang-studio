import { and, asc, desc, eq, gt, inArray, lt, sql } from 'drizzle-orm';
import { db } from '../db';
import {
  group_memberships,
  phoneme_groups,
  phonemes,
  rules,
  users,
} from '../db/schema';
import type { RuleContext, RuleCorrespondences } from '../db/json-shapes';
import { compileRules, type CompiledRule } from './rule-apply';
import {
  createRuleInputSchema,
  moveRuleInputSchema,
  updateRuleInputSchema,
} from '../db/validation';
import { notFound, validationMessage, type Result } from './result';
import { parseInput, parseUuid } from './parse';
import {
  ownedLanguageIds,
  parseAndRequireOwnedLanguage,
  parseAndRequireVisibleLanguage,
} from './ownership';

type DbUser = typeof users.$inferSelect;
type Rule = typeof rules.$inferSelect;

/** The parsed shape shared by `createRuleInputSchema` and `updateRuleInputSchema`. */
type RuleInput = {
  correspondences: RuleCorrespondences;
  left_context: RuleContext;
  right_context: RuleContext;
};

/**
 * Collects every phoneme and group id a rule references: each correspondence
 * pair's `from` and `to` (a `to: null` pair is deletion — no id to collect)
 * plus the slots inside both jsonb contexts. Boundary slots carry no id and
 * are skipped. Not `separateTemplateIds` from wordgen — that helper assumes
 * every non-phoneme slot is a group, which is false once boundaries exist.
 */
function collectRuleReferenceIds(input: RuleInput): {
  phonemeIds: Set<string>;
  groupIds: Set<string>;
} {
  const phonemeIds = new Set<string>();
  const groupIds = new Set<string>();

  for (const pair of input.correspondences) {
    if (pair.from.kind === 'phoneme') phonemeIds.add(pair.from.phonemeId);
    else groupIds.add(pair.from.groupId);
    if (pair.to !== null) phonemeIds.add(pair.to);
  }

  for (const slot of [...input.left_context, ...input.right_context]) {
    if (slot.kind === 'phoneme') phonemeIds.add(slot.phonemeId);
    else if (slot.kind === 'group') groupIds.add(slot.groupId);
  }
  return { phonemeIds, groupIds };
}

/**
 * Verifies that every phoneme and group id referenced by `input` exists in
 * `languageId`. None of these ids have a DB FK (they all live in jsonb —
 * `correspondences`, `left_context`, `right_context`), so this is the only
 * check standing between a rule and a dangling reference before writing.
 */
async function validateRuleReferences(
  input: RuleInput,
  languageId: string,
): Promise<boolean> {
  const { phonemeIds, groupIds } = collectRuleReferenceIds(input);

  const [foundPhonemes, foundGroups] = await Promise.all([
    phonemeIds.size
      ? db
          .select({ id: phonemes.id })
          .from(phonemes)
          .where(
            and(
              inArray(phonemes.id, [...phonemeIds]),
              eq(phonemes.language_id, languageId),
            ),
          )
      : ([] as { id: string }[]),
    groupIds.size
      ? db
          .select({ id: phoneme_groups.id })
          .from(phoneme_groups)
          .where(
            and(
              inArray(phoneme_groups.id, [...groupIds]),
              eq(phoneme_groups.language_id, languageId),
            ),
          )
      : ([] as { id: string }[]),
  ]);

  return (
    foundPhonemes.length === phonemeIds.size &&
    foundGroups.length === groupIds.size
  );
}

const badReferencesResult = () =>
  validationMessage(
    'One or more phoneme or group IDs in the rule do not exist in this language.',
  );

/**
 * Checks whether any rule in `languageId` still references `id` — inside a
 * correspondence pair's `from` (`'phonemeId'`/`'groupId'` nested under
 * `from`) or `to` (a bare phoneme id, only relevant when `key` is
 * `'phonemeId'`), or inside a context's jsonb slots. Shared by
 * `deletePhonemeSvc` and `deletePhonemeGroupSvc`: none of these ids have a DB
 * FK (they live in jsonb), so this check is the only thing standing between
 * a delete and a rule left pointing at a phoneme/group that no longer exists.
 */
export async function isReferencedInRules(
  languageId: string,
  key: 'phonemeId' | 'groupId',
  id: string,
): Promise<boolean> {
  const toMatch = key === 'phonemeId' ? sql`OR pair->>'to' = ${id}` : sql``;

  const { rows } = await db.execute(
    sql`SELECT EXISTS (
      SELECT 1
      FROM rules AS r
      WHERE r.language_id = ${languageId}
      AND (
        EXISTS (
          SELECT 1
          FROM jsonb_array_elements(r.correspondences) AS pair
          WHERE pair->'from'->>${key} = ${id}
          ${toMatch}
        )
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(r.left_context || r.right_context) AS slot
          WHERE slot->>${key} = ${id}
        )
      )
    ) AS referenced`,
  );
  return Boolean(rows[0].referenced);
}

/**
 * Loads a language's rules in application order and resolves them into
 * {@link CompiledRule}s for word generation. Not a `Svc` function: it takes a
 * trusted `languageId` from a service that already verified ownership
 * (`generateWordSvc`), not raw client input.
 *
 * Only every pair's **output** (`to`) phonemes' symbols are fetched — `from`
 * and context phonemes are matched by id, and those ids cannot dangle because
 * deleting a rule-referenced phoneme/group is blocked (`isReferencedInRules`).
 * Groups resolve to their current member-id sets; a group emptied since the
 * rule was written simply never matches (same tolerance as the phonotactics
 * matcher).
 */
export async function loadCompiledRules(
  languageId: string,
): Promise<CompiledRule[]> {
  const ruleRows = await db
    .select()
    .from(rules)
    .where(eq(rules.language_id, languageId))
    .orderBy(asc(rules.position), asc(rules.id));
  if (ruleRows.length === 0) return [];

  const outputIds = new Set<string>();
  const groupIds = new Set<string>();
  for (const rule of ruleRows) {
    for (const pair of rule.correspondences) {
      if (pair.to !== null) outputIds.add(pair.to);
      if (pair.from.kind === 'group') groupIds.add(pair.from.groupId);
    }
    for (const slot of [...rule.left_context, ...rule.right_context]) {
      if (slot.kind === 'group') groupIds.add(slot.groupId);
    }
  }

  const [outputPhonemes, memberships] = await Promise.all([
    db
      .select({ id: phonemes.id, symbol: phonemes.symbol })
      .from(phonemes)
      .where(inArray(phonemes.id, [...outputIds])),
    groupIds.size
      ? db
          .select({
            group_id: group_memberships.group_id,
            phoneme_id: group_memberships.phoneme_id,
          })
          .from(group_memberships)
          .where(inArray(group_memberships.group_id, [...groupIds]))
      : ([] as { group_id: string; phoneme_id: string }[]),
  ]);

  const phonemeSymbolById = new Map(outputPhonemes.map((p) => [p.id, p.symbol]));
  const memberIdsByGroupId = new Map<string, Set<string>>();
  for (const { group_id, phoneme_id } of memberships) {
    let members = memberIdsByGroupId.get(group_id);
    if (!members) memberIdsByGroupId.set(group_id, (members = new Set()));
    members.add(phoneme_id);
  }

  return compileRules(ruleRows, phonemeSymbolById, memberIdsByGroupId);
}

/**
 * Returns all rules for a language in application order, verifying that the
 * language is owned by `user` or is public (`user` may be `null` for an
 * anonymous visitor). Ordered by `position` with `id` as a deterministic
 * tie-break (positions can't collide via the move operation, but the
 * ordering costs nothing to make total).
 */
export async function listRulesSvc(
  user: DbUser | null,
  rawLanguageId: unknown,
): Promise<Result<Rule[]>> {
  const lang = await parseAndRequireVisibleLanguage(user, rawLanguageId);
  if (!lang.ok) return lang;

  const rows = await db
    .select()
    .from(rules)
    .where(eq(rules.language_id, lang.data.id))
    .orderBy(asc(rules.position), asc(rules.id));

  return { ok: true, data: rows };
}

/**
 * Creates a new rule for a language owned by `user`, appended to the end of
 * the language's application order. `position` is computed inside the INSERT
 * (`MAX(position) + 1` scoped to the language) rather than read first, so two
 * concurrent creates can't both observe the same max.
 * Returns `{ ok: false, kind: 'validation' }` if the rule references phoneme
 * or group ids that do not exist in this language.
 */
export async function createRuleSvc(
  user: DbUser,
  rawLanguageId: unknown,
  rawInput: unknown,
): Promise<Result<Rule>> {
  const lang = await parseAndRequireOwnedLanguage(user, rawLanguageId);
  if (!lang.ok) return lang;

  const input = parseInput(createRuleInputSchema, rawInput);
  if (!input.ok) return input;

  const valid = await validateRuleReferences(input.data, lang.data.id);
  if (!valid) return badReferencesResult();

  const [created] = await db
    .insert(rules)
    .values({
      language_id: lang.data.id,
      position: sql`(SELECT COALESCE(MAX(${rules.position}) + 1, 0) FROM ${rules} WHERE ${rules.language_id} = ${lang.data.id})`,
      correspondences: input.data.correspondences,
      left_context: input.data.left_context,
      right_context: input.data.right_context,
    })
    .returning();

  return { ok: true, data: created };
}

/**
 * Replaces a rule's correspondences and contexts (full replace — `position`
 * is only changed via {@link moveRuleSvc}). Fetches the rule first to obtain
 * its `language_id` for the reference check; ownership is enforced via the
 * languages subquery since rules carry no `user_id`.
 */
export async function updateRuleSvc(
  user: DbUser,
  rawRuleId: unknown,
  rawInput: unknown,
): Promise<Result<Rule>> {
  const id = parseUuid(rawRuleId);
  if (!id.ok) return id;

  const input = parseInput(updateRuleInputSchema, rawInput);
  if (!input.ok) return input;

  const [existing] = await db
    .select()
    .from(rules)
    .where(
      and(
        eq(rules.id, id.data),
        inArray(rules.language_id, ownedLanguageIds(user)),
      ),
    )
    .limit(1);
  if (!existing) return notFound();

  const valid = await validateRuleReferences(input.data, existing.language_id);
  if (!valid) return badReferencesResult();

  const [updated] = await db
    .update(rules)
    .set({
      correspondences: input.data.correspondences,
      left_context: input.data.left_context,
      right_context: input.data.right_context,
    })
    .where(eq(rules.id, id.data))
    .returning();

  if (!updated) return notFound();
  return { ok: true, data: updated };
}

/**
 * Moves a rule one step earlier (`up`) or later (`down`) in its language's
 * application order by swapping `position` with its nearest neighbor.
 * Moving past the edge (the first rule up, the last rule down) is a no-op
 * success — idempotent, and the UI disables those buttons anyway.
 *
 * The swap is a single UPDATE with a CASE over both ids rather than two
 * statements in a transaction: the neon-http driver has no transaction
 * support, and one statement is atomic regardless.
 */
export async function moveRuleSvc(
  user: DbUser,
  rawRuleId: unknown,
  rawInput: unknown,
): Promise<Result<Rule>> {
  const id = parseUuid(rawRuleId);
  if (!id.ok) return id;

  const input = parseInput(moveRuleInputSchema, rawInput);
  if (!input.ok) return input;

  const [rule] = await db
    .select()
    .from(rules)
    .where(
      and(
        eq(rules.id, id.data),
        inArray(rules.language_id, ownedLanguageIds(user)),
      ),
    )
    .limit(1);
  if (!rule) return notFound();

  const up = input.data.direction === 'up';
  const [neighbor] = await db
    .select()
    .from(rules)
    .where(
      and(
        eq(rules.language_id, rule.language_id),
        up
          ? lt(rules.position, rule.position)
          : gt(rules.position, rule.position),
      ),
    )
    .orderBy(up ? desc(rules.position) : asc(rules.position))
    .limit(1);
  if (!neighbor) return { ok: true, data: rule };

  await db
    .update(rules)
    .set({
      position: sql`CASE
        WHEN ${rules.id} = ${rule.id}::uuid THEN ${neighbor.position}::int
        WHEN ${rules.id} = ${neighbor.id}::uuid THEN ${rule.position}::int
      END`,
    })
    .where(inArray(rules.id, [rule.id, neighbor.id]));

  return { ok: true, data: { ...rule, position: neighbor.position } };
}

/**
 * Deletes a rule, verifying ownership through the language table. Remaining
 * rules keep their positions — gaps are fine, ordering is relative.
 * Returns `{ ok: false, kind: 'not_found' }` if the rule doesn't exist or
 * belongs to another user's language.
 */
export async function deleteRuleSvc(
  user: DbUser,
  rawRuleId: unknown,
): Promise<Result<Rule>> {
  const id = parseUuid(rawRuleId);
  if (!id.ok) return id;

  const [deleted] = await db
    .delete(rules)
    .where(
      and(
        eq(rules.id, id.data),
        inArray(rules.language_id, ownedLanguageIds(user)),
      ),
    )
    .returning();

  if (!deleted) return notFound();
  return { ok: true, data: deleted };
}

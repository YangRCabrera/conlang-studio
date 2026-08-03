import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/app/db';
import { phonemes, users } from '@/app/db/schema';
import {
  createPhonemeInputSchema,
  updatePhonemeInputSchema,
} from '@/app/db/validation';
import { conflict, notFound, validationMessage, type Result } from './result';
import { parseUuid, parseInput } from './parse';
import {
  isUniqueViolation,
  ownedLanguageIds,
  parseAndRequireOwnedLanguage,
  parseAndRequireVisibleLanguage,
} from './ownership';
import { isReferencedInSyllableTemplates } from './syllables';
import { isReferencedInRules } from './rules';

type Phoneme = typeof phonemes.$inferSelect;
type DbUser = typeof users.$inferSelect;

function duplicateSymbolResult() {
  return validationMessage({
    properties: {
      symbol: {
        errors: ['A phoneme with this symbol already exists for this language.'],
      },
    },
  });
}

/**
 * Returns all phonemes for a language, verifying that the language is owned by
 * `user` or is public. `user` may be `null` for an anonymous visitor viewing a
 * public language.
 * Returns `{ ok: false, kind: 'not_found' }` if the language doesn't exist or is neither public nor owned by `user`.
 */
export async function listPhonemesSvc(
  user: DbUser | null,
  rawLanguageId: unknown,
): Promise<Result<Phoneme[]>> {
  const lang = await parseAndRequireVisibleLanguage(user, rawLanguageId);
  if (!lang.ok) return lang;

  const rows = await db
    .select()
    .from(phonemes)
    .where(eq(phonemes.language_id, lang.data.id));

  return { ok: true, data: rows };
}

/**
 * Creates a new phoneme for a language owned by `user`.
 * `language_id` comes from the route, not client input — ownership is verified before insert.
 * Returns `{ ok: false, kind: 'not_found' }` if the language doesn't exist or belongs to another user.
 * Returns `{ ok: false, kind: 'validation' }` if a phoneme with the same symbol already exists in the language
 * (enforced by a DB unique constraint, since a check-then-insert would race).
 */
export async function createPhonemeSvc(
  user: DbUser,
  rawLanguageId: unknown,
  rawInput: unknown,
): Promise<Result<Phoneme>> {
  const lang = await parseAndRequireOwnedLanguage(user, rawLanguageId);
  if (!lang.ok) return lang;

  const input = parseInput(createPhonemeInputSchema, rawInput);
  if (!input.ok) return input;

  try {
    const [created] = await db
      .insert(phonemes)
      .values({
        language_id: lang.data.id,
        symbol: input.data.symbol,
        ipa: input.data.ipa,
        weight: input.data.weight ?? 1.0,
      })
      .returning();

    return { ok: true, data: created };
  } catch (error: unknown) {
    if (isUniqueViolation(error)) return duplicateSymbolResult();
    throw error;
  }
}

/**
 * Updates a phoneme's symbol and/or weight.
 * Ownership is verified by requiring the phoneme's `language_id` to belong to `user`
 * via a subquery on the languages table — there is no direct `user_id` on phonemes.
 * Returns `{ ok: false, kind: 'validation' }` if the new symbol collides with another phoneme in the language.
 */
export async function updatePhonemeSvc(
  user: DbUser,
  rawId: unknown,
  rawInput: unknown,
): Promise<Result<Phoneme>> {
  const id = parseUuid(rawId);
  if (!id.ok) return id;

  const input = parseInput(updatePhonemeInputSchema, rawInput);
  if (!input.ok) return input;

  try {
    const [updated] = await db
      .update(phonemes)
      .set(input.data)
      .where(
        and(
          eq(phonemes.id, id.data),
          inArray(phonemes.language_id, ownedLanguageIds(user)),
        ),
      )
      .returning();

    if (!updated) return notFound();
    return { ok: true, data: updated };
  } catch (error: unknown) {
    if (isUniqueViolation(error)) return duplicateSymbolResult();
    throw error;
  }
}

/**
 * Deletes a phoneme, verifying ownership through the language table.
 * Returns `{ ok: false, kind: 'not_found' }` if the phoneme doesn't exist or belongs to another user's language.
 * Returns `{ ok: false, kind: 'conflict' }` if any syllable structure template or rule
 * references this phoneme — the caller should prompt the user to remove it from those first.
 */
export async function deletePhonemeSvc(
  user: DbUser,
  rawId: unknown,
): Promise<Result<Phoneme>> {
  const id = parseUuid(rawId);
  if (!id.ok) return id;

  const [phoneme] = await db
    .select()
    .from(phonemes)
    .where(
      and(
        eq(phonemes.id, id.data),
        inArray(phonemes.language_id, ownedLanguageIds(user)),
      ),
    )
    .limit(1);
  if (!phoneme) return notFound();

  const [inTemplates, inRules] = await Promise.all([
    isReferencedInSyllableTemplates(
      phoneme.language_id,
      'phonemeId',
      phoneme.id,
    ),
    isReferencedInRules(phoneme.language_id, 'phonemeId', phoneme.id),
  ]);
  if (inTemplates || inRules) return conflict();

  const [deleted] = await db
    .delete(phonemes)
    .where(eq(phonemes.id, id.data))
    .returning();

  if (!deleted) return notFound();
  return { ok: true, data: deleted };
}

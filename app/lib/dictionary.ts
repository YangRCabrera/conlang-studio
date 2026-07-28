import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import {
  lexemes,
  senses,
  syllable_structures,
  tags,
  users,
} from '../db/schema';
import {
  addGeneratedLexemeInputSchema,
  createLexemeInputSchema,
  createSenseSchema,
  updateLexemeInputSchema,
  updateSenseInputSchema,
} from '../db/validation';
import { notFound, validationMessage, type Result } from './result';
import { parseUuid, parseInput } from './parse';
import {
  isUniqueViolation,
  ownedLanguageIds,
  parseAndRequireOwnedLanguage,
  parseAndRequireVisibleLanguage,
} from './ownership';
import { compilePhonotacticsMatcher } from './phonotactics';
import { loadLiteralTemplates } from './wordgen';

type Lexeme = typeof lexemes.$inferSelect;
type Sense = typeof senses.$inferSelect;
type Tag = typeof tags.$inferSelect;
type DbUser = typeof users.$inferSelect;

type CompleteLexeme = Lexeme & {
  senses: Sense[];
  tags: Tag[];
};

/**
 * A dictionary row plus `fits_phonotactics` — computed at read time against
 * the language's full syllable-template inventory, NOT a stored column.
 * `null` means the language has no syllable structures yet, so legality is
 * undefined (as opposed to `false`, which means the term was checked and
 * cannot be segmented into legal syllables).
 */
type CheckedLexeme = CompleteLexeme & { fits_phonotactics: boolean | null };

/**
 * Subquery of lexeme ids reachable through a language owned by `user` — the
 * lexeme half of the sense → lexeme → language → user ownership chain.
 */
function ownedLexemeIds(user: DbUser) {
  return db
    .select({ id: lexemes.id })
    .from(lexemes)
    .where(inArray(lexemes.language_id, ownedLanguageIds(user)));
}

/**
 * Returns all lexemes for a language including senses, tags, and a
 * `fits_phonotactics` flag (see {@link CheckedLexeme} — legality is checked
 * against ALL of the language's syllable structures, unlike generation which
 * uses a user-selected subset), verifying that the language is owned by
 * `user` or is public (`user` may be `null` for an anonymous visitor).
 * Returns `{ ok: false, kind: 'not_found' }` if the language doesn't exist or is neither public nor owned by `user`.
 */
export async function getDictionarySvc(
  user: DbUser | null,
  rawLanguageId: unknown,
): Promise<Result<CheckedLexeme[]>> {
  const lang = await parseAndRequireVisibleLanguage(user, rawLanguageId);
  if (!lang.ok) return lang;

  const [rows, structures] = await Promise.all([
    db.query.lexemes.findMany({
      where: eq(lexemes.language_id, lang.data.id),
      with: {
        senses: true,
        tags: { with: { tag: true } },
      },
    }),
    db
      .select()
      .from(syllable_structures)
      .where(eq(syllable_structures.language_id, lang.data.id)),
  ]);

  const matches = structures.length
    ? compilePhonotacticsMatcher(
        (await loadLiteralTemplates(structures)).templates,
      )
    : null;

  return {
    ok: true,
    data: rows.map(({ tags, ...row }) => ({
      ...row,
      tags: tags.map(({ tag }) => tag as Tag),
      fits_phonotactics: matches ? matches(row.term) : null,
    })),
  };
}

/** `{ ok: false, kind: 'validation' }` for the one field a lexeme's term can collide on. */
function duplicateTermResult() {
  return validationMessage({
    properties: {
      term: {
        errors: ['A word with this term already exists in this language.'],
      },
    },
  });
}

/**
 * Banks a word produced by the wordgen page into the dictionary as a new lexeme,
 * verifying that the language is owned by `user`. `origin` is hardcoded to 'generated'
 * here rather than taken from `rawInput` — this service is specifically the wordgen
 * banking call site referenced in `createLexemeSchema`'s JSDoc; a future manual-entry
 * call site would set 'manual' the same way, not via client input.
 * Returns `{ ok: false, kind: 'validation' }` if the term already exists in the language
 * (enforced by the DB's `unique(language_id, term)` constraint, not a pre-check select —
 * that would race two concurrent inserts).
 */
export async function addGeneratedWordSvc(
  user: DbUser,
  rawLanguageId: unknown,
  rawInput: unknown,
): Promise<Result<Lexeme>> {
  const lang = await parseAndRequireOwnedLanguage(user, rawLanguageId);
  if (!lang.ok) return lang;

  const input = parseInput(addGeneratedLexemeInputSchema, rawInput);
  if (!input.ok) return input;

  try {
    const [row] = await db
      .insert(lexemes)
      .values({
        language_id: lang.data.id,
        term: input.data.term,
        origin: 'generated',
      })
      .returning();

    return { ok: true, data: row };
  } catch (error: unknown) {
    if (isUniqueViolation(error)) return duplicateTermResult();
    throw error;
  }
}

/**
 * Adds a manually-entered word to the dictionary as a new lexeme, verifying
 * that the language is owned by `user`.
 * Returns `{ ok: false, kind: 'validation' }` if the term already exists in the language
 * (see {@link addGeneratedWordSvc} for why this is a caught DB constraint, not a pre-check).
 */
export async function addManualWordSvc(
  user: DbUser,
  rawLanguageId: unknown,
  rawInput: unknown,
): Promise<Result<Lexeme>> {
  const lang = await parseAndRequireOwnedLanguage(user, rawLanguageId);
  if (!lang.ok) return lang;

  const input = parseInput(createLexemeInputSchema, rawInput);
  if (!input.ok) return input;

  try {
    const [row] = await db
      .insert(lexemes)
      .values({
        language_id: lang.data.id,
        term: input.data.term,
        notes: input.data.notes,
        origin: 'manual',
      })
      .returning();

    return { ok: true, data: row };
  } catch (error: unknown) {
    if (isUniqueViolation(error)) return duplicateTermResult();
    throw error;
  }
}

/**
 * Adds a sense to a lexeme. Ownership is verified with a single lookup that
 * requires the lexeme to exist, to belong to the given language, and the
 * language to be owned by `user` — a lexeme id from another user's language
 * (or a language/lexeme mismatch) comes back as `not_found`, never confirming
 * that the row exists.
 */
export async function addSenseToWordSvc(
  user: DbUser,
  rawLanguageId: unknown,
  rawInput: unknown,
): Promise<Result<Sense>> {
  const id = parseUuid(rawLanguageId);
  if (!id.ok) return id;

  const input = parseInput(createSenseSchema, rawInput);
  if (!input.ok) return input;

  const lexeme = await db.query.lexemes.findFirst({
    where: and(
      eq(lexemes.id, input.data.lexeme_id),
      eq(lexemes.language_id, id.data),
      inArray(lexemes.language_id, ownedLanguageIds(user)),
    ),
  });
  if (!lexeme) return notFound();

  const [row] = await db.insert(senses).values(input.data).returning();

  return { ok: true, data: row };
}

/**
 * Updates a lexeme's term and notes, enforcing ownership via the
 * owned-languages subquery inside the UPDATE's WHERE. `origin` is deliberately
 * not updatable — see `updateLexemeInputSchema`.
 */
export async function updateLexemeSvc(
  user: DbUser,
  rawLexemeId: unknown,
  rawInput: unknown,
): Promise<Result<Lexeme>> {
  const id = parseUuid(rawLexemeId);
  if (!id.ok) return id;

  const input = parseInput(updateLexemeInputSchema, rawInput);
  if (!input.ok) return input;

  const [updated] = await db
    .update(lexemes)
    .set(input.data)
    .where(
      and(
        eq(lexemes.id, id.data),
        inArray(lexemes.language_id, ownedLanguageIds(user)),
      ),
    )
    .returning();

  if (!updated) return notFound();
  return { ok: true, data: updated };
}

/**
 * Deletes a lexeme, with the same ownership enforcement as `updateLexemeSvc`.
 * Its senses and tag attachments go with it via `onDelete: 'cascade'`.
 */
export async function deleteLexemeSvc(
  user: DbUser,
  rawId: unknown,
): Promise<Result<Lexeme>> {
  const id = parseUuid(rawId);
  if (!id.ok) return id;

  const [deleted] = await db
    .delete(lexemes)
    .where(
      and(
        eq(lexemes.id, id.data),
        inArray(lexemes.language_id, ownedLanguageIds(user)),
      ),
    )
    .returning();

  if (!deleted) return notFound();
  return { ok: true, data: deleted };
}

/**
 * Updates a sense's part of speech and definition, verifying ownership through
 * the full sense → lexeme → language → user chain inside the UPDATE's WHERE.
 * A well-formed sense id belonging to another user therefore comes back as
 * `not_found`, indistinguishable from an id that matches no row at all.
 */
export async function updateSenseSvc(
  user: DbUser,
  rawSenseId: unknown,
  rawInput: unknown,
): Promise<Result<Sense>> {
  const id = parseUuid(rawSenseId);
  if (!id.ok) return id;

  const input = parseInput(updateSenseInputSchema, rawInput);
  if (!input.ok) return input;

  const [updated] = await db
    .update(senses)
    .set(input.data)
    .where(
      and(
        eq(senses.id, id.data),
        inArray(senses.lexeme_id, ownedLexemeIds(user)),
      ),
    )
    .returning();

  if (!updated) return notFound();
  return { ok: true, data: updated };
}

/**
 * Deletes a sense, with the same chained ownership enforcement as
 * `updateSenseSvc`. Deleting the last sense of a lexeme is allowed — the
 * lexeme itself remains, senses are not required.
 */
export async function deleteSenseSvc(
  user: DbUser,
  rawSenseId: unknown,
): Promise<Result<Sense>> {
  const id = parseUuid(rawSenseId);
  if (!id.ok) return id;

  const [deleted] = await db
    .delete(senses)
    .where(
      and(
        eq(senses.id, id.data),
        inArray(senses.lexeme_id, ownedLexemeIds(user)),
      ),
    )
    .returning();

  if (!deleted) return notFound();
  return { ok: true, data: deleted };
}

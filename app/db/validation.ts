import { z } from 'zod';
import { templateSchema, contextSchema, LEXEME_ORIGINS } from './json-shapes';

/** Validates any UUID string — used to sanitize id params in actions and route handlers. */
export const uuidSchema = z.uuid();

/** Validates the payload for creating a new app user (called internally on first sign-in). */
export const createUserSchema = z.object({
  clerk_id: z.string().min(1),
  email: z.email(),
});

/**
 * Validates the client-supplied body for POST /api/languages.
 * `user_id` is intentionally absent — it is injected server-side from the auth session.
 */
export const createLanguageInputSchema = z.object({
  name: z.string().min(1),
});

/**
 * Validates the client-supplied body for PATCH /api/languages/[id].
 * `id` is intentionally absent — it comes from the route segment, not the request body.
 */
export const updateLanguageInputSchema = z.object({
  name: z.string().min(1),
});

/** Full payload for inserting a language row, including the server-injected `user_id`. */
export const createLanguageSchema = z.object({
  user_id: z.uuid(),
  name: z.string().min(1),
});

/**
 * Validates the client-supplied fields for creating a phoneme.
 * `language_id` is intentionally absent — it comes from the route segment, not the request body.
 */
export const createPhonemeInputSchema = z.object({
  symbol: z.string().min(1),
  ipa: z.string().optional(),
  weight: z.number().min(0).max(2).optional(),
});

/**
 * Validates the client-supplied fields for updating a phoneme.
 * Both fields are optional, but at least one must be provided.
 */
export const updatePhonemeInputSchema = z
  .object({
    symbol: z.string().min(1).optional(),
    weight: z.number().min(0).max(2).optional(),
    ipa: z.string().optional(),
  })
  .refine((v) => v.symbol !== undefined || v.weight !== undefined, {
    message: 'At least one of symbol or weight must be provided',
  });

/** Full insert payload for a phoneme row, including the server-injected `language_id`. */
export const createPhonemeSchema = z.object({
  language_id: z.uuid(),
  symbol: z.string().min(1),
  weight: z.number().min(0).max(2).optional(),
});

/**
 * Validates the client-supplied fields for creating a phoneme group.
 * `language_id` is intentionally absent — it comes from the route segment, not the request body.
 */
export const createPhonemeGroupInputSchema = z.object({
  name: z.string().min(1),
});

/** Validates the client-supplied fields for updating a phoneme group. */
export const updatePhonemeGroupInputSchema = z.object({
  name: z.string().min(1),
});

/** Validates a new named phoneme group (e.g. "vowels", "nasals"). */
export const createPhonemeGroupSchema = z.object({
  language_id: z.uuid(),
  name: z.string().min(1),
});

/** Validates adding a phoneme to a group. */
export const createGroupMembershipSchema = z.object({
  group_id: z.uuid(),
  phoneme_id: z.uuid(),
});

/** Validates a new syllable structure template. `weight` controls how often this shape is chosen. */
export const createSyllableStructureSchema = z.object({
  language_id: z.uuid(),
  template: templateSchema,
  weight: z.number().min(0).max(2).optional(),
});

/**
 * Validates the client-supplied fields for creating a syllable structure.
 * `language_id` is intentionally absent — it comes from the route segment, not the request body.
 */
export const createSyllableStructureInputSchema = z.object({
  template: templateSchema,
  weight: z.number().min(0).max(2).optional(),
});

/** Validates the client-supplied fields for updating a syllable structure. */
export const updateSyllableStructureInputSchema = z.object({
  template: templateSchema,
  weight: z.number().min(0).max(2).optional(),
});

/**
 * Validates a new phonological rewrite rule.
 * Exactly one of `target_phoneme_id` or `target_group_id` must be present —
 * the rule matches either a single phoneme or every member of a group.
 */
export const createRuleSchema = z
  .object({
    language_id: z.uuid(),
    position: z.int().nonnegative(),
    target_phoneme_id: z.uuid().optional(),
    target_group_id: z.uuid().optional(),
    output_phoneme_id: z.uuid(),
    left_context: contextSchema,
    right_context: contextSchema,
  })
  .refine(
    (v) =>
      (v.target_phoneme_id !== undefined) !== (v.target_group_id !== undefined),
    {
      message:
        'Exactly one of target_phoneme_id or target_group_id must be set',
    },
  );

/**
 * Shared shape for creating and updating a phonological rule from client input.
 * `language_id` is intentionally absent — it comes from the route segment, not the request body.
 * `position` is intentionally absent — it is assigned server-side on create (appended to the
 * end of the language's rule order) and changed only through the dedicated move operation.
 * Exactly one of `target_phoneme_id` or `target_group_id` must be present (mirrors the
 * `target_check` DB constraint). Boundary slots are accepted anywhere inside a context —
 * restricting them to the outer edge is deliberately not enforced.
 */
const ruleInputSchema = z
  .object({
    target_phoneme_id: z.uuid().optional(),
    target_group_id: z.uuid().optional(),
    output_phoneme_id: z.uuid(),
    left_context: contextSchema,
    right_context: contextSchema,
  })
  .refine(
    (v) =>
      (v.target_phoneme_id !== undefined) !== (v.target_group_id !== undefined),
    {
      message:
        'Exactly one of target_phoneme_id or target_group_id must be set',
    },
  );

/** Validates the client-supplied fields for creating a phonological rule. See {@link ruleInputSchema}. */
export const createRuleInputSchema = ruleInputSchema;

/**
 * Validates the client-supplied fields for updating a phonological rule.
 * Same shape as {@link createRuleInputSchema} — rule updates are full replacements,
 * not partial patches (the edit form always holds the whole rule).
 */
export const updateRuleInputSchema = ruleInputSchema;

/**
 * Validates the body of a rule reorder request: move the rule one step earlier
 * (`up`) or later (`down`) in its language's application order.
 */
export const moveRuleInputSchema = z.object({
  direction: z.enum(['up', 'down']),
});

/**
 * Validates a new lexeme (dictionary entry). `notes` is optional free-form text.
 * `origin` is intentionally required (no default) here — it is set by the calling
 * service ('manual' from the dictionary create action, 'generated' from wordgen
 * banking), never taken from client input, and the two call sites must say which.
 */
export const createLexemeSchema = z.object({
  term: z.string().min(1),
  notes: z.string().optional(),
  origin: z.enum(LEXEME_ORIGINS),
});

/**
 * Validates the client-supplied body for banking a generated word into the dictionary.
 * `language_id` is intentionally absent (comes from the route segment/action argument) and
 * `origin` is intentionally absent — this operation always sets it to 'generated' server-side.
 */
export const addGeneratedLexemeInputSchema = z.object({
  term: z.string().min(1),
});

/**
 * Validates the client-supplied body for manually adding a word into the dictionary.
 * `language_id` is intentionally absent (comes from the route segment/action argument) and
 * `origin` is intentionally absent — this operation always sets it to 'manual' server-side.
 */
export const createLexemeInputSchema = z.object({
  term: z.string().min(1),
  notes: z.string().optional(),
});

/**
 * Validates the client-supplied fields for updating a lexeme.
 * `origin` is intentionally absent — provenance is set once at creation by the
 * calling service (see `createLexemeSchema`) and editing a word never changes it.
 */
export const updateLexemeInputSchema = z.object({
  term: z.string().min(1),
  notes: z.string().optional(),
});

/**
 * Validates a new sense (meaning) attached to a lexeme. Both `part_of_speech`
 * and `definition` must be non-empty (mirrors the `notNull` DB columns) — a
 * sense is never created half-blank.
 */
export const createSenseSchema = z.object({
  lexeme_id: z.uuid(),
  part_of_speech: z.string().min(1),
  definition: z.string().min(1),
});

/**
 * Validates the client-supplied fields for updating a sense.
 * `lexeme_id` is intentionally absent — a sense can never be moved to another
 * lexeme; the sense being updated is identified by an id argument validated
 * with `uuidSchema`. `definition` must stay non-empty for the same reason as
 * in `createSenseSchema`.
 */
export const updateSenseInputSchema = z.object({
  part_of_speech: z.string().min(1),
  definition: z.string().min(1),
});

/** Validates a new tag for categorizing lexemes within a language. */
export const createTagSchema = z.object({
  language_id: z.uuid(),
  name: z.string().min(1),
});

/**
 * Validates the client-supplied fields for creating a tag.
 * `language_id` is intentionally absent — it comes from the route segment/action argument, not the request body.
 */
export const createTagInputSchema = z.object({
  name: z.string().min(1),
});

/**
 * Validates the client-supplied fields for renaming a tag.
 * A tag's `language_id` is never updatable — a tag can't move to another language.
 */
export const updateTagInputSchema = z.object({
  name: z.string().min(1),
});

/** Validates attaching a tag to a lexeme. */
export const createLexemeTagSchema = z.object({
  lexeme_id: z.uuid(),
  tag_id: z.uuid(),
});

/**
 * Validates the client-supplied body for POST /api/languages/[id]/generate.
 * `language_id` is intentionally absent — it comes from the route segment, not the request body.
 * Deep validation (e.g. maxSyllables >= minSyllables, structures non-empty) is handled in the service.
 */
export const generateWordsInputSchema = z.object({
  wordsToGenerate: z.coerce.number().int().min(1),
  structures: z.array(uuidSchema).min(1),
  minSyllables: z.coerce.number().int().min(1).default(1),
  maxSyllables: z.coerce.number().int().min(1).default(1),
});

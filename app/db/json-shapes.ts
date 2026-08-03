import { z } from 'zod';

/**
 * A slot filled by any phoneme belonging to a named group.
 * Used in syllable templates and phonological rule contexts.
 * `optional` allows the slot to be skipped during word generation/matching.
 */
const groupSlot = z.object({
  kind: z.literal('group'),
  groupId: z.uuid(),
  optional: z.boolean(),
});

/**
 * A slot filled by one specific phoneme.
 * `optional` allows the slot to be skipped during word generation/matching.
 */
const phonemeSlot = z.object({
  kind: z.literal('phoneme'),
  phonemeId: z.uuid(),
  optional: z.boolean(),
});

/** A word-edge marker. Only meaningful inside a rule context, not syllable templates. */
const boundarySlot = z.object({
  kind: z.literal('boundary'),
});

/**
 * Ordered list of slots defining a valid syllable shape (e.g. C V C).
 * Must contain at least one slot. Word boundaries are not permitted here.
 */
export const templateSchema = z
  .array(z.discriminatedUnion('kind', [groupSlot, phonemeSlot]))
  .min(1);

/**
 * Ordered slots for one side of a phonological rule's environment (left or right context).
 * May include word boundary markers. An empty array means "no contextual restriction."
 */
export const contextSchema = z.array(
  z.discriminatedUnion('kind', [groupSlot, phonemeSlot, boundarySlot]),
);

/** A validated syllable template — an ordered sequence of group/phoneme slots. */
export type SyllableTemplate = z.infer<typeof templateSchema>;

/** A validated rule context — the left or right phonological environment of a rule. */
export type RuleContext = z.infer<typeof contextSchema>;

/**
 * The matched side of one correspondence pair: a specific phoneme, or every
 * member of a group. Unlike `groupSlot`/`phonemeSlot` this carries no
 * `optional` flag — a rule's target is never optional.
 */
const correspondenceFrom = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('phoneme'), phonemeId: z.uuid() }),
  z.object({ kind: z.literal('group'), groupId: z.uuid() }),
]);

/**
 * One rewrite pair in a rule's correspondence list: every phoneme matching
 * `from` becomes the phoneme `to`, or is deleted (Ø) when `to` is null.
 */
const correspondenceSchema = z.object({
  from: correspondenceFrom,
  to: z.uuid().nullable(),
});

/**
 * Ordered list of correspondence pairs a rule applies, all sharing the rule's
 * one left/right environment — this is what lets `p, t, k → b, d, g / _ N`
 * be a single rule instead of three. Must contain at least one pair. When a
 * token matches more than one pair's `from` set (e.g. a phoneme listed
 * individually and also via a group), the first matching pair in list order
 * wins — not validated as an error, since overlap is rare but not unreasonable.
 */
export const correspondencesSchema = z.array(correspondenceSchema).min(1);

/** A single validated correspondence pair. See {@link correspondencesSchema}. */
export type RuleCorrespondence = z.infer<typeof correspondenceSchema>;

/** A validated rule's full correspondence list. See {@link correspondencesSchema}. */
export type RuleCorrespondences = z.infer<typeof correspondencesSchema>;

/**
 * How a lexeme's term came into existence: banked from wordgen output, or typed
 * by the user. Set once at creation by the calling service — never client-supplied.
 */
export const LEXEME_ORIGINS = ['generated', 'manual'] as const;

export type LexemeOrigin = (typeof LEXEME_ORIGINS)[number];

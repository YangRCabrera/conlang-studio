import { relations, sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  uuid,
  doublePrecision,
  primaryKey,
  jsonb,
  integer,
  boolean,
  check,
  unique,
  timestamp,
} from 'drizzle-orm/pg-core';
import {
  SyllableTemplate,
  RuleContext,
  RuleCorrespondences,
  LEXEME_ORIGINS,
  LexemeOrigin,
} from './json-shapes';

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

/**
 * Audit columns spread into every table. `updated_at` only advances through
 * Drizzle `db.update(...)` calls (`$onUpdate` is an ORM feature, not a DB
 * trigger) — SQL run outside the app won't bump it. On join tables, whose rows
 * are only ever inserted or deleted, `updated_at` never diverges from
 * `created_at`; it's kept anyway so activity queries can treat tables uniformly.
 */
const timestamps = {
  created_at: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
};

/** App users, one row per Clerk account. Created automatically on first sign-in. */
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  clerk_id: text('clerk_id').notNull().unique(),
  email: text('email').notNull().unique(),
  ...timestamps,
});

/** A constructed language owned by a user. All phonology and lexicon data is scoped under this. */
export const languages = pgTable('languages', {
  id: uuid('id').defaultRandom().primaryKey(),
  user_id: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  /**
   * When true, the language is readable by anyone (owner-only writes still
   * apply) — used for the hand-authored public demo language. Never
   * client-settable; only ever flipped by a direct DB update.
   */
  is_public: boolean('is_public').notNull().default(false),
  ...timestamps,
});

/**
 * Individual sound units (IPA symbols) belonging to a language.
 * `weight` controls how frequently this phoneme is sampled during word generation.
 */
export const phonemes = pgTable(
  'phonemes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    language_id: uuid('language_id')
      .notNull()
      .references(() => languages.id, { onDelete: 'cascade' }),
    symbol: text('symbol').notNull(),
    ipa: text('ipa').default(''),
    weight: doublePrecision('weight').notNull().default(1),
    ...timestamps,
  },
  (t) => [unique().on(t.language_id, t.symbol)],
);

/**
 * Named sets of phonemes (e.g. "vowels", "stops") used as shorthand slots
 * in syllable templates and phonological rules.
 */
export const phoneme_groups = pgTable(
  'phoneme_groups',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    language_id: uuid('language_id')
      .notNull()
      .references(() => languages.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    ...timestamps,
  },
  (t) => [unique().on(t.language_id, t.name)],
);

/** Join table for the many-to-many relationship between phonemes and phoneme groups. */
export const group_memberships = pgTable(
  'group_memberships',
  {
    group_id: uuid('group_id')
      .notNull()
      .references(() => phoneme_groups.id, { onDelete: 'cascade' }),
    phoneme_id: uuid('phoneme_id')
      .notNull()
      .references(() => phonemes.id, { onDelete: 'cascade' }),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.group_id, t.phoneme_id] })],
);

/**
 * Weighted templates defining valid syllable shapes for a language (e.g. CV, CVC, V).
 * A language typically has several structures; `weight` biases how often each is chosen.
 */
export const syllable_structures = pgTable('syllable_structures', {
  id: uuid('id').defaultRandom().primaryKey(),
  language_id: uuid('language_id')
    .notNull()
    .references(() => languages.id, { onDelete: 'cascade' }),
  template: jsonb('template').$type<SyllableTemplate>().notNull(),
  weight: doublePrecision('weight').notNull().default(1.0),
  ...timestamps,
});

/**
 * Phonological rewrite rules applied in `position` order during word generation.
 * `correspondences` is an ordered, non-empty list of `{ from, to }` pairs sharing
 * one `left_context`/`right_context` environment — every phoneme matching a pair's
 * `from` (a specific phoneme or every member of a group) becomes that pair's `to`
 * phoneme, or is deleted (Ø) when `to` is null. A single-pair rule is the common
 * case (`t → d / V _ V`); multiple pairs let one rule express a whole shift
 * (`p, t, k → b, d, g / _ Nasal`) instead of one rule per phoneme.
 * No FK on the ids inside `correspondences` — same as `left_context`/`right_context`,
 * integrity is enforced in the service layer (`validateRuleReferences`,
 * `isReferencedInRules`), not the database.
 */
export const rules = pgTable('rules', {
  id: uuid('id').defaultRandom().primaryKey(),
  language_id: uuid('language_id')
    .notNull()
    .references(() => languages.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  correspondences: jsonb('correspondences')
    .$type<RuleCorrespondences>()
    .notNull(),
  left_context: jsonb('left_context').$type<RuleContext>().notNull(),
  right_context: jsonb('right_context').$type<RuleContext>().notNull(),
  ...timestamps,
});

/**
 * A dictionary entry (word form) in a language. A lexeme can have multiple senses.
 * `origin` records whether the term was banked from wordgen or typed by hand — it
 * drives the (future) irregularity warning, which only applies to manual entries.
 */
export const lexemes = pgTable(
  'lexemes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    language_id: uuid('language_id')
      .notNull()
      .references(() => languages.id, { onDelete: 'cascade' }),
    term: text('term').notNull(),
    notes: text('notes'),
    origin: text('origin').notNull().default('manual').$type<LexemeOrigin>(),
    ...timestamps,
  },
  (t) => [
    check(
      'origin_check',
      sql`${t.origin} IN (${sql.join(
        LEXEME_ORIGINS.map((o) => sql.raw(`'${o}'`)),
        sql.raw(', '),
      )})`,
    ),
    unique().on(t.language_id, t.term),
  ],
);

/** One meaning of a lexeme, with its part of speech and definition. */
export const senses = pgTable('senses', {
  id: uuid('id').defaultRandom().primaryKey(),
  lexeme_id: uuid('lexeme_id')
    .notNull()
    .references(() => lexemes.id, { onDelete: 'cascade' }),
  part_of_speech: text('part_of_speech').notNull(),
  definition: text('definition').notNull(),
  ...timestamps,
});

/** User-defined labels for categorizing lexemes within a language (e.g. "body parts", "verbs"). */
export const tags = pgTable(
  'tags',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    language_id: uuid('language_id')
      .notNull()
      .references(() => languages.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    ...timestamps,
  },
  (t) => [unique().on(t.language_id, t.name)],
);

/** Join table for the many-to-many relationship between lexemes and tags. */
export const lexeme_tags = pgTable(
  'lexeme_tags',
  {
    lexeme_id: uuid('lexeme_id')
      .notNull()
      .references(() => lexemes.id, { onDelete: 'cascade' }),
    tag_id: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.lexeme_id, t.tag_id] })],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const usersRelations = relations(users, ({ many }) => ({
  languages: many(languages),
}));

export const languagesRelations = relations(languages, ({ one, many }) => ({
  user: one(users, { fields: [languages.user_id], references: [users.id] }),
  phonemes: many(phonemes),
  groups: many(phoneme_groups),
  rules: many(rules),
  syllableStructures: many(syllable_structures),
  lexemes: many(lexemes),
  tags: many(tags),
}));

export const phonemesRelations = relations(phonemes, ({ one, many }) => ({
  language: one(languages, {
    fields: [phonemes.language_id],
    references: [languages.id],
  }),
  memberships: many(group_memberships),
}));

export const phonemeGroupsRelations = relations(
  phoneme_groups,
  ({ one, many }) => ({
    language: one(languages, {
      fields: [phoneme_groups.language_id],
      references: [languages.id],
    }),
    memberships: many(group_memberships),
  }),
);

export const groupMembershipsRelations = relations(
  group_memberships,
  ({ one }) => ({
    group: one(phoneme_groups, {
      fields: [group_memberships.group_id],
      references: [phoneme_groups.id],
    }),
    phoneme: one(phonemes, {
      fields: [group_memberships.phoneme_id],
      references: [phonemes.id],
    }),
  }),
);

/**
 * Only the `language` relation is declared — the phoneme/group ids inside
 * `correspondences` (and `left_context`/`right_context`) are jsonb, not FK
 * columns, so Drizzle has nothing to build a relational (`one`/`many`)
 * traversal from; nothing in the app queries rules that way regardless.
 */
export const rulesRelations = relations(rules, ({ one }) => ({
  language: one(languages, {
    fields: [rules.language_id],
    references: [languages.id],
  }),
}));

export const lexemesRelations = relations(lexemes, ({ one, many }) => ({
  language: one(languages, {
    fields: [lexemes.language_id],
    references: [languages.id],
  }),
  senses: many(senses),
  tags: many(lexeme_tags),
}));

export const sensesRelations = relations(senses, ({ one }) => ({
  lexeme: one(lexemes, {
    fields: [senses.lexeme_id],
    references: [lexemes.id],
  }),
}));

export const tagsRelations = relations(tags, ({ one, many }) => ({
  language: one(languages, {
    fields: [tags.language_id],
    references: [languages.id],
  }),
  lexemes: many(lexeme_tags),
}));

export const lexemeTagsRelations = relations(lexeme_tags, ({ one }) => ({
  lexeme: one(lexemes, {
    fields: [lexeme_tags.lexeme_id],
    references: [lexemes.id],
  }),
  tag: one(tags, { fields: [lexeme_tags.tag_id], references: [tags.id] }),
}));

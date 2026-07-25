'use client';

import { lexemes, senses, tags } from '@/app/db/schema';
import { useActionState, useMemo, useRef, useState } from 'react';
import {
  addSenseToLexeme,
  attachTag,
  createLexeme,
  deleteLexeme,
  deleteSense,
  detachTag,
  updateLexeme,
  updateSense,
} from './actions';
import { failureMessage, fieldError } from '@/app/components/action-state';
import { useDeleteFocusRecovery } from '@/app/components/use-delete-focus-recovery';
import TagManager from './tag-manager';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { DeleteConfirmDialog } from '@/app/components/ui/delete-confirm-dialog';
import { FormError } from '@/app/components/ui/form-error';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';

type Lexeme = typeof lexemes.$inferSelect;
type Sense = typeof senses.$inferSelect;
type Tag = typeof tags.$inferSelect;

type CompleteLexeme = Lexeme & {
  senses: Sense[];
  tags: Tag[];
  // Computed server-side against the language's syllable templates;
  // null when the language has no templates to check against.
  fits_phonotactics: boolean | null;
};

/**
 * Form for adding a word to the dictionary by hand (origin 'manual', as
 * opposed to banking from the wordgen). Creates the lexeme only — senses are
 * added afterwards through the entry's edit card, keeping every submit a
 * single-table write. Fields are controlled so they can be cleared after a
 * successful add (the new entry appears via revalidation).
 */
function AddLexemeForm({
  languageId,
  termInputRef,
}: {
  languageId: string;
  termInputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [term, setTerm] = useState('');
  const [notes, setNotes] = useState('');

  // Wraps the action rather than binding it so the fields can be cleared on
  // success right here in the transition — a `useEffect` watching the result
  // would trip react-hooks/set-state-in-effect.
  const [state, formAction, pending] = useActionState(
    async (
      prev: Awaited<ReturnType<typeof createLexeme>> | null,
      formData: FormData,
    ) => {
      const result = await createLexeme(languageId, prev, formData);
      if (result.ok) {
        setTerm('');
        setNotes('');
      }
      return result;
    },
    null,
  );

  const error = failureMessage(state) ?? fieldError(state, 'term');

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="new-term">Term</Label>
        <Input
          ref={termInputRef}
          id="new-term"
          name="term"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          className="font-mono w-40"
        />
      </div>
      <div className="flex flex-col gap-1 flex-1 min-w-48">
        <Label htmlFor="new-notes">Notes</Label>
        <Input
          id="new-notes"
          name="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      <Button type="submit" disabled={pending} className="w-32">
        {pending ? 'Adding…' : 'Add Word'}
      </Button>
      <FormError message={error} className="w-full" />
    </form>
  );
}

/**
 * The Add Sense form inside the edit card — the only place senses are created,
 * so a sense is never born blank. Fields are controlled so they can be cleared
 * after a successful add (the new sense row appears via revalidation).
 */
function AddSenseForm({
  languageId,
  lexemeId,
  deleteLexemePending,
}: {
  languageId: string;
  lexemeId: string;
  deleteLexemePending: boolean;
}) {
  const [pos, setPos] = useState('');
  const [definition, setDefinition] = useState('');

  // Wraps the action rather than binding it so the fields can be cleared on
  // success right here in the transition — a `useEffect` watching the result
  // would trip react-hooks/set-state-in-effect.
  const [state, formAction, pending] = useActionState(
    async (
      prev: Awaited<ReturnType<typeof addSenseToLexeme>> | null,
      formData: FormData,
    ) => {
      const result = await addSenseToLexeme(
        languageId,
        lexemeId,
        prev,
        formData,
      );
      if (result.ok) {
        setPos('');
        setDefinition('');
      }
      return result;
    },
    null,
  );

  const error = failureMessage(state) ?? fieldError(state, 'definition');

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor={`new-pos-${lexemeId}`}>Part of speech</Label>
        <Input
          id={`new-pos-${lexemeId}`}
          name="part_of_speech"
          value={pos}
          onChange={(e) => setPos(e.target.value)}
          className="w-40"
        />
      </div>
      <div className="flex flex-col gap-1 flex-1 min-w-48">
        <Label htmlFor={`new-definition-${lexemeId}`}>Definition</Label>
        <Input
          id={`new-definition-${lexemeId}`}
          name="definition"
          value={definition}
          onChange={(e) => setDefinition(e.target.value)}
        />
      </div>
      <Button
        type="submit"
        disabled={pending || deleteLexemePending}
        className="w-32"
      >
        {pending ? 'Adding…' : 'Add Sense'}
      </Button>
      <FormError message={error} className="w-full" />
    </form>
  );
}

/**
 * One sense inside the edit card, with inline save and delete. Save and Delete
 * are sibling forms (forms can't nest) laid out on one line, each bound to its
 * own action.
 */
function SenseEditRow({
  languageId,
  sense,
  deleteLexemePending,
  fallbackFocusRef,
}: {
  languageId: string;
  sense: Sense;
  deleteLexemePending: boolean;
  fallbackFocusRef: React.RefObject<HTMLElement | null>;
}) {
  const [pos, setPos] = useState(sense.part_of_speech);
  const [definition, setDefinition] = useState(sense.definition);

  const [saveState, saveAction, savePending] = useActionState(
    updateSense.bind(null, languageId, sense.id),
    null,
  );

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const { rowRef, focusOverrideRef, captureFocusTarget } =
    useDeleteFocusRecovery<HTMLLIElement>(fallbackFocusRef);

  const [deleteState, deleteAction, deletePending] = useActionState(
    async (
      prev: Awaited<ReturnType<typeof deleteSense>> | null,
      formData: FormData,
    ) => {
      captureFocusTarget();
      const result = await deleteSense(languageId, sense.id, prev, formData);
      if (result.ok) setDeleteDialogOpen(false);
      return result;
    },
    null,
  );

  const error = failureMessage(saveState) ?? fieldError(saveState, 'definition');

  return (
    <li ref={rowRef} className="flex flex-wrap items-end gap-3">
      <form
        action={saveAction}
        className="flex flex-wrap items-end gap-3 flex-1"
      >
        <div className="flex flex-col gap-1">
          <Label htmlFor={`pos-${sense.id}`}>Part of speech</Label>
          <Input
            id={`pos-${sense.id}`}
            name="part_of_speech"
            value={pos}
            onChange={(e) => setPos(e.target.value)}
            className="w-40"
          />
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-48">
          <Label htmlFor={`definition-${sense.id}`}>Definition</Label>
          <Input
            id={`definition-${sense.id}`}
            name="definition"
            value={definition}
            onChange={(e) => setDefinition(e.target.value)}
          />
        </div>
        <Button
          type="submit"
          disabled={savePending || deletePending || deleteLexemePending}
          className="w-24"
        >
          {savePending ? 'Saving…' : 'Save'}
        </Button>
      </form>
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        focusOverrideRef={focusOverrideRef}
        trigger={
          <Button
            type="button"
            variant="destructive"
            disabled={savePending || deletePending || deleteLexemePending}
            data-delete-trigger
            className="w-24"
          >
            Delete
          </Button>
        }
        title="Delete this sense?"
        description="This removes just this sense (part of speech and definition) from the entry. This can't be undone."
      >
        <form action={deleteAction}>
          <Button
            type="submit"
            variant="destructive"
            disabled={savePending || deletePending || deleteLexemePending}
            className="w-24"
          >
            {deletePending ? 'Deleting…' : 'Delete'}
          </Button>
          <FormError message={failureMessage(deleteState)} className="w-full" />
        </form>
      </DeleteConfirmDialog>
      <FormError message={error} className="w-full" />
    </li>
  );
}

/** One tag chip in the edit card, with its own detach button. */
function TagChip({
  languageId,
  lexemeId,
  tag,
  deleteLexemePending,
}: {
  languageId: string;
  lexemeId: string;
  tag: Tag;
  deleteLexemePending: boolean;
}) {
  const [state, action, pending] = useActionState(
    detachTag.bind(null, languageId, lexemeId, tag.id),
    null,
  );
  const error = failureMessage(state);

  return (
    <form action={action} className="flex flex-col items-start gap-1">
      <Badge variant="secondary" className="text-sm">
        {tag.name}
        <button
          type="submit"
          disabled={pending || deleteLexemePending}
          aria-label={`Remove tag ${tag.name}`}
          title={`Remove tag ${tag.name}`}
          className="cursor-pointer disabled:opacity-50 disabled:cursor-progress"
        >
          ×
        </button>
      </Badge>
      <FormError message={error} className="text-xs" />
    </form>
  );
}

/**
 * Form for attaching a tag to a lexeme, offered as a `<select>` of the
 * language's tags not already on it. Shows a hint instead of the form when
 * there is nothing left to offer (every tag attached, or none exist yet).
 */
function AttachTagForm({
  languageId,
  lexemeId,
  availableTags,
  deleteLexemePending,
}: {
  languageId: string;
  lexemeId: string;
  availableTags: Tag[];
  deleteLexemePending: boolean;
}) {
  const [tagId, setTagId] = useState('');

  const [state, formAction, pending] = useActionState(
    async (
      prev: Awaited<ReturnType<typeof attachTag>> | null,
      formData: FormData,
    ) => {
      const result = await attachTag(languageId, lexemeId, prev, formData);
      if (result.ok) setTagId('');
      return result;
    },
    null,
  );

  const error = failureMessage(state);

  if (availableTags.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        No more tags to add — create one in Manage tags above.
      </p>
    );

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor={`attach-tag-${lexemeId}`}>Add tag</Label>
        <select
          id={`attach-tag-${lexemeId}`}
          name="tag_id"
          value={tagId}
          onChange={(e) => setTagId(e.target.value)}
          className="border rounded p-2 w-40"
          required
        >
          <option value="" disabled>
            Select a tag
          </option>
          {availableTags.map((tag) => (
            <option className="bg-popover" key={tag.id} value={tag.id}>
              {tag.name}
            </option>
          ))}
        </select>
      </div>
      <Button
        type="submit"
        disabled={pending || deleteLexemePending || tagId === ''}
        className="w-24"
      >
        {pending ? 'Adding…' : 'Attach'}
      </Button>
      <FormError message={error} className="w-full" />
    </form>
  );
}

/**
 * Full edit UI for one dictionary entry, shown in place of its view rows: the
 * lexeme's own fields, each sense with inline save/delete, an Add Sense form,
 * tag attach/detach, and entry deletion. Saves are granular — each form
 * commits independently so every submit maps to a single service call and no
 * multi-table transaction is needed. `allTags` is the language's full tag
 * inventory (from the page), used to compute which tags are still available
 * to attach.
 *
 * `deleteEntry` bundles the single delete-lexeme flow that `LexemeEntry`
 * owns (it's the one holding the `<tr>` the focus-recovery hook walks
 * siblings from — see that component) so this card's own "Delete Entry"
 * control, rendered here in edit mode, uses the exact same dialog/action
 * instead of a second independent one.
 */
function LexemeEditCard({
  lexeme,
  allTags,
  close,
  deleteEntry,
}: {
  lexeme: CompleteLexeme;
  allTags: Tag[];
  close: () => void;
  deleteEntry: {
    dialogOpen: boolean;
    setDialogOpen: (open: boolean) => void;
    focusOverrideRef: React.RefObject<HTMLElement | null>;
    action: (payload: FormData) => void;
    pending: boolean;
    state: Awaited<ReturnType<typeof deleteLexeme>> | null;
  };
}) {
  const [term, setTerm] = useState(lexeme.term);
  const [notes, setNotes] = useState(lexeme.notes ?? '');
  // Fallback focus target for sense deletes — distinct from `deleteEntry`,
  // which needs a target outside this card since the whole card unmounts
  // when the entry itself is deleted.
  const senseFallbackFocusRef = useRef<HTMLInputElement>(null);

  const [saveState, saveAction, savePending] = useActionState(
    updateLexeme.bind(null, lexeme.language_id, lexeme.id),
    null,
  );

  const lexemeError = failureMessage(saveState) ?? fieldError(saveState, 'term');

  const availableTags = allTags.filter(
    (tag) => !lexeme.tags.some((t) => t.id === tag.id),
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Lexeme fields */}
      <form action={saveAction} className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`term-${lexeme.id}`}>Term</Label>
          <Input
            ref={senseFallbackFocusRef}
            id={`term-${lexeme.id}`}
            name="term"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            className="font-mono w-40"
          />
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-48">
          <Label htmlFor={`notes-${lexeme.id}`}>Notes</Label>
          <Input
            id={`notes-${lexeme.id}`}
            name="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        <Button
          type="submit"
          disabled={savePending || deleteEntry.pending}
          className="w-24"
        >
          {savePending ? 'Saving…' : 'Save'}
        </Button>
        <FormError message={lexemeError} className="w-full" />
      </form>

      {/* Senses */}
      <div className="flex flex-col gap-2 border-t pt-3">
        <p className="font-semibold text-sm">Senses</p>
        {lexeme.senses.length > 0 && (
          <ul className="flex flex-col gap-2">
            {lexeme.senses.map((sense) => (
              <SenseEditRow
                key={sense.id}
                languageId={lexeme.language_id}
                sense={sense}
                deleteLexemePending={deleteEntry.pending}
                fallbackFocusRef={senseFallbackFocusRef}
              />
            ))}
          </ul>
        )}
        <AddSenseForm
          languageId={lexeme.language_id}
          lexemeId={lexeme.id}
          deleteLexemePending={deleteEntry.pending}
        />
      </div>

      {/* Tags */}
      <div className="flex flex-col gap-2 border-t pt-3">
        <p className="font-semibold text-sm">Tags</p>
        {lexeme.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {lexeme.tags.map((tag) => (
              <TagChip
                key={tag.id}
                languageId={lexeme.language_id}
                lexemeId={lexeme.id}
                tag={tag}
                deleteLexemePending={deleteEntry.pending}
              />
            ))}
          </div>
        )}
        <AttachTagForm
          languageId={lexeme.language_id}
          lexemeId={lexeme.id}
          availableTags={availableTags}
          deleteLexemePending={deleteEntry.pending}
        />
      </div>

      {/* Entry-level controls */}
      <div className="flex items-center justify-end gap-2 border-t pt-3">
        <DeleteConfirmDialog
          open={deleteEntry.dialogOpen}
          onOpenChange={deleteEntry.setDialogOpen}
          focusOverrideRef={deleteEntry.focusOverrideRef}
          trigger={
            <Button
              type="button"
              variant="destructive"
              disabled={savePending || deleteEntry.pending}
              data-delete-trigger
              className="w-32"
            >
              Delete Entry
            </Button>
          }
          title={`Delete "${lexeme.term}"?`}
          description="This deletes the dictionary entry, including all of its senses and tag attachments. This can't be undone."
        >
          <form action={deleteEntry.action}>
            <Button
              type="submit"
              variant="destructive"
              disabled={savePending || deleteEntry.pending}
              className="w-32"
            >
              {deleteEntry.pending ? 'Deleting…' : 'Delete Entry'}
            </Button>
            <FormError
              message={failureMessage(deleteEntry.state)}
              className="w-full"
            />
          </form>
        </DeleteConfirmDialog>
        <Button
          type="button"
          variant="secondary"
          onClick={close}
          disabled={savePending || deleteEntry.pending}
          className="w-24"
        >
          Done
        </Button>
      </div>
    </div>
  );
}

/**
 * One dictionary entry. In view mode it renders as a group of table rows: the
 * lexeme's term, notes, and tags span all of its sense rows via `rowSpan`, and
 * each sense contributes a part-of-speech/definition row — sibling `<tr>`s
 * (not a nested table) so the sense columns stay aligned with the shared
 * header. With no senses, a single muted cell spans the sense columns instead
 * of fake placeholder values. Editing swaps the whole group for one full-width
 * row holding the edit card.
 */
function LexemeEntry({
  lexeme,
  isEven,
  allTags,
  canEdit,
  fallbackFocusRef,
}: {
  lexeme: CompleteLexeme;
  isEven: boolean;
  allTags: Tag[];
  canEdit: boolean;
  fallbackFocusRef: React.RefObject<HTMLElement | null>;
}) {
  const [isEditing, setIsEditing] = useState(false);

  // Shared across both the view-row Delete button below and the "Delete
  // Entry" button inside `LexemeEditCard` (edit mode) — same entity, same
  // action, one dialog. `rowRef` attaches to whichever `<tr>` is actually
  // rendered (view vs. edit), since they're mutually exclusive.
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const { rowRef, focusOverrideRef, captureFocusTarget } =
    useDeleteFocusRecovery<HTMLTableRowElement>(fallbackFocusRef);

  const [deleteState, deleteAction, deletePending] = useActionState(
    async (
      prev: Awaited<ReturnType<typeof deleteLexeme>> | null,
      formData: FormData,
    ) => {
      captureFocusTarget();
      const result = await deleteLexeme(
        lexeme.language_id,
        lexeme.id,
        prev,
        formData,
      );
      if (result.ok) setDeleteDialogOpen(false);
      return result;
    },
    null,
  );

  if (isEditing)
    return (
      <tr ref={rowRef} className="border-t">
        <td colSpan={6} className="p-4 text-left">
          <LexemeEditCard
            lexeme={lexeme}
            allTags={allTags}
            close={() => setIsEditing(false)}
            deleteEntry={{
              dialogOpen: deleteDialogOpen,
              setDialogOpen: setDeleteDialogOpen,
              focusOverrideRef,
              action: deleteAction,
              pending: deletePending,
              state: deleteState,
            }}
          />
        </td>
      </tr>
    );

  // The first sense shares a row with the rowSpan-ed lexeme cells; the rest
  // get their own rows.
  const [firstSense, ...restSenses] = lexeme.senses;
  const lexemeRowSpan = Math.max(lexeme.senses.length, 1);

  return (
    <>
      <tr ref={rowRef} className={'border-t ' + (isEven ? 'bg-card/50' : 'bg-card')}>
        <td rowSpan={lexemeRowSpan} className="py-2 font-mono">
          {lexeme.term}
          {lexeme.fits_phonotactics === false && (
            <span
              role="img"
              aria-label="Does not fit this language's syllable patterns"
              title="Does not fit this language's syllable patterns"
              className="ml-1 text-amber-500"
            >
              ⚠
            </span>
          )}
        </td>
        {firstSense ? (
          <>
            <td className="py-2">{firstSense.part_of_speech || '—'}</td>
            <td className="py-2">{firstSense.definition}</td>
          </>
        ) : (
          <td colSpan={2} className="py-2 text-muted-foreground italic">
            No senses yet
          </td>
        )}
        <td rowSpan={lexemeRowSpan} className="py-2">
          {lexeme.notes || '—'}
        </td>
        <td rowSpan={lexemeRowSpan} className="py-2">
          {lexeme.tags.map((tag) => tag.name).join(', ') || '—'}
        </td>
        <td rowSpan={lexemeRowSpan} className="py-2">
          {canEdit && (
            <div className="gap-2 flex flex-wrap">
              <Button
                type="button"
                variant="edit"
                size="sm"
                disabled={deletePending}
                onClick={() => setIsEditing(true)}
                className="w-24"
              >
                Edit
              </Button>
              <DeleteConfirmDialog
                open={deleteDialogOpen}
                onOpenChange={setDeleteDialogOpen}
                focusOverrideRef={focusOverrideRef}
                trigger={
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={deletePending}
                    data-delete-trigger
                    className="w-24"
                  >
                    Delete
                  </Button>
                }
                title={`Delete "${lexeme.term}"?`}
                description="This deletes the dictionary entry, including all of its senses and tag attachments. This can't be undone."
              >
                <form action={deleteAction}>
                  <Button
                    type="submit"
                    variant="destructive"
                    size="sm"
                    disabled={deletePending}
                    className="w-24"
                  >
                    {deletePending ? 'Deleting…' : 'Delete'}
                  </Button>
                  <FormError
                    message={failureMessage(deleteState)}
                    className="w-full text-left"
                  />
                </form>
              </DeleteConfirmDialog>
            </div>
          )}
        </td>
      </tr>
      {restSenses.map((sense) => (
        <tr key={sense.id} className={isEven ? 'bg-card/50' : 'bg-card'}>
          <td className="py-2">{sense.part_of_speech || '—'}</td>
          <td className="py-2">{sense.definition}</td>
        </tr>
      ))}
    </>
  );
}

type OriginFilter = 'all' | 'manual' | 'generated';
type FitFilter = 'all' | 'fits' | 'violates';
type Sort =
  | 'term-asc'
  | 'term-desc'
  | 'created-desc'
  | 'created-asc'
  | 'updated-desc'
  | 'updated-asc'
  | 'default';

/**
 * One comparator per non-default sort. Date sorts fall back to term order for
 * equal timestamps — every row that predates the timestamp columns carries the
 * same backfilled value, so without a tiebreak their order would be arbitrary.
 */
const COMPARATORS: Record<
  Exclude<Sort, 'default'>,
  (a: CompleteLexeme, b: CompleteLexeme) => number
> = {
  'term-asc': (a, b) => a.term.localeCompare(b.term),
  'term-desc': (a, b) => b.term.localeCompare(a.term),
  'created-desc': (a, b) =>
    b.created_at.getTime() - a.created_at.getTime() ||
    a.term.localeCompare(b.term),
  'created-asc': (a, b) =>
    a.created_at.getTime() - b.created_at.getTime() ||
    a.term.localeCompare(b.term),
  'updated-desc': (a, b) =>
    b.updated_at.getTime() - a.updated_at.getTime() ||
    a.term.localeCompare(b.term),
  'updated-asc': (a, b) =>
    a.updated_at.getTime() - b.updated_at.getTime() ||
    a.term.localeCompare(b.term),
};

/** Case-insensitive substring match against any searchable field of an entry. */
function matchesQuery(lexeme: CompleteLexeme, query: string): boolean {
  const q = query.toLowerCase();
  return (
    lexeme.term.toLowerCase().includes(q) ||
    (lexeme.notes ?? '').toLowerCase().includes(q) ||
    lexeme.senses.some(
      (s) =>
        s.definition.toLowerCase().includes(q) ||
        s.part_of_speech.toLowerCase().includes(q),
    )
  );
}

/**
 * Filter/sort controls rendered above the table. Purely client-side — the full
 * dictionary is already in props, so narrowing never refetches. The Tag select
 * only renders when the data actually contains tags; `fits`/`violates` options
 * exclude entries whose flag is `null` (no syllable structures to check
 * against), which therefore appear only under "All".
 */
function DictionaryControls({
  tagOptions,
  query,
  setQuery,
  tagFilter,
  setTagFilter,
  originFilter,
  setOriginFilter,
  fitFilter,
  setFitFilter,
  sort,
  setSort,
}: {
  tagOptions: Tag[];
  query: string;
  setQuery: (v: string) => void;
  tagFilter: string;
  setTagFilter: (v: string) => void;
  originFilter: OriginFilter;
  setOriginFilter: (v: OriginFilter) => void;
  fitFilter: FitFilter;
  setFitFilter: (v: FitFilter) => void;
  sort: Sort;
  setSort: (v: Sort) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1 flex-1 min-w-48">
        <Label htmlFor="dictionary-search">Search</Label>
        <Input
          id="dictionary-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {tagOptions.length > 0 && (
        <div className="flex flex-col gap-1">
          <Label htmlFor="dictionary-tag-filter">Tag</Label>
          <select
            id="dictionary-tag-filter"
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            className="border rounded p-2"
          >
            <option value="all">All tags</option>
            {tagOptions.map((tag) => (
              <option className="bg-popover" key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="flex flex-col gap-1">
        <Label htmlFor="dictionary-origin-filter">Origin</Label>
        <select
          id="dictionary-origin-filter"
          value={originFilter}
          onChange={(e) => setOriginFilter(e.target.value as OriginFilter)}
          className="border rounded p-2"
        >
          <option className="bg-popover" value="all">
            All origins
          </option>
          <option className="bg-popover" value="manual">
            Manual
          </option>
          <option className="bg-popover" value="generated">
            Generated
          </option>
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="dictionary-fit-filter">Phonotactics</Label>
        <select
          id="dictionary-fit-filter"
          value={fitFilter}
          onChange={(e) => setFitFilter(e.target.value as FitFilter)}
          className="border rounded p-2"
        >
          <option className="bg-popover" value="all">
            All
          </option>
          <option className="bg-popover" value="fits">
            Fits
          </option>
          <option className="bg-popover" value="violates">
            Doesn&apos;t fit
          </option>
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="dictionary-sort">Sort</Label>
        <select
          id="dictionary-sort"
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          className="border rounded p-2"
        >
          <option className="bg-popover" value="term-asc">
            Term A→Z
          </option>
          <option className="bg-popover" value="term-desc">
            Term Z→A
          </option>
          <option className="bg-popover" value="created-desc">
            Newest first
          </option>
          <option className="bg-popover" value="created-asc">
            Oldest first
          </option>
          <option className="bg-popover" value="updated-desc">
            Recently updated
          </option>
          <option className="bg-popover" value="updated-asc">
            Least recently updated
          </option>
          <option className="bg-popover" value="default">
            Original order
          </option>
        </select>
      </div>
    </div>
  );
}

/**
 * Dictionary table: read-only by default, with a per-entry edit mode (matching
 * the phonemes/syllables pages) that exposes lexeme and sense editing, tag
 * attach/detach, sense creation, and entry deletion. Receives server-fetched
 * data as props; mutations go through Server Actions which revalidate the
 * page on success — filter/sort state lives here in the client, so it
 * survives those revalidations. `languageId` comes from the page rather than
 * the rows so the Add Word form works when the dictionary is empty. `allTags`
 * is the language's full tag inventory (separate from the tags attached to
 * any one entry) — it drives the tag filter, the tag manager, and the
 * edit card's attach picker.
 */
export default function DictionaryTable({
  languageId,
  dictionary,
  allTags,
  canEdit,
}: {
  languageId: string;
  dictionary: CompleteLexeme[];
  allTags: Tag[];
  canEdit: boolean;
}) {
  const [query, setQuery] = useState('');
  const [tagFilter, setTagFilter] = useState('all');
  const [originFilter, setOriginFilter] = useState<OriginFilter>('all');
  const [fitFilter, setFitFilter] = useState<FitFilter>('all');
  const [sort, setSort] = useState<Sort>('term-asc');

  // If the selected tag was deleted since it was chosen, fall back to "all"
  // rather than silently filtering everything out against a ghost id.
  const effectiveTagFilter =
    tagFilter !== 'all' && !allTags.some((tag) => tag.id === tagFilter)
      ? 'all'
      : tagFilter;

  const visible = useMemo(() => {
    const trimmed = query.trim();
    const filtered = dictionary.filter(
      (lexeme) =>
        (trimmed === '' || matchesQuery(lexeme, trimmed)) &&
        (effectiveTagFilter === 'all' ||
          lexeme.tags.some((tag) => tag.id === effectiveTagFilter)) &&
        (originFilter === 'all' || lexeme.origin === originFilter) &&
        (fitFilter === 'all' ||
          lexeme.fits_phonotactics === (fitFilter === 'fits')),
    );
    if (sort === 'default') return filtered;
    return filtered.sort(COMPARATORS[sort]);
  }, [dictionary, query, effectiveTagFilter, originFilter, fitFilter, sort]);

  const termInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-4">
      {canEdit && (
        <AddLexemeForm languageId={languageId} termInputRef={termInputRef} />
      )}
      <TagManager languageId={languageId} tags={allTags} canEdit={canEdit} />
      {dictionary.length === 0 ? (
        <p className="text-muted-foreground">
          No words yet — add one above, or bank some from the word generator.
        </p>
      ) : (
        <>
          <DictionaryControls
            tagOptions={allTags}
            query={query}
            setQuery={setQuery}
            tagFilter={effectiveTagFilter}
            setTagFilter={setTagFilter}
            originFilter={originFilter}
            setOriginFilter={setOriginFilter}
            fitFilter={fitFilter}
            setFitFilter={setFitFilter}
            sort={sort}
            setSort={setSort}
          />
          {visible.length === 0 ? (
            <p className="text-muted-foreground">
              No entries match the current filters.
            </p>
          ) : (
            <>
              {visible.length < dictionary.length && (
                <p className="text-muted-foreground text-sm">
                  Showing {visible.length} of {dictionary.length}{' '}
                  {dictionary.length === 1 ? 'entry' : 'entries'}
                </p>
              )}
              <LexemeTable
                dictionary={visible}
                allTags={allTags}
                canEdit={canEdit}
                fallbackFocusRef={termInputRef}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}

/** The dictionary rows themselves; rendered only when at least one word exists. */
function LexemeTable({
  dictionary,
  allTags,
  canEdit,
  fallbackFocusRef,
}: {
  dictionary: CompleteLexeme[];
  allTags: Tag[];
  canEdit: boolean;
  fallbackFocusRef: React.RefObject<HTMLElement | null>;
}) {
  return (
    <table className="w-full border table-fixed wrap-break-word">
      <thead>
        <tr>
          <th scope="col" className="py-1 w-[14%]">
            Term
          </th>
          <th scope="col" className="py-1 w-[12%]">
            Part of Speech
          </th>
          <th scope="col" className="py-1">
            Definition
          </th>
          <th scope="col" className="py-1 w-[16%]">
            Notes
          </th>
          <th scope="col" className="py-1 w-[12%]">
            Tags
          </th>
          <th scope="col" className="py-1 w-56">
            Actions
          </th>
        </tr>
      </thead>
      <tbody className="text-center">
        {dictionary.map((lexeme, i) => (
          <LexemeEntry
            lexeme={lexeme}
            key={lexeme.id}
            isEven={i % 2 === 0}
            allTags={allTags}
            canEdit={canEdit}
            fallbackFocusRef={fallbackFocusRef}
          />
        ))}
      </tbody>
    </table>
  );
}

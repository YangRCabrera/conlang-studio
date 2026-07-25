'use client';

import { useActionState, useId, useRef, useState } from 'react';
import { createPhoneme, updatePhoneme, deletePhoneme } from './actions';
import type { phonemes } from '@/app/db/schema';
import { anyFieldError, failureMessage } from '@/app/components/action-state';
import { useDeleteFocusRecovery } from '@/app/components/use-delete-focus-recovery';
import { useReturnFocusOnExit } from '@/app/components/use-return-focus-on-exit';
import { Button } from '@/app/components/ui/button';
import { DeleteConfirmDialog } from '@/app/components/ui/delete-confirm-dialog';
import { FormError } from '@/app/components/ui/form-error';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';

type Phoneme = typeof phonemes.$inferSelect;

/** Single phoneme row with inline edit (symbol + weight) and delete. */
function PhonemeRow({
  phoneme,
  languageId,
  canEdit,
  fallbackFocusRef,
}: {
  phoneme: Phoneme;
  languageId: string;
  canEdit: boolean;
  fallbackFocusRef: React.RefObject<HTMLElement | null>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const editTriggerRef = useRef<HTMLButtonElement>(null);
  useReturnFocusOnExit(isEditing, editTriggerRef);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const { rowRef, focusOverrideRef, captureFocusTarget } =
    useDeleteFocusRecovery<HTMLLIElement>(fallbackFocusRef);

  const [deleteState, deleteAction, deletePending] = useActionState(
    async (
      prev: Awaited<ReturnType<typeof deletePhoneme>> | null,
      formData: FormData,
    ) => {
      captureFocusTarget();
      const result = await deletePhoneme(
        languageId,
        phoneme.id,
        prev,
        formData,
      );
      if (result.ok) setDeleteDialogOpen(false);
      return result;
    },
    null,
  );

  // Wrapped (rather than plain-bound) so the row can leave edit mode on
  // success from the event, avoiding a setState-in-effect.
  const [editState, editAction, editPending] = useActionState(
    async (
      prev: Awaited<ReturnType<typeof updatePhoneme>> | null,
      formData: FormData,
    ) => {
      const result = await updatePhoneme(
        languageId,
        phoneme.id,
        prev,
        formData,
      );
      if (result.ok) setIsEditing(false);
      return result;
    },
    null,
  );

  if (isEditing) {
    return (
      <li className="flex flex-col gap-2 rounded-lg border bg-card p-2">
        <PhonemeForm
          mode="Edit"
          formAction={editAction}
          pending={editPending}
          cancel={() => setIsEditing(false)}
          phoneme={phoneme}
        />
        <FormError
          message={failureMessage(editState) ?? anyFieldError(editState)}
        />
      </li>
    );
  }

  return (
    <li
      ref={rowRef}
      className="flex flex-col gap-2 rounded-lg border bg-card p-3"
    >
      <div className="flex items-center gap-2">
        <span className="flex-1 font-mono text-lg px-3">
          {'Symbol: ' + phoneme.symbol}
        </span>
        <span className="flex-1 font-mono text-lg px-3">
          {'IPA: ' + (phoneme.ipa ? phoneme.ipa : 'N/A')}
        </span>
        <span className="flex-1 font-mono text-lg px-3">
          {'Weight: ' + phoneme.weight}
        </span>
        {canEdit && (
          <>
            <Button
              ref={editTriggerRef}
              type="button"
              variant="edit"
              onClick={() => setIsEditing(true)}
              disabled={deletePending}
              className="w-32"
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
                  data-delete-trigger
                  className="w-32"
                >
                  Delete
                </Button>
              }
              title={`Delete phoneme "${phoneme.symbol}"?`}
              description="This removes the phoneme from the language, including from any phoneme groups and syllable structures it's used in. This can't be undone."
            >
              <form action={deleteAction}>
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={deletePending}
                  className="w-32"
                >
                  {deletePending ? 'Deleting…' : 'Delete'}
                </Button>
                <FormError message={failureMessage(deleteState)} />
              </form>
            </DeleteConfirmDialog>
          </>
        )}
      </div>
    </li>
  );
}

/** Inline wrapper for form for adding a new phoneme to the language. */
function AddPhonemeForm({
  languageId,
  symbolInputRef,
}: {
  languageId: string;
  symbolInputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [state, formAction, pending] = useActionState(
    createPhoneme.bind(null, languageId),
    null,
  );

  return (
    <div className="mb-6">
      <PhonemeForm
        mode="Add"
        formAction={formAction}
        pending={pending}
        symbolInputRef={symbolInputRef}
      />
      <FormError message={failureMessage(state) ?? anyFieldError(state)} />
    </div>
  );
}

/**
 * Reusable form for adding and/or editing phonemes. `symbolInputRef` is only
 * passed in `Add` mode, where it doubles as the fallback focus target when a
 * delete empties the phoneme list.
 */
function PhonemeForm({
  formAction,
  pending,
  ...props
}: {
  formAction: (payload: FormData) => void;
  pending: boolean;
} & (
  | { mode: 'Add'; symbolInputRef: React.RefObject<HTMLInputElement | null> }
  | { mode: 'Edit'; phoneme: Phoneme; cancel: () => void }
)) {
  const weightId = useId();
  const [symbol, setSymbol] = useState(
    props.mode === 'Edit' ? props.phoneme.symbol : '',
  );
  const [ipa, setIPA] = useState(
    props.mode === 'Edit' ? props.phoneme.ipa : '',
  );
  const [weight, setWeight] = useState(
    props.mode === 'Edit' ? props.phoneme.weight : 1,
  );

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex items-end gap-2 px-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="new-symbol" required>
            Symbol
          </Label>
          <Input
            ref={props.mode === 'Add' ? props.symbolInputRef : undefined}
            name="symbol"
            id="new-symbol"
            value={symbol}
            onChange={(e) => setSymbol(e.currentTarget.value)}
            required
            className="w-40 font-mono text-lg text-center"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="new-ipa">IPA</Label>
          <Input
            name="ipa"
            id="new-ipa"
            value={ipa || ''}
            onChange={(e) => setIPA(e.currentTarget.value)}
            className="w-40 font-mono text-lg text-center"
          />
        </div>
        <div className="flex flex-1 flex-col items-center px-5">
          <input
            id={weightId}
            name="weight"
            type="range"
            min={0}
            max={2}
            step={0.1}
            value={weight}
            onChange={(e) => setWeight(Number(e.currentTarget.value))}
            className="mx-3 my-2 w-full accent-primary"
          />
          <Label htmlFor={weightId}>Weight: {weight}</Label>
        </div>
        <Button type="submit" disabled={pending} className="w-32">
          {props.mode === 'Add' ? 'Add' : 'Save'}
        </Button>
        {props.mode === 'Edit' && (
          <Button
            type="button"
            variant="secondary"
            onClick={props.cancel}
            className="w-32"
          >
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

/**
 * Full phonemes management UI: an add form followed by the phoneme list.
 * Receives the initial list from a Server Component parent; mutations revalidate the route.
 */
export default function PhonemeList({
  phonemes: initialPhonemes,
  languageId,
  canEdit,
}: {
  phonemes: Phoneme[];
  languageId: string;
  canEdit: boolean;
}) {
  const symbolInputRef = useRef<HTMLInputElement>(null);

  return (
    <div>
      {canEdit && (
        <AddPhonemeForm
          languageId={languageId}
          symbolInputRef={symbolInputRef}
        />
      )}
      {initialPhonemes.length === 0 ? (
        <p className="text-muted-foreground">
          No phonemes yet. Start here. Phonemes are the raw sounds of your
          language, and everything downstream (groups, syllable shapes, rules,
          generated words) is built from what you add.
        </p>
      ) : (
        <ul className="space-y-2">
          {[...initialPhonemes]
            .sort(({ symbol: sa }, { symbol: sb }) => (sa < sb ? -1 : 1))
            .map((p) => (
              <PhonemeRow
                key={p.id}
                phoneme={p}
                languageId={languageId}
                canEdit={canEdit}
                fallbackFocusRef={symbolInputRef}
              />
            ))}
        </ul>
      )}
    </div>
  );
}

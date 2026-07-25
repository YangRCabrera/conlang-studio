'use client';

import { phonemes, syllable_structures } from '@/app/db/schema';
import type { PhonemeGroupWithMembers } from '@/app/lib/phoneme-groups';
import { useActionState, useRef, useState } from 'react';
import {
  createSyllableStructure,
  deleteSyllableStructure,
  updateSyllableStructure,
} from './actions';
import { templateSchema } from '@/app/db/json-shapes';
import { z } from 'zod';
import { anyFieldError, failureMessage } from '@/app/components/action-state';
import { useDeleteFocusRecovery } from '@/app/components/use-delete-focus-recovery';
import { Button } from '@/app/components/ui/button';
import { DeleteConfirmDialog } from '@/app/components/ui/delete-confirm-dialog';
import { FormError } from '@/app/components/ui/form-error';
import { Label } from '@/app/components/ui/label';

type Phoneme = typeof phonemes.$inferSelect;
type SyllableStructure = typeof syllable_structures.$inferSelect;
type SyllableTemplate = z.infer<typeof templateSchema>;
type Slot = SyllableTemplate[number];

/** Gets the name of an item in a syllable template slot. */
function slotLabel(
  slot: Slot,
  phonemeList: Phoneme[],
  groups: PhonemeGroupWithMembers[],
): string {
  if (slot.kind === 'group') {
    return groups.find((g) => g.id === slot.groupId)?.name ?? '?';
  }
  return phonemeList.find((p) => p.id === slot.phonemeId)?.symbol ?? '?';
}

/** Add Syllable Button. Toggles between single button and reusable Add/Edit from. */
function AddSyllableStructureForm({
  languageId: languageId,
  phonemes: phonemes,
  groups: groups,
  toggleButtonRef,
}: {
  languageId: string;
  phonemes: Phoneme[];
  groups: PhonemeGroupWithMembers[];
  toggleButtonRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const [isAdding, setIsAdding] = useState(false);

  // Wrapped (rather than plain-bound) so the form can close itself on
  // success from the event, avoiding a setState-in-effect.
  const [state, formAction, pending] = useActionState(
    async (
      prev: Awaited<ReturnType<typeof createSyllableStructure>> | null,
      formData: FormData,
    ) => {
      const result = await createSyllableStructure(languageId, prev, formData);
      if (result.ok) setIsAdding(false);
      return result;
    },
    null,
  );

  return (
    <div className="mb-6">
      {isAdding ? (
        <>
          <SyllableStructureForm
            formAction={formAction}
            cancel={() => setIsAdding(false)}
            pending={pending}
            mode="Add"
            template={[]}
            initialWeight={1}
            phonemes={phonemes}
            groups={groups}
          />
          <FormError
            message={failureMessage(state) ?? anyFieldError(state)}
          />
        </>
      ) : (
        <Button
          ref={toggleButtonRef}
          type="button"
          disabled={pending}
          onClick={() => setIsAdding(true)}
          className="w-60"
        >
          Add Syllable Structure
        </Button>
      )}
    </div>
  );
}

/** Single syllable row with inline edit (template + weight) and delete. */
function SyllableStructureRow({
  languageId,
  structure,
  phonemes,
  groups,
  canEdit,
  fallbackFocusRef,
}: {
  languageId: string;
  structure: SyllableStructure;
  phonemes: Phoneme[];
  groups: PhonemeGroupWithMembers[];
  canEdit: boolean;
  fallbackFocusRef: React.RefObject<HTMLElement | null>;
}) {
  const [isEditing, setIsEditing] = useState(false);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const { rowRef, focusOverrideRef, captureFocusTarget } =
    useDeleteFocusRecovery<HTMLLIElement>(fallbackFocusRef);

  const [deleteState, deleteAction, deletePending] = useActionState(
    async (
      prev: Awaited<ReturnType<typeof deleteSyllableStructure>> | null,
      formData: FormData,
    ) => {
      captureFocusTarget();
      const result = await deleteSyllableStructure(
        languageId,
        structure.id,
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
      prev: Awaited<ReturnType<typeof updateSyllableStructure>> | null,
      formData: FormData,
    ) => {
      const result = await updateSyllableStructure(
        languageId,
        structure.id,
        prev,
        formData,
      );
      if (result.ok) setIsEditing(false);
      return result;
    },
    null,
  );

  if (isEditing)
    return (
      <li className="rounded-lg border bg-card p-2">
        <SyllableStructureForm
          formAction={editAction}
          cancel={() => setIsEditing(false)}
          pending={editPending}
          mode="Edit"
          template={structure.template}
          initialWeight={structure.weight}
          phonemes={phonemes}
          groups={groups}
        />
        <FormError
          message={failureMessage(editState) ?? anyFieldError(editState)}
        />
      </li>
    );

  return (
    <li ref={rowRef} className="flex flex-col gap-2 rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between">
        <div className="flex flex-row mx-3 w-full">
          <p className="flex-2 font-mono">
            Template:
            {structure.template.map((slot, i) => {
              const label = slotLabel(slot, phonemes, groups);
              return (
                <span key={i}> {slot.optional ? `(${label})` : label}</span>
              );
            })}
          </p>
          <p className="flex-1 font-mono">Weight: {structure.weight}</p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Button
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
              title="Delete this syllable structure?"
              description="This removes the syllable shape from the language. The word generator will stop drawing from it. This can't be undone."
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
          </div>
        )}
      </div>
    </li>
  );
}

/** Reusable form for adding and/or editing syllables */
function SyllableStructureForm({
  formAction,
  cancel,
  pending,
  mode,
  template: structure,
  initialWeight,
  phonemes: phonemeList,
  groups,
}: {
  formAction: (payload: FormData) => void;
  cancel: () => void;
  pending: boolean;
  mode: 'Add' | 'Edit';
  template: SyllableTemplate;
  initialWeight: number;
  phonemes: Phoneme[];
  groups: PhonemeGroupWithMembers[];
}) {
  const [template, setTemplate] = useState<SyllableTemplate>([...structure]);
  const [weight, setWeight] = useState(initialWeight);

  // newSelection encodes both kind and id as "kind:uuid" so a single <select> covers both groups and phonemes.
  const initialSelection =
    groups.length > 0
      ? `group:${groups[0].id}`
      : phonemeList.length > 0
        ? `phoneme:${phonemeList[0].id}`
        : '';
  const [newSelection, setNewSelection] = useState(initialSelection);
  const [newOptional, setNewOptional] = useState(false);

  function addSlot() {
    const colonIdx = newSelection.indexOf(':');
    if (colonIdx === -1) return;
    const kind = newSelection.slice(0, colonIdx);
    const id = newSelection.slice(colonIdx + 1);
    if (!id) return;
    const slot: Slot =
      kind === 'group'
        ? { kind: 'group', groupId: id, optional: newOptional }
        : { kind: 'phoneme', phonemeId: id, optional: newOptional };
    setTemplate((prev) => [...prev, slot]);
    setNewOptional(false);
  }

  function removeSlot(idx: number) {
    setTemplate((prev) => prev.filter((_, i) => i !== idx));
  }

  function moveSlot(idx: number, dir: -1 | 1) {
    const next = [...template];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setTemplate(next);
  }

  const hasOptions = groups.length > 0 || phonemeList.length > 0;

  return (
    <form
      action={formAction}
      className="flex flex-col items-end gap-2 rounded-lg border bg-card p-5 mb-3"
    >
      <input type="hidden" name="template" value={JSON.stringify(template)} />

      {/* Template slot chips */}
      <div className="flex flex-wrap gap-1 min-h-8 items-center w-full py-3 px-7">
        {template.length === 0 ? (
          <span className="text-sm text-muted-foreground">
            No slots yet — add one below.
          </span>
        ) : (
          template.map((slot, idx) => {
            const label = slotLabel(slot, phonemeList, groups);
            return (
              <div
                key={idx}
                className="flex items-center gap-0.5 bg-muted border rounded-md p-4 text-sm font-mono"
              >
                <span>{slot.optional ? `(${label})` : label}</span>
                <button
                  type="button"
                  onClick={() => moveSlot(idx, -1)}
                  disabled={idx === 0}
                  className="px-0.5 text-muted-foreground enabled:hover:text-foreground disabled:opacity-30 cursor-pointer disabled:cursor-auto"
                  aria-label="Move left"
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={() => moveSlot(idx, 1)}
                  disabled={idx === template.length - 1}
                  className="px-0.5 text-muted-foreground enabled:hover:text-foreground disabled:opacity-30 cursor-pointer disabled:cursor-auto"
                  aria-label="Move right"
                >
                  →
                </button>
                <button
                  type="button"
                  onClick={() => removeSlot(idx)}
                  className="px-0.5 text-muted-foreground hover:text-red-600 cursor-pointer"
                  aria-label="Remove slot"
                >
                  ×
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Add slot controls */}
      {hasOptions ? (
        <div className="flex flex-start w-full px-7">
          <div className="flex flex-wrap items-center gap-4">
            <select
              value={newSelection}
              onChange={(e) => setNewSelection(e.target.value)}
              className="border rounded p-3 text-sm bg-card"
            >
              {groups.length > 0 && (
                <optgroup label="Groups">
                  {groups.map((g) => (
                    <option key={g.id} value={`group:${g.id}`}>
                      {g.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {phonemeList.length > 0 && (
                <optgroup label="Phonemes">
                  {phonemeList.map((p) => (
                    <option key={p.id} value={`phoneme:${p.id}`}>
                      {p.symbol}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            <Label className="gap-1 font-normal">
              <input
                type="checkbox"
                checked={newOptional}
                onChange={(e) => setNewOptional(e.target.checked)}
                className="accent-primary"
              />
              Optional
            </Label>
            <Button
              type="button"
              variant="secondary"
              onClick={addSlot}
              disabled={!newSelection}
              className="w-32"
            >
              + Add slot
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Add phonemes or groups to this language before building a template.
        </p>
      )}

      {/* Weight slider */}
      <div className="flex flex-1 flex-col items-center px-5 w-full">
        <input
          id={'weight'}
          name="weight"
          type="range"
          min={0}
          max={2}
          step={0.1}
          value={weight}
          onChange={(e) => setWeight(Number(e.currentTarget.value))}
          className="mx-3 my-2 w-full accent-primary"
        />
        <Label htmlFor={'weight'}>Weight: {weight}</Label>
      </div>

      {/* Commit or Cancel Changes */}
      <div className="flex flex-row gap-2">
        <Button
          type="submit"
          disabled={pending || !template.length}
          className="w-32"
        >
          {mode === 'Add' ? 'Add' : 'Save'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={cancel}
          disabled={pending}
          className="w-32"
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

/**
 * Client component that renders the full syllable structures UI: an add form and an editable
 * list of existing structures. Receives server-fetched data as props; mutations go through
 * Server Actions which revalidate the page after success.
 */
export default function SyllableStructureList({
  languageId,
  phonemes,
  groups,
  structures: initialStructures,
  canEdit,
}: {
  languageId: string;
  phonemes: Phoneme[];
  groups: PhonemeGroupWithMembers[];
  structures: SyllableStructure[];
  canEdit: boolean;
}) {
  const toggleButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <div>
      {canEdit && (
        <AddSyllableStructureForm
          languageId={languageId}
          phonemes={phonemes}
          groups={groups}
          toggleButtonRef={toggleButtonRef}
        />
      )}
      {initialStructures.length === 0 ? (
        <p className="text-muted-foreground">
          No syllable structures yet. Structures describe the shapes a syllable
          can take, built from your phonemes and groups; this is what the word
          generator draws from.
        </p>
      ) : (
        <ul className="space-y-2">
          {[...initialStructures].map((s) => (
            <SyllableStructureRow
              key={s.id}
              languageId={languageId}
              structure={s}
              groups={groups}
              phonemes={phonemes}
              canEdit={canEdit}
              fallbackFocusRef={toggleButtonRef}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

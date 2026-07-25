'use client';

import { phonemes } from '@/app/db/schema';
import { PhonemeGroupWithMembers } from '@/app/lib/phoneme-groups';
import { useActionState, useRef, useState } from 'react';
import { createGroup, deleteGroup, updateGroup } from './actions';
import { anyFieldError, failureMessage } from '@/app/components/action-state';
import { useDeleteFocusRecovery } from '@/app/components/use-delete-focus-recovery';
import { useReturnFocusOnExit } from '@/app/components/use-return-focus-on-exit';
import { Button } from '@/app/components/ui/button';
import { DeleteConfirmDialog } from '@/app/components/ui/delete-confirm-dialog';
import { FormError } from '@/app/components/ui/form-error';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';

type Phoneme = typeof phonemes.$inferSelect;

function formatPhonemePresentation({ symbol, ipa }: Phoneme) {
  return `[ <${symbol}>${ipa?.length ? ` /${ipa}/` : ''} ]`;
}

function AddGroupForm({
  languageId,
  nameInputRef,
}: {
  languageId: string;
  nameInputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [createState, createAction, createPending] = useActionState(
    createGroup.bind(null, languageId),
    null,
  );

  return (
    <form action={createAction} className="flex flex-col gap-2 mb-6">
      <div className="flex items-center gap-2 px-2">
        <Input
          ref={nameInputRef}
          name="name"
          placeholder="New Group"
          required
          className="flex-1 font-mono text-lg"
        />
        <Button type="submit" disabled={createPending} className="w-32">
          Add
        </Button>
      </div>
      <FormError
        message={failureMessage(createState) ?? anyFieldError(createState)}
      />
    </form>
  );
}

function EditGroupForm({
  formAction,
  cancel,
  pending,
  phonemes,
  group,
}: {
  formAction: (payload: FormData) => void;
  cancel: () => void;
  pending: boolean;
  phonemes: Phoneme[];
  group: PhonemeGroupWithMembers;
}) {
  const [name, setName] = useState(group.name);

  return (
    <form
      action={formAction}
      className="w-full flex flex-row justify-between items-start"
    >
      {group.members.map((m) => (
        <input key={m.id} type="hidden" name="current_member_id" value={m.id} />
      ))}
      <div className="flex flex-col gap-2">
        <Input
          name="name"
          placeholder="Name *"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          required
          className="w-80 font-mono text-lg text-center"
        />
        <section className="grid grid-cols-6">
          {phonemes.map((p, i) => {
            const formattedName = formatPhonemePresentation(p);
            return (
              <div key={p.id} className="w-50 flex items-center p-2 gap-2">
                <input
                  type="checkbox"
                  id={`phn-${i}`}
                  name="phoneme_id"
                  value={p.id}
                  defaultChecked={group.members.some((m) => m.id === p.id)}
                  className="accent-primary"
                />
                <Label className="w-full font-normal" htmlFor={`phn-${i}`}>
                  {formattedName}
                </Label>
              </div>
            );
          })}
        </section>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending} className="w-32">
          Save
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={cancel}
          className="w-32"
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

function GroupRow({
  languageId,
  group,
  phonemes,
  canEdit,
  fallbackFocusRef,
}: {
  languageId: string;
  group: PhonemeGroupWithMembers;
  phonemes: Phoneme[];
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
      prev: Awaited<ReturnType<typeof deleteGroup>> | null,
      formData: FormData,
    ) => {
      captureFocusTarget();
      const result = await deleteGroup(languageId, group.id, prev, formData);
      if (result.ok) setDeleteDialogOpen(false);
      return result;
    },
    null,
  );

  // Wrapped (rather than plain-bound) so the row can leave edit mode on
  // success from the event, avoiding a setState-in-effect.
  const [editState, editAction, editPending] = useActionState(
    async (
      prev: Awaited<ReturnType<typeof updateGroup>> | null,
      formData: FormData,
    ) => {
      const result = await updateGroup(languageId, group.id, prev, formData);
      if (result.ok) setIsEditing(false);
      return result;
    },
    null,
  );

  if (isEditing) {
    return (
      <li className="flex flex-row items-center gap-2 rounded-lg border bg-card p-3">
        <EditGroupForm
          formAction={editAction}
          pending={editPending}
          cancel={() => setIsEditing(false)}
          phonemes={phonemes}
          group={group}
        />
        <FormError
          message={failureMessage(editState) ?? anyFieldError(editState)}
        />
      </li>
    );
  }

  return (
    <li ref={rowRef} className="flex flex-col gap-2 rounded-lg border bg-card p-3">
      <div className="flex flex-row items-center gap-2">
        <div className="flex-1 flex flex-row">
          <p className="w-1/4">
            <strong>Name: </strong>
            {group.name}
          </p>
          <p className="w-3/4">
            <strong>Members: </strong>
            {group.members.length
              ? group.members.map(formatPhonemePresentation).join(', ')
              : 'None'}
          </p>
        </div>
        {canEdit && (
          <>
            <Button
              ref={editTriggerRef}
              type="button"
              variant="edit"
              disabled={deletePending}
              onClick={() => setIsEditing(true)}
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
              title={`Delete group "${group.name}"?`}
              description="This deletes the phoneme group. Syllable structures that reference it will lose that slot. This can't be undone."
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

export default function PhonemeGroupsList({
  languageId,
  groups: initialGroups,
  phonemes,
  canEdit,
}: {
  languageId: string;
  groups: PhonemeGroupWithMembers[];
  phonemes: Phoneme[];
  canEdit: boolean;
}) {
  const nameInputRef = useRef<HTMLInputElement>(null);

  return (
    <div>
      {canEdit && (
        <AddGroupForm languageId={languageId} nameInputRef={nameInputRef} />
      )}
      {initialGroups.length === 0 ? (
        <p className="text-muted-foreground">
          No phoneme groups yet. Add one above.
        </p>
      ) : (
        <ul className="space-y-2">
          {[...initialGroups]
            .sort(({ name: na }, { name: nb }) => (na < nb ? -1 : 1))
            .map((g) => (
              <GroupRow
                key={g.id}
                group={g}
                languageId={languageId}
                phonemes={phonemes}
                canEdit={canEdit}
                fallbackFocusRef={nameInputRef}
              />
            ))}
        </ul>
      )}
    </div>
  );
}

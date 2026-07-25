'use client';

import { tags } from '@/app/db/schema';
import { useActionState, useRef, useState } from 'react';
import { createTag, deleteTag, renameTag } from './actions';
import { failureMessage, fieldError } from '@/app/components/action-state';
import { useDeleteFocusRecovery } from '@/app/components/use-delete-focus-recovery';
import { Button } from '@/app/components/ui/button';
import { DeleteConfirmDialog } from '@/app/components/ui/delete-confirm-dialog';
import { FormError } from '@/app/components/ui/form-error';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';

type Tag = typeof tags.$inferSelect;

/**
 * Form for creating a new tag. Controlled so the input can be cleared after a
 * successful add (the new tag appears via revalidation).
 */
function AddTagForm({
  languageId,
  nameInputRef,
}: {
  languageId: string;
  nameInputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [name, setName] = useState('');

  const [state, formAction, pending] = useActionState(
    async (
      prev: Awaited<ReturnType<typeof createTag>> | null,
      formData: FormData,
    ) => {
      const result = await createTag(languageId, prev, formData);
      if (result.ok) setName('');
      return result;
    },
    null,
  );

  const error = failureMessage(state) ?? fieldError(state, 'name');

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="new-tag-name">New tag</Label>
        <Input
          ref={nameInputRef}
          id="new-tag-name"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={error ? 'new-tag-name-error' : undefined}
          className="w-48"
        />
      </div>
      <Button type="submit" disabled={pending} className="w-24">
        {pending ? 'Adding…' : 'Add Tag'}
      </Button>
      <FormError id="new-tag-name-error" message={error} className="w-full" />
    </form>
  );
}

/** One tag row with inline rename and delete — sibling forms, matching `SenseEditRow`. */
function TagRow({
  languageId,
  tag,
  canEdit,
  fallbackFocusRef,
}: {
  languageId: string;
  tag: Tag;
  canEdit: boolean;
  fallbackFocusRef: React.RefObject<HTMLElement | null>;
}) {
  const [name, setName] = useState(tag.name);

  const [renameState, renameAction, renamePending] = useActionState(
    renameTag.bind(null, languageId, tag.id),
    null,
  );

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const { rowRef, focusOverrideRef, captureFocusTarget } =
    useDeleteFocusRecovery<HTMLLIElement>(fallbackFocusRef);

  const [deleteState, deleteAction, deletePending] = useActionState(
    async (
      prev: Awaited<ReturnType<typeof deleteTag>> | null,
      formData: FormData,
    ) => {
      captureFocusTarget();
      const result = await deleteTag(languageId, tag.id, prev, formData);
      if (result.ok) setDeleteDialogOpen(false);
      return result;
    },
    null,
  );

  const error = failureMessage(renameState) ?? fieldError(renameState, 'name');

  if (!canEdit) return <li className="flex items-center">{tag.name}</li>;

  return (
    <li ref={rowRef} className="flex flex-wrap items-end gap-3">
      <form action={renameAction} className="flex items-end gap-2 flex-1">
        <div className="flex flex-col gap-1 flex-1 min-w-40">
          <Label htmlFor={`tag-name-${tag.id}`}>Name</Label>
          <Input
            id={`tag-name-${tag.id}`}
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={!!error}
            aria-describedby={error ? `tag-name-${tag.id}-error` : undefined}
          />
        </div>
        <Button
          type="submit"
          disabled={renamePending || deletePending}
          className="w-24"
        >
          {renamePending ? 'Saving…' : 'Save'}
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
            disabled={renamePending || deletePending}
            data-delete-trigger
            className="w-24"
          >
            Delete
          </Button>
        }
        title={`Delete tag "${tag.name}"?`}
        description="This removes the tag entirely, including from every dictionary entry it's attached to. This can't be undone."
      >
        <form action={deleteAction}>
          <Button
            type="submit"
            variant="destructive"
            disabled={renamePending || deletePending}
            className="w-24"
          >
            {deletePending ? 'Deleting…' : 'Delete'}
          </Button>
          <FormError message={failureMessage(deleteState)} className="w-full" />
        </form>
      </DeleteConfirmDialog>
      <FormError
        id={`tag-name-${tag.id}-error`}
        message={error}
        className="w-full"
      />
    </li>
  );
}

/**
 * Collapsible manager for the language's tags: create, rename, delete.
 * Collapsed by default so it doesn't crowd the dictionary table — tag
 * attach/detach for individual words happens in the lexeme edit card instead.
 */
export default function TagManager({
  languageId,
  tags,
  canEdit,
}: {
  languageId: string;
  tags: Tag[];
  canEdit: boolean;
}) {
  const nameInputRef = useRef<HTMLInputElement>(null);

  return (
    <details className="rounded-lg border bg-card p-3">
      <summary className="cursor-pointer font-semibold text-sm">
        Manage tags {tags.length > 0 && `(${tags.length})`}
      </summary>
      <div className="flex flex-col gap-3 mt-3">
        {tags.length > 0 && (
          <ul className="flex flex-col gap-2">
            {tags.map((tag) => (
              <TagRow
                key={tag.id}
                languageId={languageId}
                tag={tag}
                canEdit={canEdit}
                fallbackFocusRef={nameInputRef}
              />
            ))}
          </ul>
        )}
        {canEdit && (
          <AddTagForm languageId={languageId} nameInputRef={nameInputRef} />
        )}
      </div>
    </details>
  );
}

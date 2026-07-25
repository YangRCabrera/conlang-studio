'use client';

import { useActionState, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { createLanguage, updateLanguage, deleteLanguage } from './actions';
import type { languages } from '@/app/db/schema';
import { failureMessage, fieldError } from '@/app/components/action-state';
import { useDeleteFocusRecovery } from '@/app/components/use-delete-focus-recovery';
import { Button } from '@/app/components/ui/button';
import { DeleteConfirmDialog } from '@/app/components/ui/delete-confirm-dialog';
import { FormError } from '@/app/components/ui/form-error';
import { Input } from '@/app/components/ui/input';

type Language = typeof languages.$inferSelect;

/**
 * Single language row: supports inline rename (click name → edit in place) and delete.
 * Extracted so each row can hold its own `useActionState` instance for the delete form.
 */
function LanguageItem({
  lang,
  createInputRef,
}: {
  lang: Language;
  createInputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [renameState, setRenameState] = useState<
    Awaited<ReturnType<typeof updateLanguage>> | null
  >(null);
  const [renamePending, startTransition] = useTransition();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const { rowRef, focusOverrideRef, captureFocusTarget } =
    useDeleteFocusRecovery<HTMLLIElement>(createInputRef);

  const [deleteState, deleteAction, deletePending] = useActionState(
    async (
      prev: Awaited<ReturnType<typeof deleteLanguage>> | null,
      formData: FormData,
    ) => {
      captureFocusTarget();
      const result = await deleteLanguage(lang.id, prev, formData);
      if (result.ok) setDeleteDialogOpen(false);
      return result;
    },
    null,
  );

  function startEdit() {
    setIsEditing(true);
    setEditName(lang.name);
    setRenameState(null);
  }

  function commitRename() {
    startTransition(async () => {
      const result = await updateLanguage(lang.id, editName);
      setRenameState(result);
      // Stay in edit mode on failure so the error is visible and the
      // attempted name isn't lost.
      if (result.ok) setIsEditing(false);
    });
  }

  const renameError =
    failureMessage(renameState) ?? fieldError(renameState, 'name');

  return (
    <li ref={rowRef} className="flex flex-col gap-1 rounded-lg border bg-card p-3">
      <div className="flex items-center gap-2">
        {isEditing ? (
          <Input
            autoFocus
            id={`rename-name-${lang.id}`}
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') setIsEditing(false);
            }}
            onBlur={commitRename}
            disabled={renamePending}
            aria-invalid={!!renameError}
            aria-describedby={
              renameError ? `rename-name-${lang.id}-error` : undefined
            }
            className="flex-1 h-8"
          />
        ) : (
          <Link
            href={`/languages/${lang.id}`}
            className="flex-1 text-left hover:underline"
          >
            {lang.name}
          </Link>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isEditing}
          onClick={startEdit}
          className="text-muted-foreground"
        >
          Rename
        </Button>
        <DeleteConfirmDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          focusOverrideRef={focusOverrideRef}
          trigger={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-delete-trigger
              className="text-red-400 hover:text-red-300"
            >
              Delete
            </Button>
          }
          title={`Delete "${lang.name}"?`}
          description="This deletes the language and everything built on it — phonemes, phoneme groups, syllable structures, rules, and dictionary entries. This can't be undone."
        >
          <form action={deleteAction}>
            <Button
              type="submit"
              variant="destructive"
              disabled={deletePending}
              className="w-24"
            >
              {deletePending ? 'Deleting…' : 'Delete'}
            </Button>
            <FormError message={failureMessage(deleteState)} />
          </form>
        </DeleteConfirmDialog>
      </div>
      <FormError id={`rename-name-${lang.id}-error`} message={renameError} />
    </li>
  );
}

/**
 * Renders the full language management UI: a create form at the top, then a list
 * where each row supports inline rename and delete. All mutations go through Server
 * Actions; `revalidatePath` in each action refreshes the server-rendered list.
 */
export default function LanguageList({
  languages: langs,
}: {
  languages: Language[];
}) {
  const [createState, createAction, createPending] = useActionState(
    createLanguage,
    null,
  );
  const createInputRef = useRef<HTMLInputElement>(null);
  const createError =
    failureMessage(createState) ?? fieldError(createState, 'name');

  return (
    <div>
      <form action={createAction} className="flex flex-col gap-2 mb-6">
        <div className="flex gap-2">
          <Input
            ref={createInputRef}
            id="new-language-name"
            name="name"
            placeholder="New language name"
            required
            aria-invalid={!!createError}
            aria-describedby={createError ? 'new-language-name-error' : undefined}
            className="flex-1"
          />
          <Button type="submit" disabled={createPending}>
            Create
          </Button>
        </div>
        <FormError id="new-language-name-error" message={createError} />
      </form>

      {langs.length === 0 ? (
        <p className="text-muted-foreground">No languages yet. Create one above.</p>
      ) : (
        <ul className="space-y-2">
          {langs.map((lang) => (
            <LanguageItem
              key={lang.id}
              lang={lang}
              createInputRef={createInputRef}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

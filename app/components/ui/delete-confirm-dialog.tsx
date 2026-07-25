'use client';

import * as React from 'react';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/app/components/ui/alert-dialog';
import { Button } from '@/app/components/ui/button';

/**
 * Shared confirmation gate for every destructive delete in the app. Renders
 * `trigger` (the visible, always-`type="button"` control) as the dialog's
 * trigger, and `children` (the caller's real `<form action={deleteAction}>`
 * with its actual submit button + `FormError`) as the dialog's confirm
 * control — the Server Action wiring itself never moves, only what
 * surrounds it. There is no styled "confirm" action here: Radix's
 * `AlertDialogAction` closes on click before an async Server Action's
 * result is known, which would close the dialog even on failure. Rendering
 * the caller's real submit form as `children` and closing only on
 * `result.ok` (from the caller's wrapped action) avoids that.
 *
 * `open`/`onOpenChange` are controlled by the caller rather than
 * self-managed, because a successful delete needs to close the dialog
 * programmatically from inside the wrapped action, not just from
 * Cancel/Escape.
 *
 * `focusOverrideRef` (from `useDeleteFocusRecovery`) redirects focus on
 * close to a captured sibling row instead of Radix's default "return focus
 * to trigger" — appropriate on a successful delete, since the trigger's row
 * is about to unmount. When the ref is empty (the Cancel/Escape path —
 * nothing ever populated it), Radix's default return-to-trigger runs
 * untouched.
 */
export function DeleteConfirmDialog({
  trigger,
  title,
  description,
  cancelLabel = 'Cancel',
  open,
  onOpenChange,
  focusOverrideRef,
  children,
}: {
  trigger: React.ReactNode;
  title: string;
  description: string;
  cancelLabel?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  focusOverrideRef?: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
}) {
  const cancelRef = React.useRef<HTMLButtonElement>(null);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent
        onOpenAutoFocus={(e) => {
          // Land on Cancel, not Radix's DOM-order default, so a reflexive
          // Enter doesn't fire the destructive action.
          e.preventDefault();
          cancelRef.current?.focus();
        }}
        onCloseAutoFocus={(e) => {
          const override = focusOverrideRef?.current;
          if (!override) return;
          e.preventDefault();
          override.focus();
          focusOverrideRef!.current = null;
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel ref={cancelRef} asChild>
            <Button type="button" variant="secondary" className="w-24">
              {cancelLabel}
            </Button>
          </AlertDialogCancel>
          {children}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

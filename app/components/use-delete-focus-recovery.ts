'use client';

import { useCallback, useRef } from 'react';

const DELETE_TRIGGER_SELECTOR = '[data-delete-trigger]';

/**
 * Walks from `from` in `direction`, checking each sibling (and its
 * descendants) for a `[data-delete-trigger]` element, skipping siblings
 * that don't have one rather than stopping at the first miss. The skip is
 * what makes this agnostic to row shape: a plain `<li>` list has exactly
 * one trigger per immediate sibling, but a multi-row entry (e.g. a lexeme's
 * `<tr>` followed by triggerless continuation `<tr>`s for extra senses)
 * needs to skip past those to reach the next/previous entry's trigger.
 */
function findSiblingTrigger(
  from: Element,
  direction: 'nextElementSibling' | 'previousElementSibling',
): HTMLElement | null {
  let node = from[direction];
  while (node) {
    if (node.matches(DELETE_TRIGGER_SELECTOR)) return node as HTMLElement;
    const nested = node.querySelector<HTMLElement>(DELETE_TRIGGER_SELECTOR);
    if (nested) return nested;
    node = node[direction];
  }
  return null;
}

/**
 * Captures, at confirm-click time — synchronously, before the delete Server
 * Action even runs — a reference to the delete trigger that should receive
 * focus once this row is gone, so a keyboard/AT user isn't silently dropped
 * to `<body>`. Deliberately not an unmount-effect: deletion round-trips
 * through a Server Action + `revalidatePath`, and an unmount cleanup's
 * timing relative to that RSC re-render patch is unreliable. Reading the
 * DOM *before* the mutation sidesteps the race entirely — only the row
 * being deleted goes away, so a captured sibling reference stays valid
 * regardless of when the surrounding list actually re-renders.
 *
 * `rowRef` goes on the row's DOM root (the `<li>`/`<tr>` — for a multi-row
 * entry, the first row, the one carrying the delete trigger). `fallbackRef`
 * is a stable, always-present focusable control to fall back to when the
 * delete empties the list (e.g. the create form's first input, or an "Add"
 * toggle button) — tried only when there is neither a next nor a previous
 * sibling trigger.
 */
export function useDeleteFocusRecovery<T extends HTMLElement = HTMLElement>(
  fallbackRef: React.RefObject<HTMLElement | null>,
) {
  const rowRef = useRef<T>(null);
  const focusOverrideRef = useRef<HTMLElement | null>(null);

  const captureFocusTarget = useCallback(() => {
    const row = rowRef.current;
    focusOverrideRef.current =
      (row &&
        (findSiblingTrigger(row, 'nextElementSibling') ??
          findSiblingTrigger(row, 'previousElementSibling'))) ??
      fallbackRef.current;
  }, [fallbackRef]);

  return { rowRef, focusOverrideRef, captureFocusTarget };
}

'use client';

import { useEffect, useRef } from 'react';

/**
 * Returns focus to `triggerRef` (the "Edit"/"Add" button that toggles a row
 * or form into its editing state) whenever `isEditing` transitions from
 * `true` to `false` — covering both a successful save and an explicit
 * Cancel, since both unmount whatever control currently has focus and would
 * otherwise silently drop focus to `<body>`.
 *
 * Needs an effect rather than an imperative call at the point `setIsEditing`
 * is invoked: the trigger button is `disabled` while editing, and disabled
 * elements can't receive focus. An effect runs after React commits the
 * re-render, guaranteeing the button is already re-enabled by the time
 * `.focus()` runs — a same-tick call would silently fail against the DOM's
 * still-disabled state from the previous render.
 */
export function useReturnFocusOnExit(
  isEditing: boolean,
  triggerRef: React.RefObject<HTMLElement | null>,
) {
  const wasEditingRef = useRef(false);

  useEffect(() => {
    if (wasEditingRef.current && !isEditing) {
      triggerRef.current?.focus();
    }
    wasEditingRef.current = isEditing;
  }, [isEditing, triggerRef]);
}

'use client';

import { useEffect, useRef } from 'react';

/**
 * Focuses `inputRef` the moment `errorMessage` transitions from falsy to
 * truthy, so a failed validation lands the user directly on the field the
 * message names — its `aria-describedby` wiring then announces why. Only
 * fires on that transition, not on every render while the message stays
 * present, so typing a correction doesn't keep yanking focus back.
 *
 * `disabled` (optional) covers fields whose own `disabled` prop is tied to
 * the same pending state as the error — e.g. a `useTransition`-driven commit
 * whose error and its "no longer pending" flag can land in two separate
 * renders. If the field is still disabled the render the error first
 * appears, `hadErrorRef` is deliberately left unset so the effect retries
 * once `disabled` flips false and re-triggers it (it's a dependency below),
 * rather than the yank silently no-op'ing against a disabled element.
 */
export function useFocusOnError(
  errorMessage: string | null | undefined,
  inputRef: React.RefObject<HTMLElement | null>,
  disabled = false,
) {
  const hadErrorRef = useRef(false);

  useEffect(() => {
    const hasError = !!errorMessage;
    if (!hasError) {
      hadErrorRef.current = false;
      return;
    }
    if (hadErrorRef.current || disabled) return;
    inputRef.current?.focus();
    hadErrorRef.current = true;
  }, [errorMessage, inputRef, disabled]);
}

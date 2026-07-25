import { cn } from '@/app/components/utils';

/**
 * Renders nothing when `message` is falsy, so call sites can pass the result
 * of `failureMessage`/`fieldError` (from `app/components/action-state`)
 * straight through without an `&&` guard. `role="alert"` makes the message
 * announced to assistive tech the moment it mounts with content — since the
 * component renders nothing beforehand, appearance itself is the trigger, no
 * extra `aria-live` wiring needed. `id` is optional and only useful when a
 * caller wants to point a specific input's `aria-describedby` at this
 * message (see the field-level error wiring in `language-list.tsx` et al.).
 */
function FormError({
  id,
  message,
  className,
}: {
  id?: string;
  message: string | null | undefined;
  className?: string;
}) {
  if (!message) return null;

  return (
    <p
      id={id}
      data-slot="form-error"
      role="alert"
      className={cn('text-red-400 text-sm', className)}
    >
      {message}
    </p>
  );
}

export { FormError };

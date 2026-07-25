import Link from 'next/link';
import { Button } from '@/app/components/ui/button';

/** Rendered for any URL that doesn't match a route. */
export default function NotFound() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center"
    >
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-muted-foreground max-w-md">
        The page you&apos;re looking for doesn&apos;t exist.
      </p>
      <Button asChild>
        <Link href="/languages">Go to your languages</Link>
      </Button>
    </main>
  );
}

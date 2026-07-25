import Link from 'next/link';
import { SignInButton, SignUpButton } from '@clerk/nextjs';
import { getOrCreateDbUser } from '@/app/lib/current-user';
import { Button } from '@/app/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/app/components/ui/card';

const FEATURES: { label: string; description: string }[] = [
  {
    label: 'Phonemes & Groups',
    description:
      'Define the sound inventory of your language and organize sounds into reusable groups.',
  },
  {
    label: 'Syllable Structures',
    description:
      'Describe the shapes a syllable can take, built from your phoneme groups.',
  },
  {
    label: 'Rules',
    description:
      'Write sound-change rules that transform words as they are generated.',
  },
  {
    label: 'Dictionary',
    description:
      'Track vocabulary with definitions, tags, and individual notes.',
  },
  {
    label: 'Word Generator',
    description:
      'Generate new words that follow your syllable structures and rules.',
  },
];

/**
 * Public landing page. Reads the authenticated user (if any) purely to choose
 * the CTA target — signed-in visitors skip straight to their languages instead
 * of being shown sign-up/sign-in buttons.
 */
/** Set once the hand-authored demo language exists and is flipped `is_public`. */
const DEMO_LANGUAGE_ID = process.env.NEXT_PUBLIC_DEMO_LANGUAGE_ID;

export default async function Home() {
  const user = await getOrCreateDbUser();

  return (
    <div className="flex flex-col flex-1 items-center">
      <main
        id="main-content"
        tabIndex={-1}
        className="flex flex-1 w-full max-w-3xl flex-col items-center gap-12 py-18 px-6"
      >
        <div className="flex flex-col gap-4 items-center text-center">
          <h1 className="text-4xl font-bold">
            Design constructed languages, end to end.
          </h1>
          <p className="text-muted-foreground max-w-xl">
            Conlang Studio takes you from a phoneme inventory to generated
            vocabulary. Define sounds, syllable shapes, and sound-change rules,
            then generate words that follow them.
          </p>

          {user ? (
            <div className="flex gap-3">
              <Button asChild size="lg">
                <Link href="/languages">Go to your languages</Link>
              </Button>
              {DEMO_LANGUAGE_ID && (
                <Button asChild size="lg" variant="outline">
                  <Link href={`/languages/${DEMO_LANGUAGE_ID}`}>
                    Try the demo
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            <div className="flex gap-3">
              <SignUpButton>
                <Button size="lg">Get started</Button>
              </SignUpButton>
              <SignInButton>
                <Button size="lg" variant="outline">
                  Sign in
                </Button>
              </SignInButton>
              {DEMO_LANGUAGE_ID && (
                <Button asChild size="lg" variant="outline">
                  <Link href={`/languages/${DEMO_LANGUAGE_ID}`}>
                    Try the demo
                  </Link>
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
          {FEATURES.map(({ label, description }, index) => (
            <Card
              key={label}
              className={
                index === FEATURES.length - 1 && FEATURES.length % 2 === 1
                  ? 'p-4 gap-1 sm:col-span-2 sm:w-1/2 sm:mx-auto'
                  : 'p-4 gap-1'
              }
            >
              <CardTitle>{label}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </Card>
          ))}
        </div>

        <p className="text-muted-foreground max-w-xl text-center">
          Nothing is pre-built: you define every sound, syllable shape, and rule
          yourself, then generate words that follow them.
        </p>
      </main>
    </div>
  );
}

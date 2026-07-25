import { getOrCreateDbUser } from '@/app/lib/current-user';
import { listLanguagesSvc } from '@/app/lib/languages';
import LanguageList from './language-list';

/**
 * /languages — lists all languages owned by the authenticated user.
 * Data is fetched via the service layer (no HTTP round-trip); `proxy.ts` guarantees
 * this page is never reached by an unauthenticated request.
 */
export default async function LanguagesPage() {
  const user = await getOrCreateDbUser();
  if (!user) return null;

  const langs = await listLanguagesSvc(user);

  return (
    <div className="flex flex-col flex-1 items-center">
      <main
        id="main-content"
        tabIndex={-1}
        className="flex flex-1 w-full max-w-3xl flex-col gap-5 py-10 px-20 items-stretch"
      >
        <h1 className="text-2xl font-bold mb-6 text-center">My Languages</h1>
        <LanguageList languages={langs} />
      </main>
    </div>
  );
}

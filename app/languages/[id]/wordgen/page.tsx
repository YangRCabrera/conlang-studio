import { getOrCreateDbUser } from '@/app/lib/current-user';
import { parseAndRequireVisibleLanguage } from '@/app/lib/ownership';
import { listSyllableStructuresSvc } from '@/app/lib/syllables';
import { notFound } from 'next/navigation';
import WordGenerationForm from './word-generation-form';

/**
 * Server Component: loads the language's syllable structures and hands them to the
 * client-side generation form. Generation itself is allowed for anonymous
 * visitors of a public language (no DB write); only banking a word to the
 * dictionary is owner-only, gated client-side via `canEdit`.
 */
export default async function WordgenPage({
  params,
}: PageProps<'/languages/[id]/wordgen'>) {
  const { id } = await params;

  const user = await getOrCreateDbUser();

  const langResult = await parseAndRequireVisibleLanguage(user, id);
  if (!langResult.ok) notFound();
  const canEdit = user !== null && langResult.data.user_id === user.id;

  const syllableStructures = await listSyllableStructuresSvc(user, id);
  if (!syllableStructures.ok) notFound();

  return (
    <div className="flex flex-col gap-6 w-full h-full">
      <h1 className="text-2xl font-semibold">Word Generator</h1>
      <WordGenerationForm
        languageId={id}
        structures={syllableStructures.data}
        canEdit={canEdit}
      />
    </div>
  );
}

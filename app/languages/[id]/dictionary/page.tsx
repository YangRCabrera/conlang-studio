import { getOrCreateDbUser } from '@/app/lib/current-user';
import { getDictionarySvc } from '@/app/lib/dictionary';
import { parseAndRequireVisibleLanguage } from '@/app/lib/ownership';
import { listTagsSvc } from '@/app/lib/tags';
import { notFound } from 'next/navigation';
import DictionaryTable from './dictionary-table';

/** Dictionary editor — populated in a future step. */
export default async function DictionaryPage({
  params,
}: PageProps<'/languages/[id]/dictionary'>) {
  const { id } = await params;

  const user = await getOrCreateDbUser();

  const langResult = await parseAndRequireVisibleLanguage(user, id);
  if (!langResult.ok) notFound();
  const canEdit = user !== null && langResult.data.user_id === user.id;

  const [dictionary, allTags] = await Promise.all([
    getDictionarySvc(user, id),
    listTagsSvc(user, id),
  ]);
  if (!dictionary.ok || !allTags.ok) notFound();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Dictionary</h1>
      <DictionaryTable
        languageId={id}
        dictionary={dictionary.data}
        allTags={allTags.data}
        canEdit={canEdit}
      />
    </div>
  );
}

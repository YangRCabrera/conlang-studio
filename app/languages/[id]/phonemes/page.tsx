import { notFound } from 'next/navigation';
import { getOrCreateDbUser } from '@/app/lib/current-user';
import { parseAndRequireVisibleLanguage } from '@/app/lib/ownership';
import { listPhonemesSvc } from '@/app/lib/phonemes';
import { listPhonemeGroupsWithMembersSvc } from '@/app/lib/phoneme-groups';
import PhonemeList from './phoneme-list';
import PhonemeGroupsList from './phoneme-groups-list';

/** Phonemes editor: lists all phonemes for the language and allows adding, editing, and deleting. */
export default async function PhonemesPage({
  params,
}: PageProps<'/languages/[id]/phonemes'>) {
  const { id } = await params;

  const user = await getOrCreateDbUser();

  const langResult = await parseAndRequireVisibleLanguage(user, id);
  if (!langResult.ok) notFound();
  const canEdit = user !== null && langResult.data.user_id === user.id;

  const phonemesResult = await listPhonemesSvc(user, id);
  if (!phonemesResult.ok) notFound();

  const groupsResult = await listPhonemeGroupsWithMembersSvc(user, id);
  if (!groupsResult.ok) notFound();

  return (
    <div className="flex flex-col gap-10">
      <h1 className="text-2xl font-semibold">Phonemes & Groups</h1>
      <section>
        <h2 className="text-xl font-semibold mb-6">Phonemes</h2>
        <PhonemeList
          phonemes={phonemesResult.data}
          languageId={id}
          canEdit={canEdit}
        />
      </section>
      <section>
        <h2 className="text-xl font-semibold mb-6">Groups</h2>
        <PhonemeGroupsList
          languageId={id}
          groups={groupsResult.data}
          phonemes={phonemesResult.data}
          canEdit={canEdit}
        />
      </section>
    </div>
  );
}

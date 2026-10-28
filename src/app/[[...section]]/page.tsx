import Workspace from '@/components/workspace';
import { notFound } from 'next/navigation';
export default async function Page({ params }: { params: Promise<{ section?: string[] }> }) {
  const { section } = await params;
  const name = section?.[0] ?? 'dashboard';
  if (
    (section?.length ?? 0) > 1 ||
    ![
      'dashboard',
      'vacancies',
      'applications',
      'profiles',
      'resumes',
      'attention',
      'analytics',
      'activity',
      'settings',
    ].includes(name)
  )
    notFound();
  return <Workspace section={name} />;
}

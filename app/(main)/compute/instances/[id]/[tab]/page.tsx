import { redirect } from 'next/navigation';
import { InstanceDetailPage } from '../InstanceDetailPage';
import { isInstanceDetailTab } from '../tabs';

interface Params {
  id: string;
  tab: string;
}

export default async function InstanceTab({ params }: { params: Promise<Params> }) {
  const { id, tab } = await params;

  if (!isInstanceDetailTab(tab)) {
    redirect(`/compute/instances/${id}/overview`);
  }

  return <InstanceDetailPage id={id} activeTab={tab} />;
}

import { formatDistanceToNow, parseISO } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Volume } from '@/types/openstack';
import { statuses } from '@/types/openstack';

interface VolumeOverviewProps {
  volume: Volume;
}

const formatDate = (value?: string) => {
  if (!value) {
    return '—';
  }

  try {
    return `${value} (${formatDistanceToNow(parseISO(value), { addSuffix: true })})`;
  } catch {
    return value;
  }
};

export function VolumeOverview({ volume }: VolumeOverviewProps) {
  const statusDescription = statuses[volume.status] ?? '—';

  return (
    <Card>
      <CardHeader className="space-y-2">
        <CardTitle className="flex items-center gap-3">
          <span>{volume.name || volume.id}</span>
          <Badge variant="secondary">{volume.status.toUpperCase()}</Badge>
        </CardTitle>
        <p className="text-sm text-muted-foreground">{statusDescription}</p>
      </CardHeader>
      <CardContent className="space-y-6 text-sm">
        <div className="grid grid-cols-2 gap-y-3 gap-x-6">
          <div>
            <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">
              Volume ID
            </p>
            <p className="mt-1 font-mono text-sm break-all">{volume.id}</p>
          </div>
          <div>
            <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">
              Size
            </p>
            <p className="mt-1">{volume.size} GB</p>
          </div>
          <div>
            <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">
              Type
            </p>
            <p className="mt-1">{volume.volume_type || '—'}</p>
          </div>
          <div>
            <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">
              Availability Zone
            </p>
            <p className="mt-1">{volume.availability_zone || '—'}</p>
          </div>
          <div>
            <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">
              Bootable
            </p>
            <p className="mt-1">{volume.bootable === 'true' ? 'Yes' : 'No'}</p>
          </div>
          <div>
            <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">
              Encrypted
            </p>
            <p className="mt-1">{volume.encrypted ? 'Yes' : 'No'}</p>
          </div>
          <div>
            <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">
              Multi-Attach
            </p>
            <p className="mt-1">{volume.multiattach ? 'Yes' : 'No'}</p>
          </div>
          <div>
            <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">
              Created
            </p>
            <p className="mt-1">{formatDate(volume.created_at)}</p>
          </div>
          <div>
            <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">
              Updated
            </p>
            <p className="mt-1">{formatDate(volume.updated_at)}</p>
          </div>
          <div>
            <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">
              Replication Status
            </p>
            <p className="mt-1">{volume.replication_status || '—'}</p>
          </div>
        </div>

        {volume.description ? (
          <div>
            <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">
              Description
            </p>
            <p className="mt-2 leading-relaxed">{volume.description}</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}


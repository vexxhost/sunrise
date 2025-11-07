'use client';

import { useSuspenseQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  volumeBackupsQueryOptions,
  volumeQueryOptions,
  volumeSnapshotsQueryOptions,
} from '@/hooks/queries/useVolumes';
import { VolumeOverview } from '@/components/Volume/VolumeOverview';
import { VolumeAttachments } from '@/components/Volume/VolumeAttachments';
import { VolumeSnapshots } from '@/components/Volume/VolumeSnapshots';
import { VolumeBackups } from '@/components/Volume/VolumeBackups';
import { VolumeMetadata } from '@/components/Volume/VolumeMetadata';
import { VolumeDetailActions } from '@/components/Volume/VolumeDetailActions';

interface VolumeDetailClientProps {
  volumeId: string;
  regionId?: string;
  projectId?: string;
}

export function VolumeDetailClient({ volumeId, regionId, projectId }: VolumeDetailClientProps) {
  const { data: volume } = useSuspenseQuery(volumeQueryOptions(regionId, projectId, volumeId));
  const { data: snapshots } = useSuspenseQuery(
    volumeSnapshotsQueryOptions(regionId, projectId, volumeId)
  );
  const { data: backups } = useSuspenseQuery(
    volumeBackupsQueryOptions(regionId, projectId, volumeId)
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link href="/compute/volumes" className="hover:underline">
              Volumes
            </Link>{' '}
            / {volume.name || volume.id}
          </p>
          <h1 className="text-3xl font-semibold mt-1">{volume.name || volume.id}</h1>
        </div>
        <VolumeDetailActions
          volume={volume}
          snapshots={snapshots}
          backups={backups}
          regionId={regionId}
          projectId={projectId}
        />
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="flex w-full flex-wrap gap-2">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="attachments">Attachments</TabsTrigger>
          <TabsTrigger value="snapshots">Snapshots</TabsTrigger>
          <TabsTrigger value="backups">Backups</TabsTrigger>
          <TabsTrigger value="metadata">Metadata</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <VolumeOverview volume={volume} />
        </TabsContent>

        <TabsContent value="attachments">
          <VolumeAttachments attachments={volume.attachments} />
        </TabsContent>

        <TabsContent value="snapshots">
          <VolumeSnapshots snapshots={snapshots} />
        </TabsContent>

        <TabsContent value="backups">
          <VolumeBackups backups={backups} />
        </TabsContent>

        <TabsContent value="metadata">
          <VolumeMetadata
            metadata={volume.metadata}
            imageMetadata={volume.volume_image_metadata}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}


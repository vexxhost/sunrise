import Link from 'next/link';
import { Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';

export function BucketNotFound({ bucket }: { bucket: string }) {
  return (
    <Empty className="min-h-72 rounded-md border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Database />
        </EmptyMedia>
        <EmptyTitle>Bucket unavailable</EmptyTitle>
        <EmptyDescription>
          <span className="font-mono text-foreground">{bucket}</span> could not
          be found or accessed with the current Object Storage role. Check the
          bucket name or switch to a role with access.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button asChild>
          <Link href="/object-storage/buckets">Back to buckets</Link>
        </Button>
      </EmptyContent>
    </Empty>
  );
}

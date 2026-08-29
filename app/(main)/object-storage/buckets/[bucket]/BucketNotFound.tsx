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
        <EmptyTitle>Bucket not found</EmptyTitle>
        <EmptyDescription>
          <span className="font-mono text-foreground">{bucket}</span> does not
          exist in the active project, or it is no longer available.
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

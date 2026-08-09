'use client';

import Link from 'next/link';
import { useSuspenseQuery } from '@tanstack/react-query';
import { ChevronRight, Home } from 'lucide-react';
import { ObjectMetadataDetails } from '@/components/ObjectMetadataDetails';
import { objectMetadataQueryOptions } from '@/hooks/queries/useObjects';

interface ObjectDetailClientProps {
  activeProjectId: string;
  bucket: string;
  objectKey: string;
}

export function ObjectDetailClient({
  activeProjectId,
  bucket,
  objectKey,
}: ObjectDetailClientProps) {
  const { data } = useSuspenseQuery(
    objectMetadataQueryOptions(activeProjectId, bucket, objectKey)
  );

  // Build breadcrumb segments from key
  const segments = objectKey.split('/').filter((s) => s.length > 0);
  const fileName = segments[segments.length - 1] ?? objectKey;
  const parentSegments = segments.slice(0, -1);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 text-sm text-muted-foreground flex-wrap">
        <Link
          href={`/object-storage/buckets/${encodeURIComponent(bucket)}`}
          className="flex items-center gap-1 hover:text-foreground"
        >
          <Home className="h-3.5 w-3.5" />
          <span>{bucket}</span>
        </Link>
        {parentSegments.map((seg, idx) => {
          const upToHere = parentSegments.slice(0, idx + 1).join('/') + '/';
          return (
            <span key={idx} className="flex items-center gap-1">
              <ChevronRight className="h-3.5 w-3.5" />
              <Link
                href={`/object-storage/buckets/${encodeURIComponent(
                  bucket
                )}?prefix=${encodeURIComponent(upToHere)}`}
                className="hover:text-foreground"
              >
                {seg}
              </Link>
            </span>
          );
        })}
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground">{fileName}</span>
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-1 break-all">{fileName}</h2>
        <p className="text-sm text-muted-foreground font-mono break-all">{objectKey}</p>
      </div>

      <ObjectMetadataDetails data={data} />
    </div>
  );
}

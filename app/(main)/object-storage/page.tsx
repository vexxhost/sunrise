import Link from 'next/link';
import { Database, ShieldCheck } from 'lucide-react';
import { ObjectStorageAuthRedirect } from '@/components/Auth/ObjectStorageAuthRedirect';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { listBucketsForRender } from '@/lib/s3/actions';
import { listRolesForRender } from '@/lib/s3/role-actions';
import { RoleDetailsDialog } from './RoleDetailsDialog';

export default async function ObjectStoragePage() {
  const [bucketResult, roleResult] = await Promise.all([
    listBucketsForRender(),
    listRolesForRender(),
  ]);

  if (
    (!bucketResult.ok && bucketResult.needsAuth) ||
    (!roleResult.ok && roleResult.needsAuth)
  ) {
    return <ObjectStorageAuthRedirect />;
  }

  const resources = [
    {
      name: 'Buckets',
      href: '/object-storage/buckets',
      icon: Database,
      description: 'Buckets and stored objects',
      count: bucketResult.ok ? bucketResult.buckets.length : null,
      restricted: bucketResult.ok ? Boolean(bucketResult.accessDenied) : true,
      error: bucketResult.ok ? null : bucketResult.error,
    },
    {
      name: 'Roles',
      href: '/object-storage/roles',
      icon: ShieldCheck,
      description: 'IAM roles in the active RGW account',
      count: roleResult.ok ? roleResult.roles.length : null,
      restricted: roleResult.ok ? roleResult.accessDenied : true,
      error: roleResult.ok ? null : roleResult.error,
    },
  ];

  return (
    <div className="max-w-screen-xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Object Storage</h1>
        <RoleDetailsDialog />
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Resources</h2>
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Resource</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Count</TableHead>
                <TableHead>Access</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {resources.map((resource) => {
                const Icon = resource.icon;
                return (
                  <TableRow key={resource.href}>
                    <TableCell>
                      <Link
                        href={resource.href}
                        className="inline-flex items-center gap-2 font-medium underline-offset-2 hover:underline"
                      >
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        {resource.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {resource.description}
                    </TableCell>
                    <TableCell>{resource.count ?? '-'}</TableCell>
                    <TableCell>
                      <Badge
                        variant={resource.restricted ? 'secondary' : 'default'}
                        title={resource.error ?? undefined}
                      >
                        {resource.restricted ? 'Restricted' : 'Available'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}

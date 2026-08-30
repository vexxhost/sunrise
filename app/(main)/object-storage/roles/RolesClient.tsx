'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { DataTable } from '@/components/DataTable';
import { FadedText } from '@/components/FadedText';
import { RoleDetailsDialog } from '../RoleDetailsDialog';
import {
  listRoles,
  type IamRoleSummary,
} from '@/lib/s3/role-actions';

type RolesData = {
  roles: IamRoleSummary[];
  accessDenied: boolean;
  denialRequestId?: string;
};

function formatSessionDuration(seconds: number | null) {
  if (seconds === null) return '-';
  if (seconds % 3600 === 0) {
    const hours = seconds / 3600;
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  }
  if (seconds % 60 === 0) return `${seconds / 60} minutes`;
  return `${seconds} seconds`;
}

const columns: ColumnDef<IamRoleSummary>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
    enableHiding: false,
    cell: ({ row }) => (
      <RoleDetailsDialog
        roleName={row.original.name}
        roleArn={row.original.arn}
        trigger={
          <button
            type="button"
            className="max-w-64 truncate text-left text-primary underline-offset-2 hover:underline"
            title={row.original.name}
          >
            {row.original.name}
          </button>
        }
      />
    ),
    meta: { fieldType: 'string', visible: true },
  },
  {
    accessorKey: 'arn',
    header: 'ARN',
    cell: ({ row }) => (
      <RoleDetailsDialog
        roleName={row.original.name}
        roleArn={row.original.arn}
        trigger={
          <button
            type="button"
            className="block max-w-96 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            title={`Open ${row.original.arn}`}
          >
            <FadedText
              value={row.original.arn}
              className="max-w-96 font-mono text-sm"
            />
          </button>
        }
      />
    ),
    meta: { fieldType: 'string', visible: true, monospace: true },
  },
  {
    accessorKey: 'path',
    header: 'Path',
    meta: { fieldType: 'string', visible: true, monospace: true },
  },
  {
    accessorKey: 'description',
    header: 'Description',
    cell: ({ row }) => row.original.description ?? '-',
    meta: { fieldType: 'string', visible: false },
  },
  {
    accessorKey: 'createdAt',
    header: 'Created At',
    cell: ({ row }) => row.original.createdAt ?? '-',
    meta: { fieldType: 'date', visible: true },
  },
  {
    accessorKey: 'maxSessionDuration',
    header: 'Max Session Duration',
    cell: ({ row }) => formatSessionDuration(row.original.maxSessionDuration),
    meta: { fieldType: 'number', visible: false },
  },
  {
    accessorKey: 'id',
    header: 'Role ID',
    cell: ({ row }) => row.original.id ?? '-',
    meta: { fieldType: 'string', visible: false, monospace: true },
  },
];

export function RolesClient({
  activeProjectId,
  initialData,
}: {
  activeProjectId: string;
  initialData: RolesData;
}) {
  const { data = initialData, refetch, isRefetching } = useQuery({
    queryKey: ['s3', activeProjectId, 'roles'],
    queryFn: async () => {
      const result = await listRoles();
      if (!result.ok) {
        if (result.needsAuth) {
          window.location.href = '/object-storage/auth/login';
          throw new Error('S3 authentication required');
        }
        throw new Error(result.error);
      }
      return {
        roles: result.roles,
        accessDenied: result.accessDenied,
        denialRequestId: result.denialRequestId,
      };
    },
    initialData,
    retry: false,
  });

  return (
    <div className="space-y-4">
      {data.accessDenied && (
        <div className="flex gap-2 rounded-md border border-yellow-500/50 bg-yellow-500/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-600" />
          <div>
            <div className="font-medium">Role listing not permitted</div>
            <div className="text-muted-foreground">
              RGW denied <code>iam:ListRoles</code> for the active role.
            </div>
            {data.denialRequestId && (
              <div className="mt-1 font-mono text-xs text-muted-foreground">
                Request ID: {data.denialRequestId}
              </div>
            )}
          </div>
        </div>
      )}

      <DataTable
        columns={columns}
        data={data.roles}
        refetch={refetch}
        isRefetching={isRefetching}
        resourceName="role"
        emptyIcon={ShieldCheck}
      />
    </div>
  );
}

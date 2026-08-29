import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Backup } from '@/types/openstack';
import { formatDistanceToNow, parseISO } from 'date-fns';

interface VolumeBackupsProps {
  backups: Backup[];
}

export function VolumeBackups({ backups }: VolumeBackupsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Backups</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {backups.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No backups found for this volume.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>ID</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Incremental</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {backups.map((backup) => (
                <TableRow key={backup.id}>
                  <TableCell>{backup.name || '—'}</TableCell>
                  <TableCell className="font-mono">{backup.id}</TableCell>
                  <TableCell>{backup.status}</TableCell>
                  <TableCell>{backup.size} GB</TableCell>
                  <TableCell>{backup.is_incremental ? 'Yes' : 'No'}</TableCell>
                  <TableCell>
                    {backup.created_at
                      ? formatDistanceToNow(parseISO(backup.created_at), { addSuffix: true })
                      : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}


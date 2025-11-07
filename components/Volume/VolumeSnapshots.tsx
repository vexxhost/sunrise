import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Snapshot } from '@/types/openstack';
import { formatDistanceToNow, parseISO } from 'date-fns';

interface VolumeSnapshotsProps {
  snapshots: Snapshot[];
}

export function VolumeSnapshots({ snapshots }: VolumeSnapshotsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Snapshots</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {snapshots.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No snapshots found for this volume.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>ID</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {snapshots.map((snapshot) => (
                <TableRow key={snapshot.id}>
                  <TableCell>{snapshot.name || '—'}</TableCell>
                  <TableCell className="font-mono">{snapshot.id}</TableCell>
                  <TableCell>{snapshot.status}</TableCell>
                  <TableCell>{snapshot.size} GB</TableCell>
                  <TableCell>
                    {snapshot.created_at
                      ? formatDistanceToNow(parseISO(snapshot.created_at), { addSuffix: true })
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


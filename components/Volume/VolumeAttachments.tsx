import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Volume } from '@/types/openstack';
import { formatDistanceToNow, parseISO } from 'date-fns';

interface VolumeAttachmentsProps {
  attachments: Volume['attachments'];
}

export function VolumeAttachments({ attachments }: VolumeAttachmentsProps) {
  if (!attachments?.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Attachments</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">This volume is not attached to any instances.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Attachments</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Instance</TableHead>
              <TableHead>Device</TableHead>
              <TableHead>Host</TableHead>
              <TableHead>Attached</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {attachments.map((attachment) => (
              <TableRow key={attachment.attachment_id || attachment.id}>
                <TableCell className="font-mono">
                  <a
                    href={`/compute/instances/${attachment.server_id}`}
                    className="text-primary hover:underline"
                  >
                    {attachment.server_id}
                  </a>
                </TableCell>
                <TableCell className="font-mono">{attachment.device}</TableCell>
                <TableCell>{attachment.host_name ?? '—'}</TableCell>
                <TableCell>
                  {attachment.attached_at
                    ? formatDistanceToNow(parseISO(attachment.attached_at), { addSuffix: true })
                    : '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}


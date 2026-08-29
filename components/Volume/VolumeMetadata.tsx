import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Volume, VolumeImageMetadata } from '@/types/openstack';

interface VolumeMetadataProps {
  metadata: Volume['metadata'];
  imageMetadata?: VolumeImageMetadata;
}

function renderMetadataRows(metadata: Record<string, unknown>) {
  const entries = Object.entries(metadata);

  if (!entries.length) {
    return (
      <TableRow>
        <TableCell colSpan={2} className="text-sm text-muted-foreground">
          No metadata available.
        </TableCell>
      </TableRow>
    );
  }

  return entries.map(([key, value]) => (
    <TableRow key={key}>
      <TableCell className="font-mono text-xs">{key}</TableCell>
      <TableCell className="break-all">{String(value)}</TableCell>
    </TableRow>
  ));
}

export function VolumeMetadata({ metadata, imageMetadata }: VolumeMetadataProps) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Volume Metadata</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Key</TableHead>
                <TableHead>Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>{renderMetadataRows(metadata)}</TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Image Metadata</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Key</TableHead>
                <TableHead>Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {imageMetadata
                ? renderMetadataRows(imageMetadata)
                : (
                  <TableRow>
                    <TableCell colSpan={2} className="text-sm text-muted-foreground">
                      No image metadata available.
                    </TableCell>
                  </TableRow>
                  )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}


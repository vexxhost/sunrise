import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  MAGNUM_DRIVER_LABELS,
  magnumDriverLabelValue,
  type MagnumDriverLabelCategory,
  type MagnumDriverLabelSpec,
} from "@/lib/openstack/magnum-labels";

interface DriverConfigurationTableProps {
  categories?: MagnumDriverLabelCategory[];
  labels: Record<string, string>;
  networkDriver?: string;
  sourceFor?: (key: string) => string;
  specs?: readonly MagnumDriverLabelSpec[];
}

export function DriverConfigurationTable({
  categories,
  labels,
  networkDriver,
  sourceFor,
  specs = MAGNUM_DRIVER_LABELS,
}: DriverConfigurationTableProps) {
  const rows = specs.filter(
    (spec) =>
      (!categories || categories.includes(spec.category)) &&
      (networkDriver !== "cilium" || !spec.key.startsWith("calico_")) &&
      (networkDriver !== "calico" || !spec.key.startsWith("cilium_")),
  );

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Setting</TableHead>
            <TableHead>Effective value</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Purpose</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((spec) => {
            const resolved = magnumDriverLabelValue(labels, spec);
            const source = resolved.explicit
              ? sourceFor?.(spec.key) || "Configured"
              : "Driver default";

            return (
              <TableRow key={spec.key}>
                <TableCell>
                  <div className="font-medium">{spec.label}</div>
                  <div className="mt-0.5 font-mono text-xs text-muted-foreground">
                    {spec.key}
                  </div>
                </TableCell>
                <TableCell className="max-w-72 break-words font-mono text-xs">
                  {resolved.value}
                </TableCell>
                <TableCell>
                  <Badge variant={resolved.explicit ? "secondary" : "outline"}>
                    {source}
                  </Badge>
                </TableCell>
                <TableCell className="min-w-64 text-sm text-muted-foreground">
                  {spec.description}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

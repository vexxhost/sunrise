import { TableCell, TableRow } from "@/components/ui/table";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

interface TableEmptyProps {
  columns: number;
  message?: string;
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
}

export function TableEmpty({ columns, message = "No results.", description, icon: Icon }: TableEmptyProps) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={columns} className="h-64">
        <Empty className="border-0 p-0">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Icon />
            </EmptyMedia>
            <EmptyTitle>{message}</EmptyTitle>
            {description && (
              <EmptyDescription>{description}</EmptyDescription>
            )}
          </EmptyHeader>
        </Empty>
      </TableCell>
    </TableRow>
  );
}

import { Spinner } from "@/components/ui/spinner";
import { TableCell, TableRow } from "@/components/ui/table";

interface TableLoadingProps {
  columns: number;
  message?: string;
}

export function TableLoadingRows({ columns, message = "Loading data..." }: TableLoadingProps) {
  return (
    <TableRow>
      <TableCell colSpan={columns} className="h-64 text-center">
        <div className="flex flex-col items-center justify-center gap-2">
          <Spinner className="size-8" />
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
      </TableCell>
    </TableRow>
  );
}

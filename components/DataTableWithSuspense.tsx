import { Suspense } from "react";
import { DataTable } from "./DataTable";
import { TableLoadingRows } from "./TableLoading";
import { ColumnDef } from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface DataTableWithSuspenseProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: Promise<TData[]> | TData[];
  searchOptions: BaseSearchOptions;
}

export async function DataTableWithSuspense<TData, TValue>({
  columns,
  data,
  searchOptions,
}: DataTableWithSuspenseProps<TData, TValue>) {
  const resolvedData = await data;

  return (
    <DataTable
      data={resolvedData}
      columns={columns}
      searchOptions={searchOptions}
    />
  );
}

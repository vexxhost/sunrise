import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  useReactTable,
  RowData,
} from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import React from "react";
import { Button } from "@/components/ui/button";
import { TableEmpty } from "./TableEmpty";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import pluralize from "pluralize";
import { Checkbox } from "@/components/ui/checkbox";
import { IDCell } from "@/components/DataTable/IDCell";
import { useColumnVisibility } from "@/hooks/useColumnVisibility";
import { useColumnOrder } from "@/hooks/useColumnOrder";
import { useGlobalFilter, createGlobalFilterFn } from "@/hooks/useGlobalFilter";
import { ensureRequiredDataTableColumn } from "@/lib/data-table-columns";
import { formatAge } from "@/lib/openstack/time";
import {
  resourceDetailHref,
  type ResourceDetailKind,
} from "@/lib/resource-detail-paths";
import { cn } from "@/lib/utils";
import { DataTableToolbar } from "./DataTable/Toolbar";

const NO_FORCED_VISIBLE_COLUMNS: string[] = [];

declare module "@tanstack/react-table" {
  interface ColumnMeta<TData extends RowData, TValue> {
    label?: string;
    monospace?: boolean;
    fieldType?: "string" | "number" | "boolean" | "date";
    dateDisplay?: "relative" | "age";
    visible?: boolean;
    idResourceKind?: ResourceDetailKind;
  }
}

export interface DataTableRowAction<TData> {
  label: string;
  variant?:
    "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  onClick: (rows: TData[]) => void;
  icon?: React.ComponentType<{ className?: string }>;
  isDisabled?: (rows: TData[]) => boolean;
}

interface DataTableBaseProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  additionalFilters?: React.ReactNode;
  forceVisibleColumnIds?: string[];
  isRefetching?: boolean;
  refetch?: () => void;
  resourceName: string;
  emptyIcon: React.ComponentType<{ className?: string }>;
  onPageRowsChange?: (rows: TData[]) => void;
}

type DataTableSelectionProps<TData> =
  | {
      rowActions: DataTableRowAction<TData>[];
      getRowId: (row: TData, index: number) => string;
    }
  | {
      rowActions?: undefined;
      getRowId?: (row: TData, index: number) => string;
    };

type DataTableProps<TData, TValue> = DataTableBaseProps<TData, TValue> &
  DataTableSelectionProps<TData>;

export function DataTable<TData, TValue>({
  columns,
  data,
  additionalFilters,
  forceVisibleColumnIds = NO_FORCED_VISIBLE_COLUMNS,
  isRefetching = false,
  refetch,
  resourceName,
  emptyIcon,
  rowActions = [],
  onPageRowsChange,
  getRowId,
}: DataTableProps<TData, TValue>) {
  "use no memo";

  // Use extracted hooks
  const { globalFilter, setGlobalFilter } = useGlobalFilter();

  // Build columns array conditionally including checkbox column
  const tableColumns = React.useMemo(() => {
    const cols: ColumnDef<TData, TValue>[] = [];

    // Only add checkbox column if there are row actions
    if (rowActions.length > 0) {
      cols.push({
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && "indeterminate")
            }
            onCheckedChange={(value) =>
              table.toggleAllPageRowsSelected(!!value)
            }
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
          />
        ),
        enableSorting: false,
        enableHiding: false,
      } as ColumnDef<TData, TValue>);
    }

    cols.push(...ensureRequiredDataTableColumn(columns));
    return cols;
  }, [columns, rowActions.length]);
  const { columnVisibility, setColumnVisibility } = useColumnVisibility(
    tableColumns,
    resourceName,
    forceVisibleColumnIds,
  );
  const { columnOrder, setColumnOrder } = useColumnOrder(
    tableColumns,
    resourceName,
  );

  // TanStack Table returns mutable callbacks by design. This component is
  // explicitly outside React Compiler memoization via "use no memo" above.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns: tableColumns,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: createGlobalFilterFn(columns),
    getSortedRowModel: getSortedRowModel(),
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnOrderChange: setColumnOrder,
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
    state: {
      columnVisibility,
      columnOrder,
      globalFilter,
    },
  });

  const pageRows = table.getRowModel().rows;
  const pageRowOriginals = React.useMemo(
    () => pageRows.map((row) => row.original),
    [pageRows],
  );

  React.useEffect(() => {
    onPageRowsChange?.(pageRowOriginals);
  }, [onPageRowsChange, pageRowOriginals]);

  return (
    <>
      <DataTableToolbar
        table={table}
        data={data}
        additionalFilters={additionalFilters}
        forceVisibleColumnIds={forceVisibleColumnIds}
        resourceName={resourceName}
        rowActions={rowActions}
        isRefetching={isRefetching}
        refetch={refetch}
        onFiltersChange={setGlobalFilter}
      />

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => {
                  const isIDColumn =
                    header.column.columnDef.header === "ID" ||
                    Boolean(header.column.columnDef.meta?.idResourceKind);
                  const isSelectColumn = header.column.id === "select";
                  const canSort = header.column.getCanSort();
                  const isSorted = header.column.getIsSorted();

                  return (
                    <TableHead
                      key={header.id}
                      colSpan={header.colSpan}
                      scope={header.colSpan > 1 ? "colgroup" : "col"}
                      aria-sort={
                        isSorted === "asc"
                          ? "ascending"
                          : isSorted === "desc"
                            ? "descending"
                            : undefined
                      }
                      className={cn(
                        "border-r last:border-r-0",
                        isIDColumn && "max-w-36",
                        isSelectColumn
                          ? "w-10 min-w-10 max-w-10"
                          : canSort && "px-0",
                      )}
                    >
                      {header.isPlaceholder ? null : isSelectColumn ? (
                        flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )
                      ) : canSort ? (
                        <Button
                          variant="ghost"
                          onClick={() =>
                            header.column.toggleSorting(isSorted === "asc")
                          }
                          className="h-full min-h-10 w-full justify-between rounded-none px-3 py-2 text-sm font-semibold hover:bg-transparent"
                        >
                          <span>
                            {typeof header.column.columnDef.header === "string"
                              ? header.column.columnDef.header
                              : flexRender(
                                  header.column.columnDef.header,
                                  header.getContext(),
                                )}
                          </span>
                          {isSorted === "asc" ? (
                            <ArrowUp className="h-3 w-3 shrink-0" />
                          ) : isSorted === "desc" ? (
                            <ArrowDown className="h-3 w-3 shrink-0" />
                          ) : (
                            <ArrowUpDown className="h-3 w-3 opacity-50 shrink-0" />
                          )}
                        </Button>
                      ) : (
                        <div className="py-2">
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                        </div>
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className={`group/row`}
                >
                  {row.getVisibleCells().map((cell) => {
                    const idResourceKind =
                      cell.column.columnDef.meta?.idResourceKind;
                    const isIDColumn =
                      cell.column.columnDef.header === "ID" ||
                      Boolean(idResourceKind);
                    const isSelectColumn = cell.column.id === "select";
                    const isMonospace =
                      cell.column.columnDef.meta?.monospace || isIDColumn;
                    const cellValue = cell.getValue();
                    const fieldType = cell.column.columnDef.meta?.fieldType;

                    // Auto-format date fields if it's a date type and has a plain string value
                    let renderedCell;
                    if (
                      isIDColumn &&
                      typeof cellValue === "string" &&
                      cellValue.length
                    ) {
                      renderedCell = (
                        <IDCell
                          value={cellValue}
                          href={
                            idResourceKind
                              ? resourceDetailHref(idResourceKind, cellValue)
                              : undefined
                          }
                        />
                      );
                    } else if (
                      fieldType === "date" &&
                      cell.column.columnDef.meta?.dateDisplay === "age"
                    ) {
                      renderedCell = formatAge(cellValue);
                    } else if (
                      fieldType === "date" &&
                      typeof cellValue === "string"
                    ) {
                      // Automatically format date fields using date-fns
                      try {
                        renderedCell = formatDistanceToNow(
                          new Date(cellValue),
                          { addSuffix: true },
                        );
                      } catch {
                        renderedCell = cellValue;
                      }
                    } else {
                      renderedCell = flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      );
                    }

                    return (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          isMonospace && "font-mono",
                          isIDColumn && "max-w-36",
                          isSelectColumn && "w-10 min-w-10 max-w-10",
                        )}
                      >
                        {renderedCell}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))
            ) : (
              <TableEmpty
                columns={table.getVisibleLeafColumns().length}
                message={
                  resourceName
                    ? `No ${pluralize(resourceName)} found.`
                    : "No results."
                }
                icon={emptyIcon}
              />
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

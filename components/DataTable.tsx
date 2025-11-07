import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  useReactTable,
  RowData,
} from "@tanstack/react-table"
import { usePathname } from "next/navigation"
import { formatDistanceToNow } from 'date-fns'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import React from "react"
import { Button } from "@/components/ui/button"
import { TableEmpty } from "./TableEmpty"
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react"
import pluralize from "pluralize"
import { Checkbox } from "@/components/ui/checkbox"
import { IDCell } from "@/components/DataTable/IDCell"
import { useColumnVisibility } from "@/hooks/useColumnVisibility"
import { useGlobalFilter, createGlobalFilterFn } from "@/hooks/useGlobalFilter"
import { DataTableToolbar } from "./DataTable/Toolbar"
declare module '@tanstack/react-table' {
  interface ColumnMeta<TData extends RowData, TValue> {
    label?: string
    monospace?: boolean
    fieldType: 'string' | 'number' | 'boolean' | 'date'
    visible: boolean
  }
}

export interface DataTableRowAction<TData> {
  label: string
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
  onClick: (rows: TData[]) => void
  icon?: React.ComponentType<{ className?: string }>
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  isRefetching?: boolean
  refetch?: () => void
  resourceName: string
  emptyIcon: React.ComponentType<{ className?: string }>
  rowActions?: DataTableRowAction<TData>[]
}

export function DataTable<TData, TValue>({
  columns,
  data,
  isRefetching = false,
  refetch,
  resourceName,
  emptyIcon,
  rowActions = [],
}: DataTableProps<TData, TValue>) {
  const pathname = usePathname()

  // Use extracted hooks
  const { globalFilter, setGlobalFilter } = useGlobalFilter()
  const { columnVisibility, setColumnVisibility } = useColumnVisibility(columns, resourceName)

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
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
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

    cols.push(...columns);
    return cols;
  }, [columns, rowActions.length]);

  const table = useReactTable({
    data,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: createGlobalFilterFn(columns),
    getSortedRowModel: getSortedRowModel(),
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
    state: {
      columnVisibility,
      globalFilter,
    },
  })

  return (
    <>
      <DataTableToolbar
        table={table}
        data={data}
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
              <TableRow key={headerGroup.id} className="text-xs font-bold hover:bg-transparent">
                {headerGroup.headers.map((header) => {
                  const isIDColumn = typeof header.column.columnDef.header === 'string' && header.column.columnDef.header === 'ID';
                  const isSelectColumn = header.column.id === 'select';
                  const canSort = header.column.getCanSort();
                  const isSorted = header.column.getIsSorted();

                  return (
                    <TableHead key={header.id} className={`px-0 text-xs font-bold border-r ${isIDColumn ? "max-w-32" : ""} ${isSelectColumn ? "w-[40px] min-w-[40px] max-w-[40px] !px-3" : ""}`}>
                      {header.isPlaceholder ? null : (
                        isSelectColumn ? (
                          flexRender(header.column.columnDef.header, header.getContext())
                        ) : canSort ? (
                          <Button
                            variant="ghost"
                            onClick={() => header.column.toggleSorting(isSorted === "asc")}
                            className="h-full w-full py-2 hover:bg-transparent font-bold rounded-none flex justify-between items-center"
                          >
                            <span>
                              {typeof header.column.columnDef.header === 'string'
                                ? header.column.columnDef.header
                                : flexRender(header.column.columnDef.header, header.getContext())}
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
                            {flexRender(header.column.columnDef.header, header.getContext())}
                          </div>
                        )
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
                    const isIDColumn = typeof cell.column.columnDef.header === 'string' && cell.column.columnDef.header === 'ID';
                    const isSelectColumn = cell.column.id === 'select';
                    const isMonospace = cell.column.columnDef.meta?.monospace || isIDColumn;
                    const cellValue = cell.getValue();
                    const fieldType = cell.column.columnDef.meta?.fieldType;

                    // Auto-format date fields if it's a date type and has a plain string value
                    let renderedCell;
                    if (isIDColumn && typeof cellValue === 'string') {
                      renderedCell = <IDCell value={cellValue} isSelected={row.getIsSelected()} linkPath={pathname} />;
                    } else if (fieldType === 'date' && typeof cellValue === 'string') {
                      // Automatically format date fields using date-fns
                      try {
                        renderedCell = formatDistanceToNow(new Date(cellValue), { addSuffix: true });
                      } catch {
                        renderedCell = cellValue;
                      }
                    } else {
                      renderedCell = flexRender(cell.column.columnDef.cell, cell.getContext());
                    }

                    return (
                      <TableCell
                        key={cell.id}
                        className={`px-3 ${isMonospace ? "font-mono" : ""} ${isIDColumn ? "max-w-32" : ""} ${isSelectColumn ? "w-[40px] min-w-[40px] max-w-[40px] px-3" : ""}`}
                      >
                        {renderedCell}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))
            ) : (
              <TableEmpty
                columns={columns.length + 1}
                message={resourceName ? `No ${pluralize(resourceName)} found.` : "No results."}
                icon={emptyIcon}
              />
            )}
          </TableBody>
        </Table>
      </div>
    </>
  )
}


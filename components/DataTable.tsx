"use client"

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
import { titleCase } from "title-case"
import { formatDistanceToNow } from 'date-fns'
import { FilterBuilder } from "@/components/FilterBuilder"
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
import { TableLoadingRows } from "./TableLoading"
import { TableEmpty } from "./TableEmpty"
import { RefreshCw, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react"
import pluralize from "pluralize"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationPrevious,
  PaginationNext,
  PaginationLink,
  PaginationEllipsis,
} from "@/components/ui/pagination"
import { DataTableDialog } from "@/components/DataTableDialog"
import { IDCell } from "@/components/DataTable/IDCell"
import { useColumnVisibility } from "@/hooks/useColumnVisibility"
import { useGlobalFilter, createGlobalFilterFn } from "@/hooks/useGlobalFilter"
import { generatePaginationItems } from "@/lib/pagination"
import { ButtonGroup } from "@/components/ui/button-group"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ChevronDown } from "lucide-react"
import { DataTableHeader } from "./DataTable/Header"
declare module '@tanstack/react-table' {
  interface ColumnMeta<TData extends RowData, TValue> {
    label?: string
    monospace?: boolean
    fieldType: 'string' | 'number' | 'boolean' | 'date'
    visible: boolean
  }
}

export interface DataTableAction {
  label: string
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
  onClick: () => void
  icon?: React.ComponentType<{ className?: string }>
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
  actions?: DataTableAction[]
  rowActions?: DataTableRowAction<TData>[]
}

export function DataTable<TData, TValue>({
  columns,
  data,
  isRefetching = false,
  refetch,
  resourceName,
  emptyIcon,
  actions = [],
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
      <DataTableHeader resourceName={resourceName} actions={actions} />
      <div className="flex items-center justify-between pb-2">
        <FilterBuilder
          columns={table.getAllColumns()}
          onFiltersChange={setGlobalFilter}
          data={data}
        />

        <div className="flex items-center gap-2">
          {data.length > 0 && (
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() => table.previousPage()}
                    aria-disabled={!table.getCanPreviousPage()}
                    className={!table.getCanPreviousPage() ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  />
                </PaginationItem>

                {generatePaginationItems(
                  table.getState().pagination.pageIndex + 1,
                  table.getPageCount()
                ).map((item, index) => (
                  <PaginationItem key={index}>
                    {item === 'ellipsis' ? (
                      <PaginationEllipsis />
                    ) : (
                      <PaginationLink
                        onClick={() => table.setPageIndex(item - 1)}
                        isActive={table.getState().pagination.pageIndex + 1 === item}
                        className="cursor-pointer"
                      >
                        {item}
                      </PaginationLink>
                    )}
                  </PaginationItem>
                ))}

                <PaginationItem>
                  <PaginationNext
                    onClick={() => table.nextPage()}
                    aria-disabled={!table.getCanNextPage()}
                    className={!table.getCanNextPage() ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}

          {rowActions.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 h-10 cursor-pointer"
                  disabled={table.getFilteredSelectedRowModel().rows.length === 0}
                >
                  Actions
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {rowActions.map((action, index) => {
                  const Icon = action.icon;
                  return (
                    <DropdownMenuItem
                      key={index}
                      onClick={() => {
                        const selectedRows = table.getFilteredSelectedRowModel().rows.map(row => row.original);
                        action.onClick(selectedRows);
                      }}
                      className="gap-2 cursor-pointer"
                    >
                      {Icon && <Icon className="h-4 w-4" />}
                      {action.label}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <ButtonGroup>
            {refetch && (
              <Button
                variant="outline"
                size="sm"
                onClick={refetch}
                disabled={isRefetching}
                className={`gap-2 h-10 ${isRefetching ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <RefreshCw className={`h-4 w-4 ${isRefetching ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            )}
            <DataTableDialog table={table} resourceName={resourceName} />
          </ButtonGroup>
        </div>
      </div>

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


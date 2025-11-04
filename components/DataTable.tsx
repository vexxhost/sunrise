"use client"

import {
  ColumnDef,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  useReactTable,
  RowData,
} from "@tanstack/react-table"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { titleCase } from "title-case"
import { formatDistanceToNow } from 'date-fns'
import { FilterBuilder, Filter } from "@/components/FilterBuilder"
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
import { RefreshCw, Copy, Check, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react"
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
declare module '@tanstack/react-table' {
  interface ColumnMeta<TData extends RowData, TValue> {
    label?: string
    monospace?: boolean
    fieldType: 'string' | 'number' | 'boolean' | 'date'
  }
}

// ID Cell Component with copy functionality and hover expand
function IDCell({ value, isSelected, linkPath }: { value: string; isSelected: boolean; linkPath?: string }) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const content = (
    <div className="relative w-[100px] flex-shrink-0 group/id">
      <div className="absolute left-0 top-0 w-full overflow-hidden group-hover/id:left-[-9px] group-hover/id:top-[-5px] group-hover/id:z-50 group-hover/id:w-auto group-hover/id:px-2 group-hover/id:py-1 group-hover/id:bg-popover group-hover/id:text-popover-foreground group-hover/id:border group-hover/id:border-border group-hover/id:rounded-md group-hover/id:overflow-visible group-hover/id:underline">
        <span className="font-mono text-sm tracking-tighter block whitespace-nowrap relative z-10">
          {value}
        </span>
      </div>
      {/* Gradient fade - visible when not hovering */}
      <div className={`absolute inset-y-0 right-0 w-12 pointer-events-none opacity-100 group-hover/id:opacity-0 z-20 ${isSelected
        ? 'bg-gradient-to-l from-muted to-transparent'
        : 'bg-gradient-to-l from-background to-transparent group-hover/row:from-muted/50'
        }`} />
      {/* Invisible spacer to maintain height */}
      <span className="font-mono text-sm tracking-tighter block whitespace-nowrap invisible">
        {value.substring(0, 10)}
      </span>
    </div>
  );

  return (
    <div className="flex items-center gap-1 group">
      {linkPath ? (
        <Link href={`${linkPath}/${value}`} onClick={(e) => e.stopPropagation()}>
          {content}
        </Link>
      ) : (
        content
      )}
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 opacity-0 group-hover:opacity-100 group-hover/id:opacity-0 transition-opacity duration-200 shrink-0 cursor-pointer"
        onClick={handleCopy}
      >
        {copied ? (
          <Check className="h-3 w-3 text-green-500" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
      </Button>
    </div>
  );
}



// Helper function to generate page numbers with ellipsis
function generatePaginationItems(currentPage: number, totalPages: number) {
  const items: (number | 'ellipsis')[] = []

  if (totalPages <= 7) {
    // Show all pages if total is 7 or less
    for (let i = 1; i <= totalPages; i++) {
      items.push(i)
    }
  } else {
    // Always show first page
    items.push(1)

    if (currentPage > 3) {
      items.push('ellipsis')
    }

    // Show pages around current page
    const start = Math.max(2, currentPage - 1)
    const end = Math.min(totalPages - 1, currentPage + 1)

    for (let i = start; i <= end; i++) {
      items.push(i)
    }

    if (currentPage < totalPages - 2) {
      items.push('ellipsis')
    }

    // Always show last page
    items.push(totalPages)
  }

  return items
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  isLoading?: boolean
  isRefetching?: boolean
  refetch?: () => void
  resourceName?: string
  emptyIcon: React.ComponentType<{ className?: string }>
}

export function DataTable<TData, TValue>({
  columns,
  data,
  isLoading = false,
  isRefetching = false,
  refetch,
  resourceName,
  emptyIcon,
}: DataTableProps<TData, TValue>) {
  const pathname = usePathname()
  const [filters, setFilters] = React.useState<Filter[]>([])

  const table = useReactTable({
    data,
    columns: [
      {
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
            disabled={!row.getCanSelect()}
            onCheckedChange={row.getToggleSelectedHandler()}
            aria-label="Select row"
          />
        ),
        enableSorting: false,
        enableHiding: false,
      } as ColumnDef<TData, TValue>,
      ...columns,
    ],
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: (row, _columnId, filterValue: any) => {
      const filters = filterValue as Filter[]
      if (!filters || filters.length === 0) return true

      return filters.every((filter) => {
        const rawValue = (row.original as any)[filter.columnId]

        // Get the column to check its field type
        const column = columns.find(col => {
          if ('accessorKey' in col) {
            return col.accessorKey === filter.columnId
          }
          return col.id === filter.columnId
        })
        const fieldType = column?.meta?.fieldType

        // Handle different field types
        if (fieldType === 'number') {
          const cellValue = Number(rawValue)
          const filterValue = Number(filter.value)

          if (isNaN(cellValue) || isNaN(filterValue)) return false

          switch (filter.operator) {
            case "equals":
              return cellValue === filterValue
            case "notEquals":
              return cellValue !== filterValue
            case "greaterThan":
              return cellValue > filterValue
            case "lessThan":
              return cellValue < filterValue
            case "greaterThanOrEqual":
              return cellValue >= filterValue
            case "lessThanOrEqual":
              return cellValue <= filterValue
            default:
              return true
          }
        } else if (fieldType === 'boolean') {
          const cellValue = Boolean(rawValue)
          // Map "Yes"/"No" to boolean
          const filterValue = filter.value.toLowerCase() === 'yes'

          return filter.operator === "equals" ? cellValue === filterValue : cellValue !== filterValue
        } else if (fieldType === 'date') {
          const cellDate = new Date(rawValue)
          const filterDate = new Date(filter.value)

          if (isNaN(cellDate.getTime()) || isNaN(filterDate.getTime())) return false

          switch (filter.operator) {
            case "equals":
              return cellDate.toDateString() === filterDate.toDateString()
            case "before":
              return cellDate < filterDate
            case "after":
              return cellDate > filterDate
            default:
              return true
          }
        } else {
          // String type (default)
          const cellValue = String(rawValue || "").toLowerCase()
          const filterValue = filter.value.toLowerCase()

          switch (filter.operator) {
            case "equals":
              return cellValue === filterValue
            case "notEquals":
              return cellValue !== filterValue
            case "contains":
              return cellValue.includes(filterValue)
            case "notContains":
              return !cellValue.includes(filterValue)
            default:
              return true
          }
        }
      })
    },
    getSortedRowModel: getSortedRowModel(),
    onGlobalFilterChange: setFilters,
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
    state: {
      globalFilter: filters,
    },
  })


  return (
    <>
      {resourceName && (
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold">
            {titleCase(pluralize(resourceName))}
          </h1>
          {refetch && (
            <Button
              variant="outline"
              size="sm"
              onClick={refetch}
              disabled={isLoading || isRefetching}
              className={`gap-2 transition-opacity duration-300 ${isLoading || isRefetching ? '!opacity-50 !pointer-events-auto cursor-not-allowed' : '!opacity-100 cursor-pointer'} animate-in fade-in duration-500`}
            >
              <RefreshCw className={`h-4 w-4 ${isRefetching ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          )}
        </div>
      )}
      <div className="flex items-center justify-between pb-2">
        <FilterBuilder
          columns={table.getAllColumns()}
          onFiltersChange={setFilters}
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

          <DataTableDialog table={table} resourceName={resourceName} />
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
                    <TableHead key={header.id} className={`text-xs font-bold border-r ${isIDColumn ? "w-[170px]" : ""} ${isSelectColumn ? "w-[40px] min-w-[40px] max-w-[40px] px-3" : ""}`}>
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
            {isLoading ? (
              <TableLoadingRows
                columns={columns.length + 1}
                message={resourceName ? `Loading ${pluralize(resourceName)}...` : "Loading data..."}
              />
            ) : table.getRowModel().rows?.length ? (
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
                        className={`${isMonospace ? "font-mono" : ""} ${isIDColumn ? "w-[170px]" : ""} ${isSelectColumn ? "w-[40px] min-w-[40px] max-w-[40px] px-3" : ""}`}
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


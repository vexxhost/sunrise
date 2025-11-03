"use client"

import {
  ColumnDef,
  SortingState,
  VisibilityState,
  ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  useReactTable,
  RowData,
  RowSelectionState,
} from "@tanstack/react-table"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { titleCase } from "title-case"
import { formatDistanceToNow } from 'date-fns'
import { FilterBuilder, Filter, FilterOperator } from "@/components/FilterBuilder"

declare module '@tanstack/react-table' {
  interface ColumnMeta<TData extends RowData, TValue> {
    label?: string
    monospace?: boolean
    fieldType: 'string' | 'number' | 'boolean' | 'date'
  }
}

// Helper function to extract label from column definition
function getColumnLabel<TData, TValue>(column: any): string {
  // First check if meta.label exists
  if (column.columnDef.meta?.label) {
    return column.columnDef.meta.label;
  }

  // If header is a string, use that
  if (typeof column.columnDef.header === 'string') {
    return column.columnDef.header;
  }

  // Try to extract text from header function by rendering it
  // This works for simple button headers with text content
  if (typeof column.columnDef.header === 'function') {
    try {
      // Try to render the header and extract text
      const headerElement = column.columnDef.header({ column: column });
      if (headerElement?.props?.children) {
        // Extract text from children (handles Button components with text)
        const children = headerElement.props.children;
        if (Array.isArray(children)) {
          const textChild = children.find((child: any) => typeof child === 'string');
          if (textChild) return textChild;
        } else if (typeof children === 'string') {
          return children;
        }
      }
    } catch (e) {
      // If extraction fails, fall through to column id
    }
  }

  // Otherwise fall back to column id (formatted)
  return titleCase(column.id.replace(/[_-]/g, ' '));
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
      <div className={`absolute inset-y-0 right-0 w-12 pointer-events-none opacity-100 group-hover/id:opacity-0 z-20 ${
        isSelected
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

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import React, { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem } from "@/components/ui/dropdown-menu"
import { DropdownMenuTrigger } from "@radix-ui/react-dropdown-menu"
import { TableLoadingRows } from "./TableLoading"
import { TableEmpty } from "./TableEmpty"
import { Settings, RefreshCw, ChevronDown, Copy, Check, ArrowUpDown, ArrowUp, ArrowDown, Search } from "lucide-react"
import pluralize from "pluralize"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationPrevious,
  PaginationNext,
  PaginationLink,
  PaginationEllipsis,
} from "@/components/ui/pagination"
import {
  DialogFooter,
} from "@/components/ui/dialog"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"

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
  defaultColumnVisibility?: VisibilityState
  onRowClick?: (row: TData) => void
  emptyMessage?: string
  pageSize?: number
  resourceName?: string
  emptyIcon: React.ComponentType<{ className?: string }>
}

export function DataTable<TData, TValue>({
  columns,
  data,
  isLoading = false,
  isRefetching = false,
  refetch,
  defaultColumnVisibility = {},
  onRowClick,
  emptyMessage,
  pageSize = 10,
  resourceName,
  emptyIcon,
}: DataTableProps<TData, TValue>) {

  const dataRef = React.useRef(data);
  const columnsRef = React.useRef(columns);

  if (dataRef.current !== data) {
    console.log('[DataTable] DATA CHANGED', { resourceName, dataLength: data.length });
    dataRef.current = data;
  }

  if (columnsRef.current !== columns) {
    console.log('[DataTable] COLUMNS CHANGED', { resourceName, columnsLength: columns.length });
    columnsRef.current = columns;
  }

  console.log('[DataTable] render', { resourceName, dataLength: data.length, columnsLength: columns.length });

  const pathname = usePathname()
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [filters, setFilters] = React.useState<Filter[]>([])
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>(defaultColumnVisibility)
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({})

  // Memoize state setters to prevent useReactTable from seeing new function references
  const setSortingMemo = React.useCallback(setSorting, []);
  const setColumnFiltersMemo = React.useCallback(setColumnFilters, []);
  const setColumnVisibilityMemo = React.useCallback(setColumnVisibility, []);
  const setRowSelectionMemo = React.useCallback(setRowSelection, []);

  // Dialog state management
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [tempPageSize, setTempPageSize] = React.useState(pageSize.toString())
  const [tempColumnVisibility, setTempColumnVisibility] = React.useState<VisibilityState>(defaultColumnVisibility)
  const [columnSearch, setColumnSearch] = React.useState("")

  // Add checkbox column
  const columnsWithCheckbox = React.useMemo<ColumnDef<TData, TValue>[]>(() => [
    {
      id: "select",
      header: ({ table }) => (
        <div className="flex items-center justify-center">
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && "indeterminate")
            }
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label="Select all"
          />
        </div>
      ),
      cell: ({ row }) => (
        <div className="flex items-center justify-center">
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
          />
        </div>
      ),
      enableSorting: false,
      enableHiding: false,
    } as ColumnDef<TData, TValue>,
    ...columns,
  ], [columns])

  // Apply custom filters
  const filteredData = React.useMemo(() => {
    if (filters.length === 0) return data

    return data.filter((row: any) => {
      return filters.every((filter) => {
        const rawValue = row[filter.columnId]

        // Get the column to check its field type
        const column = columnsWithCheckbox.find(col => {
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
    })
  }, [data, filters, columnsWithCheckbox])

  // Memoize table model functions to prevent recreating on every render
  const coreRowModel = React.useMemo(() => getCoreRowModel(), []);
  const paginationRowModel = React.useMemo(() => getPaginationRowModel(), []);
  const sortedRowModel = React.useMemo(() => getSortedRowModel(), []);
  const filteredRowModel = React.useMemo(() => getFilteredRowModel(), []);

  const table = useReactTable({
    data: filteredData,
    columns: columnsWithCheckbox,
    getCoreRowModel: coreRowModel,
    getPaginationRowModel: paginationRowModel,
    onSortingChange: setSortingMemo,
    getSortedRowModel: sortedRowModel,
    onColumnFiltersChange: setColumnFiltersMemo,
    getFilteredRowModel: filteredRowModel,
    onColumnVisibilityChange: setColumnVisibilityMemo,
    onRowSelectionChange: setRowSelectionMemo,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
    },
    initialState: {
      pagination: {
        pageSize,
      },
    },
  })

  // Create a minimal table just to render headers for loading/error states
  const headerTable = useReactTable({
    data: [] as TData[],
    columns: columnsWithCheckbox,
    getCoreRowModel: getCoreRowModel(),
  });

  // Show loading skeleton whenever loading (initial load or refresh)
  const renderTableContent = () => {
    if (isLoading) {
      return (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              {headerTable.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="text-xs font-bold hover:bg-transparent">
                  {headerGroup.headers.map((header) => {
                    const isIDColumn = typeof header.column.columnDef.header === 'string' && header.column.columnDef.header === 'ID';
                    const isSelectColumn = header.column.id === 'select';
                    return (
                      <TableHead key={header.id} className={`text-xs font-bold border-r ${isIDColumn ? "w-[170px]" : ""} ${isSelectColumn ? "w-12 p-0" : ""}`}>
                        {isSelectColumn ? (
                          flexRender(header.column.columnDef.header, header.getContext())
                        ) : (
                          <div className="py-2">
                            {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                          </div>
                        )}
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              <TableLoadingRows
                columns={columnsWithCheckbox.length}
                message={resourceName ? `Loading ${pluralize(resourceName)}...` : "Loading data..."}
              />
            </TableBody>
          </Table>
        </div>
      );
    }

    return (
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
                    <TableHead key={header.id} className={`text-xs font-bold border-r ${isIDColumn ? "w-[170px]" : ""} ${isSelectColumn ? "w-12 p-0" : ""}`}>
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
                  onClick={() => onRowClick?.(row.original)}
                  className={`group/row ${onRowClick ? "cursor-pointer" : ""}`}
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
                        className={`${isMonospace ? "font-mono" : ""} ${isIDColumn ? "w-[170px]" : ""} ${isSelectColumn ? "w-12 p-0" : ""}`}
                      >
                        {renderedCell}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))
            ) : (
              <TableEmpty
                columns={columnsWithCheckbox.length}
                message={emptyMessage || (resourceName ? `No ${pluralize(resourceName)} found.` : "No results.")}
                icon={emptyIcon}
              />
            )}
          </TableBody>
        </Table>
      </div>
    );
  };

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

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  setTempPageSize(table.getState().pagination.pageSize.toString())
                  setTempColumnVisibility(table.getState().columnVisibility)
                }}
              >
                <Settings className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Table Settings</DialogTitle>
                <DialogDescription>
                  Customize your table view and preferences
                </DialogDescription>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  table.setPageSize(Number(tempPageSize))
                  setColumnVisibility(tempColumnVisibility)
                  setDialogOpen(false)
                }}
              >
                <div className="flex gap-8 py-6">
                  <div className="flex-shrink-0 w-48">
                    <Label className="text-base font-semibold block mb-4">Page size</Label>
                    <RadioGroup
                      value={tempPageSize}
                      onValueChange={setTempPageSize}
                      className="gap-3"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="10" id="r1" />
                        <Label htmlFor="r1" className="font-normal cursor-pointer">
                          {resourceName ? `10 ${pluralize(resourceName)}` : '10'}
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="25" id="r2" />
                        <Label htmlFor="r2" className="font-normal cursor-pointer">
                          {resourceName ? `25 ${pluralize(resourceName)}` : '25'}
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="50" id="r3" />
                        <Label htmlFor="r3" className="font-normal cursor-pointer">
                          {resourceName ? `50 ${pluralize(resourceName)}` : '50'}
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>

                  <div className="flex-1 min-w-0">
                    <Label className="text-base font-semibold block mb-4">Visible columns</Label>
                    <Input
                      placeholder="Search columns..."
                      value={columnSearch}
                      onChange={(e) => setColumnSearch(e.target.value)}
                      className="mb-3 h-8 text-sm"
                    />
                    <div className="flex flex-col gap-y-3 max-h-[300px] overflow-y-auto pr-2">
                      {table.getAllColumns()
                        .filter((column) => column.getCanHide())
                        .filter((column) => {
                          const label = getColumnLabel(column);
                          return columnSearch === "" ||
                            label.toLowerCase().includes(columnSearch.toLowerCase()) ||
                            column.id.toLowerCase().includes(columnSearch.toLowerCase())
                        })
                        .map((column) => {
                          const label = getColumnLabel(column);
                          return (
                            <div key={column.id} className="flex items-center space-x-2">
                              <Checkbox
                                id={`dialog-${column.id}`}
                                checked={tempColumnVisibility[column.id] !== false}
                                onCheckedChange={(checked) => {
                                  setTempColumnVisibility({
                                    ...tempColumnVisibility,
                                    [column.id]: checked === true
                                  })
                                }}
                              />
                              <label
                                htmlFor={`dialog-${column.id}`}
                                className="text-sm font-normal cursor-pointer leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                              >
                                {label}
                              </label>
                            </div>
                          );
                        })
                      }
                    </div>
                  </div>
                </div>

                <DialogFooter className="mt-6">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setTempPageSize(table.getState().pagination.pageSize.toString())
                      setTempColumnVisibility(table.getState().columnVisibility)
                      setColumnSearch("")
                      setDialogOpen(false)
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit">Confirm</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {renderTableContent()}
    </>
  )
}


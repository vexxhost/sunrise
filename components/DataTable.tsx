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

declare module '@tanstack/react-table' {
  interface ColumnMeta<TData extends RowData, TValue> {
    label?: string
    monospace?: boolean
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
  return column.id.replace(/[_-]/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
}

// Helper function to capitalize resource name
function formatResourceName(name: string): string {
  return name
    .split(/[\s-_]+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// ID Cell Component with copy functionality and tooltip
function IDCell({ value, isSelected }: { value: string; isSelected: boolean }) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center gap-1 group">
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="relative w-[100px] overflow-hidden">
              <span className="font-mono text-sm tracking-tighter">
                {value}
              </span>
              {/* Gradient fade that adapts to background - selected state uses from-muted, hover uses from-muted/50, normal uses from-background */}
              <div className={`absolute inset-y-0 right-0 w-12 pointer-events-none ${
                isSelected
                  ? 'bg-gradient-to-l from-muted to-transparent'
                  : 'bg-gradient-to-l from-background to-transparent group-hover/row:from-muted/50'
              }`} />
            </div>
          </TooltipTrigger>
          <TooltipContent
            side="top"
            align="start"
            className="font-mono text-sm px-2 py-1 max-w-none rounded-md bg-black text-white border border-border tracking-tighter -ml-[10px]"
            sideOffset={-24}
            hideArrow
          >
            {value}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity duration-200 shrink-0 cursor-pointer"
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
import { Settings, RefreshCw, ChevronDown, Copy, Check, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react"
import pluralize from "pluralize"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
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
  searchOptions: BaseSearchOptions
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
  searchOptions,
  defaultColumnVisibility = {},
  onRowClick,
  emptyMessage,
  pageSize = 10,
  resourceName,
  emptyIcon,
}: DataTableProps<TData, TValue>) {

  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [searchOption, setSearchOption] = useState(Object.keys(searchOptions)[0] || 'name')
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>(defaultColumnVisibility)
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({})

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
    } as ColumnDef<TData, TValue>,
    ...columns,
  ], [columns])

  const table = useReactTable({
    data,
    columns: columnsWithCheckbox,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
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
  if (isLoading) {
    return (
      <>
        {resourceName && (
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-2xl font-semibold">
              {formatResourceName(pluralize(resourceName))}
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
        <div className="flex items-center justify-between pb-4">
          <div className="flex items-center flex-1 gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="rounded-r-none" variant="secondary" disabled>
                  {searchOptions[Object.keys(searchOptions)[0] as keyof BaseSearchOptions] || 'Search'} <ChevronDown className="ml-2" />
                </Button>
              </DropdownMenuTrigger>
            </DropdownMenu>
            <Input
              placeholder={resourceName ? `Loading ${pluralize(resourceName)}...` : "Loading..."}
              disabled
              className="rounded m-1 p-1 max-w-xs"
            />
            <Button variant="secondary" disabled className="rounded-l-none m-1 p-1">
              Reset Filter
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" disabled>
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              {headerTable.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="text-xs font-bold hover:bg-transparent">
                  {headerGroup.headers.map((header) => {
                    const isIDColumn = typeof header.column.columnDef.header === 'string' && header.column.columnDef.header === 'ID';
                    return (
                      <TableHead key={header.id} className={`text-xs font-bold border-r p-0 ${isIDColumn ? "w-[170px]" : ""}`}>
                        <div className="px-2 py-2">
                          {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                        </div>
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
      </>
    );
  }

  return (
    <>
      {resourceName && (
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-semibold">
            {formatResourceName(pluralize(resourceName))}
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
      <div className="flex items-center justify-between pb-4">
        <div className="flex items-center flex-1 gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="rounded-r-none" variant="secondary">
                {searchOptions[searchOption as keyof BaseSearchOptions]} <ChevronDown className="ml-2" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent aria-label="Search Filter">
              <DropdownMenuRadioGroup value={searchOption} onValueChange={setSearchOption}>
                {Object.keys(searchOptions).map(key => (
                  <DropdownMenuRadioItem key={key} value={key} className="capitalize">
                    {searchOptions[key as keyof typeof searchOptions]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <Input
            placeholder={`Filter by ${searchOption}`}
            value={(table.getColumn(searchOption)?.getFilterValue() as string) ?? ""}
            onChange={(event) =>
              table.getColumn(searchOption)?.setFilterValue(event.target.value)
            }
            className="rounded m-1 p-1 max-w-xs"
          />
          <Button variant="secondary" onClick={() => table.resetColumnFilters()} className="rounded-l-none m-1 p-1">
            Reset Filter
          </Button>
        </div>

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
                  <div className="space-y-4 flex-shrink-0 w-48">
                    <Label className="text-base font-semibold">Page size</Label>
                    <RadioGroup
                      value={tempPageSize}
                      onValueChange={setTempPageSize}
                      className="gap-3"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="10" id="r1" />
                        <Label htmlFor="r1" className="font-normal cursor-pointer">10</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="20" id="r2" />
                        <Label htmlFor="r2" className="font-normal cursor-pointer">20</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="30" id="r3" />
                        <Label htmlFor="r3" className="font-normal cursor-pointer">30</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="50" id="r4" />
                        <Label htmlFor="r4" className="font-normal cursor-pointer">50</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="100" id="r5" />
                        <Label htmlFor="r5" className="font-normal cursor-pointer">100</Label>
                      </div>
                    </RadioGroup>
                  </div>

                  <div className="space-y-4 flex-1 min-w-0">
                    <Label className="text-base font-semibold">Visible columns</Label>
                    <Input
                      placeholder="Search columns..."
                      value={columnSearch}
                      onChange={(e) => setColumnSearch(e.target.value)}
                      className="mb-3"
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

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="text-xs font-bold hover:bg-transparent">
                {headerGroup.headers.map((header) => {
                  const isIDColumn = typeof header.column.columnDef.header === 'string' && header.column.columnDef.header === 'ID';
                  const canSort = header.column.getCanSort();
                  const isSorted = header.column.getIsSorted();

                  return (
                    <TableHead key={header.id} className={`text-xs font-bold border-r p-0 ${isIDColumn ? "w-[170px]" : ""}`}>
                      {header.isPlaceholder ? null : (
                        canSort ? (
                          <Button
                            variant="ghost"
                            onClick={() => header.column.toggleSorting(isSorted === "asc")}
                            className="h-full w-full px-2 py-2 hover:bg-transparent font-bold rounded-none flex justify-between items-center"
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
                          <div className="px-2 py-2">
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
                    const isMonospace = cell.column.columnDef.meta?.monospace || isIDColumn;
                    const cellValue = cell.getValue();

                    return (
                      <TableCell
                        key={cell.id}
                        className={`${isMonospace ? "font-mono" : ""} ${isIDColumn ? "w-[170px]" : ""}`}
                      >
                        {isIDColumn && typeof cellValue === 'string' ? (
                          <IDCell value={cellValue} isSelected={row.getIsSelected()} />
                        ) : (
                          flexRender(cell.column.columnDef.cell, cell.getContext())
                        )}
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
    </>
  )
}


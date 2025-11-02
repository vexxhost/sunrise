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
} from "@tanstack/react-table"

declare module '@tanstack/react-table' {
  interface ColumnMeta<TData extends RowData, TValue> {
    label?: string
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

  // Otherwise fall back to column id
  return column.id;
}

// Helper function to capitalize resource name
function formatResourceName(name: string): string {
  return name
    .split(/[\s-_]+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import React, { useState, Suspense } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem } from "@/components/ui/dropdown-menu"
import { DropdownMenuTrigger } from "@radix-ui/react-dropdown-menu"
import { ChevronDownIcon } from "@/components/ChevronDownIcon"
import { TableLoadingRows } from "./TableLoading"
import { Settings } from "lucide-react"
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
  searchOptions: BaseSearchOptions
  defaultColumnVisibility?: VisibilityState
  onRowClick?: (row: TData) => void
  emptyMessage?: string
  pageSize?: number
  resourceName?: string
}

export function DataTable<TData, TValue>({
  columns,
  data,
  searchOptions,
  defaultColumnVisibility = {},
  onRowClick,
  emptyMessage = "No results.",
  pageSize = 10,
  resourceName,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [searchOption, setSearchOption] = useState(Object.keys(searchOptions)[0] || 'name')
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>(defaultColumnVisibility)

  // Dialog state management
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [tempPageSize, setTempPageSize] = React.useState(pageSize.toString())
  const [tempColumnVisibility, setTempColumnVisibility] = React.useState<VisibilityState>(defaultColumnVisibility)
  const [columnSearch, setColumnSearch] = React.useState("")

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
    },
    initialState: {
      pagination: {
        pageSize,
      },
    },
  })

  return (
    <>
      {resourceName && (
        <h1 className="text-4xl font-semibold mb-6 pb-2 border-b-2">
          {formatResourceName(resourceName)}
        </h1>
      )}
      <div className="flex items-center justify-between py-4">
        <div className="flex items-center flex-1 gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="rounded-r-none" variant="secondary">
                {searchOptions[searchOption as keyof BaseSearchOptions]} <ChevronDownIcon className="ml-2" />
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
              <TableRow key={headerGroup.id} className="text-xs font-bold">
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="text-xs font-bold">
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
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
                  className={onRowClick ? "cursor-pointer" : ""}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </>
  )
}

interface DataTableAsyncProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  dataPromise: Promise<TData[]>
  searchOptions: BaseSearchOptions
  defaultColumnVisibility?: VisibilityState
  onRowClick?: (row: TData) => void
  emptyMessage?: string
  pageSize?: number
  resourceName?: string
}

function DataTableBody<TData, TValue>({
  dataPromise,
  columns,
  searchOptions,
  defaultColumnVisibility,
  onRowClick,
  emptyMessage,
  pageSize,
  resourceName,
}: DataTableAsyncProps<TData, TValue>) {
  const data = React.use(dataPromise);

  return (
    <DataTable
      data={data}
      columns={columns}
      searchOptions={searchOptions}
      defaultColumnVisibility={defaultColumnVisibility}
      onRowClick={onRowClick}
      emptyMessage={emptyMessage}
      pageSize={pageSize}
      resourceName={resourceName}
    />
  )
}

export function DataTableAsync<TData, TValue>({
  columns,
  dataPromise,
  searchOptions,
  defaultColumnVisibility,
  onRowClick,
  emptyMessage,
  pageSize,
  resourceName,
}: DataTableAsyncProps<TData, TValue>) {
  // Create a minimal table just to render headers
  const headerTable = useReactTable({
    data: [] as TData[],
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <Suspense
      fallback={
        <>
          {resourceName && (
            <h1 className="text-4xl font-semibold mb-6 pb-2 border-b-2">
              {formatResourceName(resourceName)}
            </h1>
          )}
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center flex-1 gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button className="rounded-r-none" variant="secondary" disabled>
                    {searchOptions[Object.keys(searchOptions)[0] as keyof BaseSearchOptions] || 'Search'} <ChevronDownIcon className="ml-2" />
                  </Button>
                </DropdownMenuTrigger>
              </DropdownMenu>
              <Input
                placeholder="Loading..."
                disabled
                className="rounded m-1 p-1 max-w-xs"
              />
              <Button variant="secondary" disabled className="rounded-l-none m-1 p-1">
                Reset Filter
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious className="pointer-events-none opacity-50" />
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationLink className="pointer-events-none">1</PaginationLink>
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationNext className="pointer-events-none opacity-50" />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>

              <Button variant="outline" size="icon" disabled>
                <Settings className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                {headerTable.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id} className="text-xs font-bold">
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id} className="text-xs font-bold">
                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                <TableLoadingRows columns={columns.length} />
              </TableBody>
            </Table>
          </div>
        </>
      }
    >
      <DataTableBody
        dataPromise={dataPromise}
        columns={columns}
        searchOptions={searchOptions}
        defaultColumnVisibility={defaultColumnVisibility}
        onRowClick={onRowClick}
        emptyMessage={emptyMessage}
        pageSize={pageSize}
        resourceName={resourceName}
      />
    </Suspense>
  )
}

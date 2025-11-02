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
} from "@tanstack/react-table"

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
import { ChevronDown } from "lucide-react"
import { TableLoadingRows } from "./TableLoading"

interface DataTableWrapperProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  dataPromise: Promise<TData[]>
  searchOptions: BaseSearchOptions
}

function DataTableBody<TData, TValue>({
  dataPromise,
  columns,
  searchOptions
}: {
  dataPromise: Promise<TData[]>
  columns: ColumnDef<TData, TValue>[]
  searchOptions: BaseSearchOptions
}) {
  const data = React.use(dataPromise);
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [searchOption, setSearchOption] = useState('name')
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})

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
  })

  return (
    <>
      <div className="flex items-center py-4">
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="ml-auto">
              Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {table.getAllColumns().filter((column) => column.getCanHide()).map((column) => (
              <DropdownMenuCheckboxItem
                key={column.id}
                className="capitalize"
                checked={column.getIsVisible()}
                onCheckedChange={(value) => column.toggleVisibility(!!value)}
              >
                {column.id}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
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
                <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
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
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-end space-x-2 py-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          Previous
        </Button>
        <span>
          Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          Next
        </Button>
      </div>
    </>
  )
}

export function DataTableWrapper<TData, TValue>({
  columns,
  dataPromise,
  searchOptions,
}: DataTableWrapperProps<TData, TValue>) {
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
          <div className="flex items-center py-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="rounded-r-none" variant="secondary" disabled>
                  {searchOptions['name' as keyof BaseSearchOptions] || 'Search'} <ChevronDown className="ml-2" />
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="ml-auto" disabled>
                  Columns
                </Button>
              </DropdownMenuTrigger>
            </DropdownMenu>
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
      <DataTableBody dataPromise={dataPromise} columns={columns} searchOptions={searchOptions} />
    </Suspense>
  )
}

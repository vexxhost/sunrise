'use client'

import {
  ColumnDef,
  RowData,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'

declare module '@tanstack/react-table' {
  interface ColumnMeta<TData extends RowData, TValue> {
    label: string
  }
}

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table"

import { ArrowUp, ArrowDown, MoreHorizontal } from "lucide-react"

import { type Key, useCallback, useMemo, useState } from 'react';
import { Badge } from "@/components/ui/badge"
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import {
  type SearchOptions,
  searchOptions,
  statusColorMap,
} from './meta'
import { Flavor, type ListServersOptions, type Server } from '@/lib/nova'
import { Image } from '@/lib/glance'
import { SearchIcon } from "@/components/SearchIcon";
import { ChevronDownIcon } from "@/components/ChevronDownIcon";
import { useRouter, usePathname } from "next/navigation";
import { getRelativeTimeString } from '@/lib/date';

interface DataTableProps<Server> {
  servers: Server[]
  images: { [key: string]: string },
  flavors: { [key: string]: string },
  volumeImageIds: { [key: string]: string },
  options: ListServersOptions
}

const IpAddress = ({ addresses }: { addresses: { [key: string]: { version: string, addr: string, "OS-EXT-IPS:type": string, "OS-EXT-IPS-MAC:mac_addr": string }[] } }) => {
  return Object.keys(addresses).map((key: string) => {
    return <table key={key}><tbody><tr className="pb-2">
      <td className="align-top pr-2"><small><strong>{key}</strong></small></td>
      <td className="align-top">{addresses[key].map((address) => <div key={address.addr}>{address.addr}</div>)}</td>
    </tr></tbody></table>
  })
}

export default function TableComponent<Server>({
  servers,
  images,
  flavors,
  volumeImageIds,
  options
}: DataTableProps<Server>) {

  const router = useRouter();
  const pathname = usePathname();

  const [filterValue, setFilterValue] = useState('')
  const [searchOption, setSearchOption] = useState('name')
  const sortKey = options['sort_key']
  const sortDir = options['sort_dir']

  const refreshPage = (_options?: { sort_key: string, sort_dir: string }) => {
    const urlSearchParams = new URLSearchParams()
    if (searchOption && filterValue != '') {
      urlSearchParams.append(searchOption, filterValue)
    }
    if (_options !== undefined && _options.sort_key + _options.sort_dir != 'created_atdescending') {
      urlSearchParams.append('sort_key', _options.sort_key)
      urlSearchParams.append('sort_dir', _options.sort_dir)
    }
    const searchParams = urlSearchParams.toString()
    const url = pathname + (searchParams != '' ? "?" + searchParams : '')
    router.replace(url);
  }

  const handleSortChange = useCallback((value: { column: string, direction: string }) => {
    refreshPage({
      sort_key: value.column,
      sort_dir: value.direction
    })
  }, [])

  const onClear = useCallback(() => {
    setFilterValue('')
  }, [])

  const handleFilterClick = () => {
    refreshPage()
  }

  const handleViewInstance = (serverId: string) => {
    console.log('Viewing instance', serverId)
    router.push('/compute/instance/' + serverId)
  }

  const columns: ColumnDef<Server>[] = [
    {
      accessorKey: "id",
      header: "ID",
      meta: {
        label: "ID"
      },
    },
    {
      accessorKey: "name",
      header: "Instance Name",
      meta: {
        label: "Instance Name"
      },
    },
    {
      accessorKey: "image",
      header: "Image Name",
      meta: {
        label: "Image Name"
      },
      cell: ({ row }) => {
        const image: Image = row.getValue('image')
        const attachedVolumes = row.original['os-extended-volumes:volumes_attached' as keyof Server] as { id: string }[]
        return image && (typeof image == 'object') ? images[image.id] : images[volumeImageIds[attachedVolumes[0].id]]
      }
    },
    {
      accessorKey: "addresses",
      header: "IP Address",
      meta: {
        label: "IP Address"
      },
      cell: ({ row }) => <IpAddress addresses={row.getValue('addresses')} />
    },
    {
      accessorKey: "flavor",
      header: "Flavor",
      meta: {
        label: "Flavor"
      },
      cell: ({ row }) => {
        const flavor: Flavor = row.getValue('flavor')
        return flavors[flavor.id]
      }
    },
    {
      accessorKey: "key_name",
      header: "Key Pair",
      meta: {
        label: "Key Pair"
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      meta: {
        label: "Status"
      },
      cell: ({ row }) => {
        const status = row.getValue('status')
        const variant = status === 'ACTIVE' ? 'default' : 'secondary'
        return (
          <Badge className="text-xs capitalize" variant={variant}>
            <span className="font=bold">{row.getValue('status')}</span>
          </Badge>
        )
      }
    },
    {
      accessorKey: "alert",
      header: "Alert",
      meta: {
        label: "Alert"
      },
      cell: ({ row }) => "N/A"
    },
    {
      accessorKey: "OS-EXT-AZ:availability_zone",
      header: "Availability Zone",
      meta: {
        label: "Availability Zone"
      },
    },
    {
      accessorKey: "task",
      header: "Task",
      meta: {
        label: "Task"
      },
      cell: ({ row }) => "None"
    },
    {
      accessorKey: "OS-EXT-STS:power_state",
      header: "Power State",
      meta: {
        label: "Power State"
      },
      cell: ({ row }) => row.getValue('OS-EXT-STS:power_state') == 1 ? "Running" : "Stopped"
    },
    {
      accessorKey: "OS-SRV-USG:launched_at",
      meta: {
        label: "Age"
      },
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => handleSortChange({
              column: 'created_at',
              direction: sortDir === "asc" ? 'desc' : 'asc',
            })}
          >
            Age
            {sortDir === 'asc' ? <ArrowUp className="ml-2 h-4 w-4" /> : <ArrowDown className="ml-2 h-4 w-4" />}
          </Button>
        )
      },
      cell: ({ row }) => getRelativeTimeString(Date.parse(row.getValue('OS-SRV-USG:launched_at')), 'en-US')
    },
    {
      accessorKey: "actions",
      header: "Actions",
      meta: {
        label: "Actions"
      },
      enableHiding: false,
      cell: ({ row }) => {
        return (
          <div className="relative flex justify-center items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => handleViewInstance(row.getValue('id'))}>View</DropdownMenuItem>
                <DropdownMenuItem>Edit</DropdownMenuItem>
                <DropdownMenuItem>Delete</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      }
    },
  ];

  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    id: false,
    alert: false,
    'OS-EXT-AZ:availability_zone': false,
    task: false
  })

  const table = useReactTable<Server>({
    data: servers,
    columns,
    getCoreRowModel: getCoreRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: {
      columnVisibility
    }
  })

  return (<>

    <div className="flex items-center w-full">
      <div className="flex flex-1 py-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="rounded-r-none" variant="secondary">
              {searchOptions[searchOption as keyof SearchOptions]} <ChevronDownIcon className="ml-2" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            aria-label="Search Filter"
          >
            <DropdownMenuRadioGroup value={searchOption} onValueChange={setSearchOption}>
              {Object.keys(searchOptions).map(key => {
                return <DropdownMenuRadioItem key={key} value={key} className="capitalize">
                  {searchOptions[key as keyof typeof searchOptions]}
                </DropdownMenuRadioItem>
              })}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <Input
          className="rounded-none w-full sm:max-w-[44%] ring-1 ring-gray-100 ring-inset focus-visible:ring-1 focus-visible:border-none focus-visible:outline-none focus:border-none border-none focus:outline-none outline-none"
          placeholder={`Search by ${searchOptions[searchOption as keyof SearchOptions]}...`}
          value={filterValue}
          onChange={(e) => setFilterValue(e.currentTarget.value)}
        />
        <Button className="rounded-l-none" variant="secondary" onClick={handleFilterClick}>Filter</Button>
      </div>
      <div className="flex flex-1 py-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" className="ml-auto">Columns</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {table
              .getAllColumns()
              .filter(
                (column) => column.getCanHide()
              )
              .map((column) => {
                return (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    className="capitalize"
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) => column.toggleVisibility(!!value)}
                  >{column.columnDef.meta?.label as string}</DropdownMenuCheckboxItem>
                )
              })
            }
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
    <div><div className="rounded-md border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                return (
                  <TableHead key={header.id} className="text-xs font-bold">
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                  </TableHead>
                )
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
    </div>
  </>)
}

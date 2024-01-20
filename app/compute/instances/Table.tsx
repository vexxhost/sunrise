'use client'

import { type Key, useCallback, useMemo, useState } from 'react';
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Input,
  Button,
  DropdownTrigger,
  Dropdown,
  DropdownMenu,
  DropdownItem,
  Chip,
} from "@nextui-org/react";
import { 
  type SearchOptions, 
  searchOptions,
  statusColorMap,
  columns 
} from './meta'
import { type ListServersOptions, type Server } from '@/lib/nova'
import { PlusIcon } from "@/components/PlusIcon";
import { VerticalDotsIcon } from "@/components/VerticalDotsIcon";
import { SearchIcon } from "@/components/SearchIcon";
import { ChevronDownIcon } from "@/components/ChevronDownIcon";
import { capitalize } from "@/lib/utils";
import { useRouter, usePathname } from "next/navigation";
import { getRelativeTimeString } from '@/lib/date';
 
const INITIAL_VISIBLE_COLUMNS = ["display_name", "ip_address", "flavor", "status", "power_state", "created_at", "actions"];

const IpAddress = ({ addresses }: {addresses: {[key: string]: {version: string, addr: string, "OS-EXT-IPS:type": string, "OS-EXT-IPS-MAC:mac_addr": string}[]}}) => {
  return Object.keys(addresses).map((key: string) => {
    return <table key={key}><tbody><tr className="pb-2">
      <td className="align-top pr-2"><small><strong>{key}</strong></small></td>
      <td className="align-top">{addresses[key].map((address) => <div key={address.addr}>{address.addr}</div>)}</td>
    </tr></tbody></table>
  })
}

interface AppProps {
  servers: Server[]
  images: {[key: string]: string},
  flavors: {[key: string]: string},
  options: ListServersOptions
}

export default function TableComponent({servers, images, flavors, options}: AppProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [filterValue, setFilterValue] = useState('')
  const [searchOption, setSearchOption] = useState('name')
  const [visibleColumns, setVisibleColumns] = useState(new Set(INITIAL_VISIBLE_COLUMNS))

  const sortDescriptor = {
    column: options.sort_key,
    direction: options.sort_dir == 'desc' ? 'descending' : 'ascending'
  }

  const headerColumns = useMemo(() => {
    return columns.filter((column) => Array.from(visibleColumns).includes(column.uid));
  }, [visibleColumns]);

  const renderCell = useCallback((item:Server, columnKey:string): React.ReactNode => {
    const cellValue = item[columnKey as keyof Server];

    switch (columnKey) {
      case "display_name":
        return item['name']
      case "image_name":
        return item['image']
      case "ip_address":
        return <IpAddress addresses={item['addresses']} />
      case "flavor":
        return flavors[item['flavor'].id]
      case "key_pair":
        return item['key_name']
      case "status":
        return (
          <Chip className="capitalize" color={statusColorMap[item.status] as any} size="sm" variant="flat">
            {item['status']}
          </Chip>
        );
      case "alert":
        return "N/A"
      case "availability_zone":
        return item['OS-EXT-AZ:availability_zone']
      case "task":
        return "None"
      case "power_state":
        return (item['OS-EXT-STS:power_state'] == 1) ? "Running" : "Stopped"
      case "created_at":
        return getRelativeTimeString(Date.parse(item['OS-SRV-USG:launched_at']), 'en-US')
      case "actions":
        return (
          <div className="relative flex justify-center items-center gap-2">
            <Dropdown>
              <DropdownTrigger>
                <Button isIconOnly size="sm" variant="light">
                  <VerticalDotsIcon className="text-default-300" />
                </Button>
              </DropdownTrigger>
              <DropdownMenu>
                <DropdownItem>View</DropdownItem>
                <DropdownItem>Edit</DropdownItem>
                <DropdownItem>Delete</DropdownItem>
              </DropdownMenu>
            </Dropdown>
          </div>
        );
      default:
        return cellValue as React.ReactNode;
    }
  }, [flavors]);

  const refreshPage = (_options?: {sort_key: string, sort_dir: string}) => {
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

  const onSetSearchOption = (value: Key) => {
    setSearchOption(value as keyof SearchOptions)
  }

  const handleSortChange = useCallback((value: {column: string, direction: string}) => {
    refreshPage({
      sort_key: value.column,
      sort_dir: value.direction == 'ascending' ? 'asc' : 'desc'
    })
  }, [])

  const onSearchChange = useCallback((value: any) => {
    setFilterValue(value)
  }, [])

  const onSetVisibleColumns = useCallback((value: any) => {
    setVisibleColumns(value)
  }, [])

  const onClear = useCallback(()=>{
    setFilterValue('')
  },[])

  const handleFilterClick = () => {
    refreshPage()
  }

  const topContent = useMemo(() => {
    return (
      <div className="flex flex-col gap-4 pt-4">
        <div className="flex justify-between gap-3 items-end">
          <Dropdown>
            <DropdownTrigger className="hidden sm:flex">
              <Button endContent={<ChevronDownIcon className="text-small" />} variant="flat">
                {searchOptions[searchOption as keyof SearchOptions]}
              </Button>
            </DropdownTrigger>
            <DropdownMenu
              disallowEmptySelection
              aria-label="Search Filter"
              closeOnSelect={true}
              onAction={onSetSearchOption}
            >
              {Object.keys(searchOptions).map(key => {
                return <DropdownItem key={key} className="capitalize">
                  {searchOptions[key as keyof typeof searchOptions]}
                </DropdownItem>
              })}
            </DropdownMenu>
          </Dropdown>
          <Input
            isClearable
            className="w-full sm:max-w-[44%]"
            placeholder={`Search by ${searchOptions[searchOption as  keyof SearchOptions]}...`}
            startContent={<SearchIcon />}
            value={filterValue}
            onClear={() => onClear()}
            onValueChange={onSearchChange}
            style={{border: 0, outline: 0, outlineOffset: 0}}
          />
          <Button onClick={handleFilterClick}>Filter</Button>
          <div className="flex gap-3">
            <Dropdown>
              <DropdownTrigger className="hidden sm:flex">
                <Button endContent={<ChevronDownIcon className="text-small" />} variant="flat">
                  Columns
                </Button>
              </DropdownTrigger>
              <DropdownMenu
                disallowEmptySelection
                aria-label="Table Columns"
                closeOnSelect={false}
                selectedKeys={visibleColumns}
                selectionMode="multiple"
                onSelectionChange={onSetVisibleColumns}
              >
                {columns.map((column) => (
                  <DropdownItem key={column.uid} className="capitalize">
                    {capitalize(column.name)}
                  </DropdownItem>
                ))}
              </DropdownMenu>
            </Dropdown>
            <Button color="primary" endContent={<PlusIcon />}>
              Add New
            </Button>
          </div>
        </div>
      </div>
    );
  }, [
    filterValue,
    searchOption,
    visibleColumns,
    handleFilterClick,
    onClear,
    onSearchChange,
    onSetVisibleColumns
  ]);

  return <>
    <Table
      aria-label="Compute Instances"
      isHeaderSticky
      bottomContentPlacement="outside"
      sortDescriptor={sortDescriptor as any}
      topContent={topContent}
      topContentPlacement="outside"
      onSortChange={handleSortChange as any}
    >
      <TableHeader columns={headerColumns}>
        {(column) => (
          <TableColumn
            key={column.uid}
            align={column.uid === "actions" ? "center" : "start"}
            allowsSorting={column.sortable}
          >
            {column.name}
          </TableColumn>
        )}
      </TableHeader>
      <TableBody emptyContent={"No instances found"} items={servers}>
        {(item:Server) => (
          <TableRow key={item.id}>
            {(columnKey) => <TableCell>{renderCell(item, columnKey as string)}</TableCell>}
          </TableRow>
        )}
      </TableBody>
    </Table>
  </>
}

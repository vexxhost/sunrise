"use client";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { RefreshCw, Filter as FilterIcon, ChevronDown } from "lucide-react";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationPrevious,
  PaginationNext,
} from "@/components/ui/pagination";
import { FilterBuilder, Filter } from "@/components/FilterBuilder";
import { DataTablePagination } from "./Pagination";
import { DataTableDialog } from "@/components/DataTableDialog";
import { Table } from "@tanstack/react-table";
import { DataTableRowAction } from "@/components/DataTable";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DataTableDialogButton } from "./Dialog";

interface DataTableToolbarProps<TData> {
  table?: Table<TData>;
  data?: TData[];
  resourceName: string;
  rowActions?: DataTableRowAction<TData>[];
  isRefetching?: boolean;
  refetch?: () => void;
  onFiltersChange?: (filters: Filter[]) => void;
}

export function DataTableToolbar<TData>({
  table,
  data = [],
  resourceName,
  rowActions = [],
  isRefetching = false,
  refetch,
  onFiltersChange,
}: DataTableToolbarProps<TData>) {
  const hasTable = !!table;

  return (
    <div className="flex items-center justify-between pb-2">
      <div className="inline-flex rounded-md shadow-sm">
        {hasTable && onFiltersChange ? (
          <FilterBuilder
            columns={table.getAllColumns()}
            onFiltersChange={onFiltersChange}
            data={data}
          />
        ) : (
          <Button
            variant="outline"
            disabled
            className="h-10"
          >
            <FilterIcon className="mr-1 h-3 w-3" />
            Filter
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2">
        {hasTable && (
          <DataTablePagination table={table} />
        )}

        {rowActions.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="gap-2 h-10 cursor-pointer"
                disabled={!hasTable || (hasTable && table.getFilteredSelectedRowModel().rows.length === 0)}
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
                      if (hasTable) {
                        const selectedRows = table.getFilteredSelectedRowModel().rows.map(row => row.original);
                        action.onClick(selectedRows);
                      }
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
          <Button
            variant="outline"
            size="sm"
            onClick={refetch}
            disabled={!hasTable || isRefetching}
            className={`gap-2 h-10 ${isRefetching ? 'opacity-50 cursor-not-allowed' : hasTable ? 'cursor-pointer' : ''}`}
          >
            <RefreshCw className={`h-4 w-4 ${isRefetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {table ? (
            <DataTableDialog table={table} resourceName={resourceName} />
          ) : (
            <DataTableDialogButton disabled={true} />
          )}
        </ButtonGroup>
      </div>
    </div>
  );
}

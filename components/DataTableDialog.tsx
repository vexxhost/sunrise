"use client"

import { useState } from "react"
import { Table } from "@tanstack/react-table"
import { Settings } from "lucide-react"
import pluralize from "pluralize"
import { titleCase } from "title-case"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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

interface DataTableDialogProps<TData> {
  table: Table<TData>
  resourceName?: string
}

export function DataTableDialog<TData>({
  table,
  resourceName,
}: DataTableDialogProps<TData>) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [columnSearch, setColumnSearch] = useState("")

  const handleOpenChange = (open: boolean) => {
    setDialogOpen(open)

    if (!open) {
      setColumnSearch("")
    }
  }

  return (
    <Dialog open={dialogOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-10 px-3 cursor-pointer"
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
        <div className="flex gap-8 py-6">
          <div className="flex-shrink-0 w-48">
            <Label className="text-base font-semibold block mb-4">Page size</Label>
            <RadioGroup
              value={String(table.getState().pagination.pageSize)}
              onValueChange={(value) => table.setPageSize(Number(value))}
              className="gap-3"
            >
              {[10, 25, 50].map((size) => (
                <div key={size} className="flex items-center space-x-2">
                  <RadioGroupItem value={String(size)} id={`r${size}`} />
                  <Label htmlFor={`r${size}`} className="font-normal cursor-pointer">
                    {resourceName ? `${size} ${pluralize(resourceName)}` : String(size)}
                  </Label>
                </div>
              ))}
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
                        checked={column.getIsVisible()}
                        disabled={!column.getCanHide()}
                        onCheckedChange={() => column.toggleVisibility()}
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
      </DialogContent>
    </Dialog>
  )
}

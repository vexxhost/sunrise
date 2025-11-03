"use client"

import * as React from "react"
import { Search, X, Filter as FilterIcon } from "lucide-react"
import { Column } from "@tanstack/react-table"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export type FilterOperator =
  | "equals"
  | "notEquals"
  | "contains"
  | "notContains"
  | "greaterThan"
  | "lessThan"
  | "greaterThanOrEqual"
  | "lessThanOrEqual"
  | "between"
  | "before"
  | "after"

export interface Filter {
  id: string
  columnId: string
  columnLabel: string
  operator: FilterOperator
  value: string
  value2?: string // For "between" operator
}

interface FilterBuilderProps<TData> {
  columns: Column<TData, unknown>[]
  onFiltersChange: (filters: Filter[]) => void
  data: TData[]
}

type FieldType = 'string' | 'number' | 'boolean' | 'date'

const OPERATORS_BY_TYPE: Record<FieldType, { value: FilterOperator; label: string }[]> = {
  string: [
    { value: "equals", label: "Equals" },
    { value: "notEquals", label: "Does Not Equal" },
    { value: "contains", label: "Contains" },
    { value: "notContains", label: "Does Not Contain" },
  ],
  number: [
    { value: "equals", label: "Equals" },
    { value: "notEquals", label: "Does Not Equal" },
    { value: "greaterThan", label: "Greater Than" },
    { value: "lessThan", label: "Less Than" },
    { value: "greaterThanOrEqual", label: "Greater Than or Equal" },
    { value: "lessThanOrEqual", label: "Less Than or Equal" },
  ],
  boolean: [
    { value: "equals", label: "Is" },
  ],
  date: [
    { value: "equals", label: "On" },
    { value: "before", label: "Before" },
    { value: "after", label: "After" },
  ],
}

type BuilderStep = "field" | "operator" | "value"

function getColumnLabel(column: Column<any, unknown>): string {
  if (column.columnDef.meta?.label) {
    return column.columnDef.meta.label
  }
  if (typeof column.columnDef.header === "string") {
    return column.columnDef.header
  }
  return column.id
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (l: string) => l.toUpperCase())
}

export function FilterBuilder<TData>({
  columns,
  onFiltersChange,
  data,
}: FilterBuilderProps<TData>) {
  const [open, setOpen] = React.useState(false)
  const [filters, setFilters] = React.useState<Filter[]>([])
  const [searchValue, setSearchValue] = React.useState("")

  // Builder state
  const [builderStep, setBuilderStep] = React.useState<BuilderStep>("field")
  const [selectedColumn, setSelectedColumn] = React.useState<Column<TData, unknown> | null>(null)
  const [selectedOperator, setSelectedOperator] = React.useState<FilterOperator | null>(null)
  const [valueInput, setValueInput] = React.useState("")
  const [highlightedIndex, setHighlightedIndex] = React.useState<number>(-1)

  // Get filterable columns (exclude select checkbox and ID columns)
  const filterableColumns = React.useMemo(() => {
    return columns.filter(
      (col) => col.id !== "select" && col.columnDef.meta?.fieldType
    )
  }, [columns])

  // Get unique values for the selected column
  const columnValues = React.useMemo(() => {
    if (!selectedColumn) return []

    const fieldType = selectedColumn.columnDef.meta?.fieldType as FieldType | undefined

    // For boolean fields, return Yes/No options
    if (fieldType === 'boolean') {
      return ['Yes', 'No']
    }

    const values = new Set<string>()
    data.forEach((row: any) => {
      const value = row[selectedColumn.id]
      if (value != null && value !== "") {
        values.add(String(value))
      }
    })

    const valuesArray = Array.from(values)

    // Sort based on field type
    if (fieldType === 'number') {
      return valuesArray.sort((a, b) => Number(a) - Number(b))
    } else if (fieldType === 'date') {
      return valuesArray.sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
    } else {
      // String sorting (case-insensitive)
      return valuesArray.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    }
  }, [selectedColumn, data])

  const addFilter = () => {
    if (!selectedColumn || !selectedOperator || !valueInput.trim()) return

    const newFilter: Filter = {
      id: Math.random().toString(36).substring(7),
      columnId: selectedColumn.id,
      columnLabel: getColumnLabel(selectedColumn),
      operator: selectedOperator,
      value: valueInput.trim(),
    }

    const newFilters = [...filters, newFilter]
    setFilters(newFilters)
    onFiltersChange(newFilters)

    // Reset builder
    resetBuilder()
    setOpen(false)
  }

  const removeFilter = (id: string) => {
    const newFilters = filters.filter((f) => f.id !== id)
    setFilters(newFilters)
    onFiltersChange(newFilters)
  }

  const clearAllFilters = () => {
    setFilters([])
    onFiltersChange([])
  }

  const resetBuilder = () => {
    setBuilderStep("field")
    setSelectedColumn(null)
    setSelectedOperator(null)
    setValueInput("")
    setSearchValue("")
    setHighlightedIndex(-1)
  }

  const handleFieldSelect = (column: Column<TData, unknown>) => {
    setSelectedColumn(column)
    setBuilderStep("operator")
    setHighlightedIndex(-1)
    setSearchValue("")
  }

  const handleOperatorSelect = (operator: FilterOperator) => {
    setSelectedOperator(operator)
    setBuilderStep("value")
    setHighlightedIndex(-1)
    setSearchValue("")
    setValueInput("")
  }

  // Get current list of items for navigation
  const getCurrentItems = () => {
    if (builderStep === "field") {
      return filterableColumns.filter((column) =>
        getColumnLabel(column).toLowerCase().includes(searchValue.toLowerCase())
      )
    } else if (builderStep === "operator" && selectedColumn) {
      return getOperatorsForColumn(selectedColumn)
    } else if (builderStep === "value") {
      return columnValues.filter((val) =>
        val.toLowerCase().includes(valueInput.toLowerCase())
      )
    }
    return []
  }

  // Reset highlighted index only when switching steps, not when typing
  React.useEffect(() => {
    setHighlightedIndex(-1)
  }, [builderStep])

  // Refocus the input when step changes
  React.useEffect(() => {
    if (open) {
      // Wait for the Command component to remount, then focus the input
      const timer = setTimeout(() => {
        const input = document.querySelector('[cmdk-input]') as HTMLInputElement
        if (input) {
          input.focus()
        }
      }, 0)
      return () => clearTimeout(timer)
    }
  }, [builderStep, open])

  // Clamp highlighted index when list changes
  React.useEffect(() => {
    const items = getCurrentItems()
    if (highlightedIndex >= items.length && items.length > 0) {
      setHighlightedIndex(items.length - 1)
    }
  }, [searchValue, valueInput])

  // Scroll highlighted item into view
  React.useEffect(() => {
    const items = document.querySelectorAll('[data-highlighted="true"]')
    if (items.length > 0) {
      items[0].scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [highlightedIndex])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const items = getCurrentItems()
    const maxIndex = items.length - 1

    if (e.key === "ArrowDown") {
      e.preventDefault()
      setHighlightedIndex((prev) => {
        // If nothing selected yet, select first item
        if (prev === -1) return 0
        const next = prev < maxIndex ? prev + 1 : prev
        console.log('ArrowDown: prev=', prev, 'next=', next, 'maxIndex=', maxIndex)
        return next
      })
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setHighlightedIndex((prev) => {
        const next = prev > 0 ? prev - 1 : 0
        console.log('ArrowUp: prev=', prev, 'next=', next)
        return next
      })
    } else if (e.key === "Enter") {
      e.preventDefault()

      if (builderStep === "field") {
        const filtered = filterableColumns.filter((column) =>
          getColumnLabel(column).toLowerCase().includes(searchValue.toLowerCase())
        )
        // If nothing highlighted, select first item
        const indexToSelect = highlightedIndex >= 0 ? highlightedIndex : 0
        if (filtered.length > 0 && indexToSelect < filtered.length) {
          handleFieldSelect(filtered[indexToSelect])
        }
      } else if (builderStep === "operator" && selectedColumn) {
        const operators = getOperatorsForColumn(selectedColumn)
        const indexToSelect = highlightedIndex >= 0 ? highlightedIndex : 0
        if (operators.length > 0 && indexToSelect < operators.length) {
          handleOperatorSelect(operators[indexToSelect].value)
        }
      } else if (builderStep === "value" && valueInput.trim()) {
        const filtered = columnValues.filter((val) =>
          val.toLowerCase().includes(valueInput.toLowerCase())
        )
        const indexToSelect = highlightedIndex >= 0 ? highlightedIndex : -1
        if (filtered.length > 0 && indexToSelect >= 0 && indexToSelect < filtered.length) {
          // Use the highlighted autocomplete value
          setValueInput(filtered[indexToSelect])
          setTimeout(() => addFilter(), 100)
        } else {
          // Otherwise add the filter with current input
          addFilter()
        }
      }
    }
  }

  const getOperatorLabel = (operator: FilterOperator) => {
    for (const operators of Object.values(OPERATORS_BY_TYPE)) {
      const found = operators.find((op) => op.value === operator)
      if (found) return found.label
    }
    return operator
  }

  const getOperatorsForColumn = (column: Column<TData, unknown>) => {
    const fieldType = column.columnDef.meta?.fieldType as FieldType | undefined
    return OPERATORS_BY_TYPE[fieldType || 'string']
  }

  const getPlaceholder = () => {
    if (builderStep === "field") return "Search fields..."
    if (builderStep === "operator") return "Select operator..."
    if (builderStep === "value") return "Type value..."
    return "Add filter..."
  }

  const getCurrentHeading = () => {
    if (builderStep === "field") return "Client Filters"
    if (builderStep === "operator" && selectedColumn) return `Field: ${getColumnLabel(selectedColumn)}`
    if (builderStep === "value" && selectedColumn && selectedOperator) {
      return `${getColumnLabel(selectedColumn)} ${getOperatorLabel(selectedOperator)}`
    }
    return ""
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="inline-flex rounded-md shadow-sm">
        <Popover open={open} onOpenChange={(isOpen) => {
          setOpen(isOpen)
          if (!isOpen) {
            resetBuilder()
          }
        }}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className={filters.length > 0 ? "rounded-r-none h-10" : "h-10"}
            >
              <FilterIcon className="mr-1 h-3 w-3" />
              Filter
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[400px] p-0" align="start">
            <Command key={builderStep}>
              {builderStep === "field" && (
                <>
                  <CommandInput placeholder="Search fields..." />
                  <CommandList>
                    <CommandEmpty>No fields found.</CommandEmpty>
                    <CommandGroup heading="Client Filters">
                      {filterableColumns.map((column) => (
                        <CommandItem
                          key={column.id}
                          onSelect={() => handleFieldSelect(column)}
                        >
                          {getColumnLabel(column)}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </>
              )}

              {builderStep === "operator" && selectedColumn && (
                <>
                  <CommandInput placeholder="Select operator..." />
                  <CommandList>
                    <CommandGroup heading={`Field: ${getColumnLabel(selectedColumn)}`}>
                      {getOperatorsForColumn(selectedColumn).map((operator) => (
                        <CommandItem
                          key={operator.value}
                          onSelect={() => handleOperatorSelect(operator.value)}
                        >
                          {operator.label}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </>
              )}

              {builderStep === "value" && selectedColumn && selectedOperator && (
                <>
                  <CommandInput
                    placeholder="Type value..."
                    value={valueInput}
                    onValueChange={setValueInput}
                  />
                  <CommandList>
                    <CommandGroup heading={`${getColumnLabel(selectedColumn)} ${getOperatorLabel(selectedOperator)}`}>
                      {valueInput.trim() && (() => {
                        const filteredValues = columnValues.filter((val) =>
                          val.toLowerCase().includes(valueInput.toLowerCase())
                        )
                        const hasExactMatch = filteredValues.some(
                          (val) => val.toLowerCase() === valueInput.toLowerCase()
                        )

                        return (
                          <>
                            {!hasExactMatch && (
                              <CommandItem
                                key="__custom__"
                                value={valueInput}
                                onSelect={() => {
                                  setTimeout(() => addFilter(), 100)
                                }}
                                className="text-primary"
                              >
                                Use "{valueInput}"
                              </CommandItem>
                            )}
                            {filteredValues.slice(0, 10).map((value) => (
                              <CommandItem
                                key={value}
                                onSelect={() => {
                                  setValueInput(value)
                                  setTimeout(() => addFilter(), 100)
                                }}
                              >
                                {value}
                              </CommandItem>
                            ))}
                          </>
                        )
                      })()}
                      {!valueInput.trim() && columnValues.length > 0 && (
                        columnValues.slice(0, 10).map((value) => (
                          <CommandItem
                            key={value}
                            onSelect={() => {
                              setValueInput(value)
                              setTimeout(() => addFilter(), 100)
                            }}
                          >
                            {value}
                          </CommandItem>
                        ))
                      )}
                      {!valueInput.trim() && columnValues.length === 0 && (
                        <CommandEmpty>Start typing to add a value</CommandEmpty>
                      )}
                    </CommandGroup>
                  </CommandList>
                </>
              )}
            </Command>
          </PopoverContent>
        </Popover>
        {filters.length > 0 && (
          <Button
            variant="outline"
            className="rounded-l-none h-10 border-l-0 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950 dark:hover:bg-amber-900"
            onClick={clearAllFilters}
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Filter Chips */}
      {filters.map((filter) => (
        <Badge
          key={filter.id}
          variant="secondary"
          className="gap-1 pl-3 pr-2 py-1.5 rounded-lg"
        >
          <span className="text-sm">
            {filter.columnLabel} {getOperatorLabel(filter.operator)} "{filter.value}"
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-4 w-4 p-0 hover:bg-transparent"
            onClick={() => removeFilter(filter.id)}
          >
            <X className="h-3 w-3" />
          </Button>
        </Badge>
      ))}
    </div>
  )
}

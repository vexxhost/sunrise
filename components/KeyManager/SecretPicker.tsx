"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, KeyRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { BarbicanSecret } from "@/types/openstack";

function SecretOption({ secret }: { secret: BarbicanSecret }) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-3 py-0.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted/40">
        <KeyRound className="size-4 text-muted-foreground" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">
          {secret.name || "Unnamed secret"}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {secret.secret_type} · {secret.status}
        </span>
        <span className="block truncate font-mono text-[11px] text-muted-foreground/80">
          {secret.id}
        </span>
      </span>
    </span>
  );
}

export function SecretPicker({
  disabled = false,
  disabledIds = [],
  id,
  onValueChange,
  secrets,
  value,
}: {
  disabled?: boolean;
  disabledIds?: string[];
  id?: string;
  onValueChange: (value: string) => void;
  secrets: BarbicanSecret[];
  value: string;
}) {
  const [open, setOpen] = useState(false);
  const uniqueSecrets = useMemo(
    () =>
      Array.from(
        new Map(secrets.map((secret) => [secret.id, secret])).values(),
      ),
    [secrets],
  );
  const disabledSet = useMemo(() => new Set(disabledIds), [disabledIds]);
  const selected = uniqueSecrets.find((secret) => secret.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          aria-expanded={open}
          className="h-auto min-h-14 w-full justify-between gap-2 px-3 py-2 text-left font-normal"
          disabled={disabled}
          id={id}
          role="combobox"
          type="button"
          variant="outline"
        >
          {selected ? (
            <SecretOption secret={selected} />
          ) : (
            <span className="text-muted-foreground">Select a secret</span>
          )}
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] p-0"
      >
        <Command>
          <CommandInput placeholder="Search secrets..." />
          <CommandList className="overscroll-contain overflow-y-scroll [scrollbar-color:var(--border)_transparent] [scrollbar-gutter:stable] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-track]:bg-transparent">
            <CommandEmpty>No secrets found.</CommandEmpty>
            {uniqueSecrets.map((secret) => (
              <CommandItem
                className="items-start gap-3 py-2"
                disabled={disabledSet.has(secret.id)}
                key={secret.id}
                onSelect={() => {
                  onValueChange(secret.id);
                  setOpen(false);
                }}
                value={`${secret.name ?? ""} ${secret.id} ${secret.secret_type} ${secret.status}`}
              >
                <SecretOption secret={secret} />
                <Check
                  className={cn(
                    "mt-2 size-4 shrink-0",
                    value === secret.id ? "opacity-100" : "opacity-0",
                  )}
                />
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

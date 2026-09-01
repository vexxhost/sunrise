"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, ImageIcon } from "lucide-react";

import { OsIcon } from "@/components/icons/OsIcon";
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
import { imageOperatingSystemMetadata } from "@/lib/openstack/image-metadata";
import { cn } from "@/lib/utils";
import type { Image } from "@/types/openstack";

export function ImageSelectOption({ image }: { image: Image }) {
  const metadata = imageOperatingSystemMetadata(image);
  const details = [
    metadata?.label ?? "OS metadata unavailable",
    image.disk_format?.toUpperCase(),
    image.visibility,
  ].filter(Boolean);

  return (
    <span className="flex min-w-0 items-center gap-3 py-0.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted/40">
        {metadata ? (
          <OsIcon className="size-5" decorative slug={metadata.slug} />
        ) : (
          <ImageIcon
            aria-hidden="true"
            className="size-5 text-muted-foreground"
          />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">
          {image.name || "Unnamed image"}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {details.join(" · ")}
        </span>
        <span className="block truncate font-mono text-[11px] text-muted-foreground/80">
          {image.id}
        </span>
      </span>
    </span>
  );
}

export function ImagePicker({
  className,
  disabled = false,
  id,
  images,
  onValueChange,
  placeholder = "Choose an image",
  value,
}: {
  className?: string;
  disabled?: boolean;
  id?: string;
  images: Image[];
  onValueChange: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = images.find((image) => image.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          aria-expanded={open}
          className={cn(
            "h-auto min-h-14 w-full justify-between gap-2 px-3 py-2 text-left font-normal",
            className,
          )}
          disabled={disabled}
          id={id}
          role="combobox"
          type="button"
          variant="outline"
        >
          {selected ? (
            <ImageSelectOption image={selected} />
          ) : value ? (
            <span className="min-w-0 truncate font-mono text-xs">{value}</span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] p-0"
      >
        <Command>
          <CommandInput placeholder="Search images..." />
          <CommandList className="overscroll-contain overflow-y-scroll [scrollbar-color:var(--border)_transparent] [scrollbar-gutter:stable] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-track]:bg-transparent">
            <CommandEmpty>No images found.</CommandEmpty>
            {images.map((image) => {
              const metadata = imageOperatingSystemMetadata(image);
              const searchValue = [
                image.name,
                image.id,
                metadata?.label,
                image.disk_format,
                image.visibility,
              ]
                .filter(Boolean)
                .join(" ");

              return (
                <CommandItem
                  className="items-start gap-3 py-2"
                  key={image.id}
                  onSelect={() => {
                    onValueChange(image.id);
                    setOpen(false);
                  }}
                  value={searchValue}
                >
                  <ImageSelectOption image={image} />
                  <Check
                    className={cn(
                      "mt-2 size-4 shrink-0",
                      value === image.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                </CommandItem>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

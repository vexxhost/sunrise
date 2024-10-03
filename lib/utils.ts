import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function capitalize(str:string) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function formatMBtoGB( sizeInMb: number) {
  const sizeInGb: number = sizeInMb / 1024;
  return(`${sizeInGb.toFixed(2)} GB`);
}
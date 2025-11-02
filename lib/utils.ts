import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function capitalize(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function formatMBtoGB(sizeInMb: number) {
  const sizeInGb: number = sizeInMb / 1024;
  return `${sizeInGb.toFixed(2)} GB`;
}

export function capitalizeFirstLetters(str: string) {
  const separators = ['-', ',', '|', '_', '-'];
  const regexPattern = new RegExp(`[${separators.join('')}]`, 'g'); // Create a regular expression pattern with the given separators
  return str
    .split(regexPattern) // Split the string using the separators
    .map((word) => capitalize(word))
    .join(" ");
}

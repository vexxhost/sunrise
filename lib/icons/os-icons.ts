import {
  siAlmalinux,
  siAlpinelinux,
  siArchlinux,
  siBsd,
  siCentos,
  siDebian,
  siFedora,
  siFreebsd,
  siGentoo,
  siKalilinux,
  siLinux,
  siLinuxmint,
  siManjaro,
  siNixos,
  siOpensuse,
  siPopos,
  siRedhat,
  siRockylinux,
  siSuse,
  siUbuntu,
  siZorin,
  type SimpleIcon,
} from "simple-icons";

export interface CustomIcon {
  path: string;
  title: string;
  viewBox?: string;
}

export type IconEntry =
  | { icon: SimpleIcon; kind: "simple" }
  | { icon: CustomIcon; kind: "custom" };

const windowsIcon: CustomIcon = {
  title: "Windows",
  path: "M0 3.449 9.75 2.1v9.451H0V3.449Zm10.949-1.523L24 0v11.4H10.949V1.926ZM0 12.6h9.75v9.451L0 20.699V12.6Zm10.949 0H24V24l-13.051-1.849V12.6Z",
};

const vmIcon: CustomIcon = {
  title: "Virtual machine",
  path: "M4 3h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-5v2h3a1 1 0 1 1 0 2H6a1 1 0 1 1 0-2h3v-2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm0 2v10h16V5H4Zm3 3h3v3H7V8Zm5 0h5v1.5h-5V8Zm0 3h5v1.5h-5V11Z",
};

const unknownIcon: CustomIcon = {
  title: "Unknown OS",
  path: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 17h-2v-2h2v2Zm2.07-7.75-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25Z",
};

export const osIcons: Record<string, IconEntry> = {
  alpinelinux: { icon: siAlpinelinux, kind: "simple" },
  almalinux: { icon: siAlmalinux, kind: "simple" },
  archlinux: { icon: siArchlinux, kind: "simple" },
  bsd: { icon: siBsd, kind: "simple" },
  centos: { icon: siCentos, kind: "simple" },
  debian: { icon: siDebian, kind: "simple" },
  fedora: { icon: siFedora, kind: "simple" },
  freebsd: { icon: siFreebsd, kind: "simple" },
  gentoo: { icon: siGentoo, kind: "simple" },
  kalilinux: { icon: siKalilinux, kind: "simple" },
  linux: { icon: siLinux, kind: "simple" },
  linuxmint: { icon: siLinuxmint, kind: "simple" },
  manjaro: { icon: siManjaro, kind: "simple" },
  nixos: { icon: siNixos, kind: "simple" },
  opensuse: { icon: siOpensuse, kind: "simple" },
  popos: { icon: siPopos, kind: "simple" },
  redhat: { icon: siRedhat, kind: "simple" },
  rockylinux: { icon: siRockylinux, kind: "simple" },
  suse: { icon: siSuse, kind: "simple" },
  ubuntu: { icon: siUbuntu, kind: "simple" },
  unknown: { icon: unknownIcon, kind: "custom" },
  vm: { icon: vmIcon, kind: "custom" },
  windows: { icon: windowsIcon, kind: "custom" },
  zorin: { icon: siZorin, kind: "simple" },
};

export function getOsIcon(slug: string | undefined) {
  return osIcons[slug ?? "unknown"] ?? osIcons.unknown;
}

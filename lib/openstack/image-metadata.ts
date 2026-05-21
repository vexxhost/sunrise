import type { Image } from "@/types/openstack";

export interface ImageOperatingSystemMetadata {
  known: boolean;
  label: string;
  slug: string;
  source: "os_distro" | "os_type";
  version?: string;
}

function imageProperty(image: Image | undefined, key: string) {
  const value = image?.[key];
  if (typeof value === "number") {
    return String(value);
  }

  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function imageOsVersion(image: Image | undefined) {
  const version =
    imageProperty(image, "os_version") ?? imageProperty(image, "os_versions");

  return formatOsVersion(version);
}

function withVersion(value: string, version: string | undefined) {
  return version ? `${value} ${version}` : value;
}

function formatOsName(value: string) {
  return value.replace(/[A-Za-z][A-Za-z0-9]*/g, (word) => {
    const letters = word
      .split("")
      .filter((character) => /[A-Za-z]/.test(character));
    const isUppercaseWord = letters.every(
      (character) => character === character.toUpperCase(),
    );

    if (isUppercaseWord) {
      return word;
    }

    return `${word[0].toUpperCase()}${word.slice(1).toLowerCase()}`;
  });
}

function normalizeOsValue(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_+.-]+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function osSlug(value: string) {
  const normalized = normalizeOsValue(value);
  const compact = normalized.replace(/\s/g, "");

  if (compact.includes("ubuntu")) return "ubuntu";
  if (compact.includes("debian")) return "debian";
  if (compact.includes("archlinux") || normalized === "arch") return "archlinux";
  if (compact.includes("fedora")) return "fedora";
  if (compact.includes("nixos")) return "nixos";
  if (compact.includes("opensuse")) return "opensuse";
  if (normalized === "suse" || compact.includes("suselinux")) return "suse";
  if (compact.includes("alpine")) return "alpinelinux";
  if (compact.includes("centos")) return "centos";
  if (
    compact.includes("redhat") ||
    compact.includes("rhel") ||
    compact.includes("redhatenterpriselinux")
  ) {
    return "redhat";
  }
  if (compact.includes("rocky")) return "rockylinux";
  if (compact.includes("alma")) return "almalinux";
  if (compact.includes("gentoo")) return "gentoo";
  if (compact.includes("kali")) return "kalilinux";
  if (compact.includes("manjaro")) return "manjaro";
  if (compact.includes("linuxmint") || normalized === "mint") return "linuxmint";
  if (compact.includes("popos") || compact.includes("poplinux")) return "popos";
  if (compact.includes("zorin")) return "zorin";
  if (compact.includes("freebsd")) return "freebsd";
  if (normalized === "bsd" || compact.endsWith("bsd")) return "bsd";
  if (compact.includes("windows") || compact.startsWith("win")) return "windows";
  if (normalized === "linux" || compact.endsWith("linux")) return "linux";

  return "unknown";
}

function formatOsVersion(version: string | undefined) {
  return version ? formatOsName(version) : undefined;
}

export function imageOperatingSystemMetadata(
  image: Image | undefined,
): ImageOperatingSystemMetadata | undefined {
  const version = imageOsVersion(image);
  const distro = imageProperty(image, "os_distro");
  if (distro) {
    const slug = osSlug(distro);
    return {
      known: slug !== "unknown",
      label: withVersion(formatOsName(distro), version),
      slug,
      source: "os_distro",
      version,
    };
  }

  const type = imageProperty(image, "os_type");
  if (!type) {
    return undefined;
  }

  const slug = osSlug(type);
  const osType = formatOsName(type);
  return {
    known: slug !== "unknown",
    label: ["freebsd", "windows"].includes(slug)
      ? withVersion(osType, version)
      : osType,
    slug,
    source: "os_type",
    version: ["freebsd", "windows"].includes(slug) ? version : undefined,
  };
}

export function imageOperatingSystem(image: Image | undefined) {
  return imageOperatingSystemMetadata(image)?.label;
}

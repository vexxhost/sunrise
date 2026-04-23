import { ServiceLayout } from "@/components/ServiceLayout";

const objectStorageSidebarSections = [
  {
    items: [
      { name: "Overview", href: "/object-storage", icon: "Gauge" },
    ],
  },
  {
    title: "Storage",
    items: [
      { name: "Containers", href: "/object-storage/containers", icon: "FolderOpen" },
      { name: "Objects", href: "/object-storage/objects", icon: "Database" },
    ],
  },
  {
    title: "Settings",
    items: [
      { name: "Access Control", href: "/object-storage/access-control", icon: "Settings" },
    ],
  },
];

export default function ObjectStorageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ServiceLayout sidebarSections={objectStorageSidebarSections}>
      {children}
    </ServiceLayout>
  );
}

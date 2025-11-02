import { ServiceLayout } from "@/components/ServiceLayout";

const fileSystemSidebarSections = [
  {
    items: [
      { name: "Overview", href: "/file-system", icon: "Gauge" },
    ],
  },
  {
    title: "File System",
    items: [
      { name: "Shares", href: "/file-system/shares", icon: "FolderTree" },
      { name: "Share Networks", href: "/file-system/share-networks", icon: "Share2" },
    ],
  },
  {
    title: "Settings",
    items: [
      { name: "Security Services", href: "/file-system/security-services", icon: "Settings" },
    ],
  },
];

export default function FileSystemLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ServiceLayout sidebarSections={fileSystemSidebarSections}>
      {children}
    </ServiceLayout>
  );
}

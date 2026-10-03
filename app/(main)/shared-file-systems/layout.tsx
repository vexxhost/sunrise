import { ServiceLayout } from "@/components/ServiceLayout";

const sharedFileSystemSidebarSections = [
  {
    items: [{ name: "Overview", href: "/shared-file-systems", icon: "Gauge" }],
  },
  {
    title: "Shared File System",
    items: [
      {
        name: "Shares",
        href: "/shared-file-systems/shares",
        icon: "FolderTree",
      },
      {
        name: "Snapshots",
        href: "/shared-file-systems/snapshots",
        icon: "Camera",
      },
      {
        name: "Share Networks",
        href: "/shared-file-systems/share-networks",
        icon: "Share2",
      },
      {
        name: "Security Services",
        href: "/shared-file-systems/security-services",
        icon: "ShieldCheck",
      },
    ],
  },
];

export default function SharedFileSystemLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ServiceLayout sidebarSections={sharedFileSystemSidebarSections}>
      {children}
    </ServiceLayout>
  );
}

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
      { name: "Buckets", href: "/object-storage/buckets", icon: "Database" },
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

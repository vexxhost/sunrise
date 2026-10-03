import { ServiceLayout } from "@/components/ServiceLayout";
import { ConfiguredServiceGroup } from "@/components/services/ServiceGuards";
import { loadCloudContext } from "@/lib/cloud-context";

const objectStorageSidebarSections = [
  {
    items: [{ name: "Overview", href: "/object-storage", icon: "Gauge" }],
  },
  {
    title: "Storage",
    items: [
      { name: "Buckets", href: "/object-storage/buckets", icon: "Database" },
    ],
  },
  {
    title: "Access",
    items: [
      { name: "Roles", href: "/object-storage/roles", icon: "ShieldCheck" },
    ],
  },
];

export default async function ObjectStorageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { snapshot } = await loadCloudContext();
  const sidebarSections =
    snapshot.objectStorage.backend === "s3"
      ? objectStorageSidebarSections
      : objectStorageSidebarSections.slice(0, 1);

  return (
    <ConfiguredServiceGroup id="object-storage">
      <ServiceLayout sidebarSections={sidebarSections}>
        {children}
      </ServiceLayout>
    </ConfiguredServiceGroup>
  );
}

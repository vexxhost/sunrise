import { ServiceLayout } from "@/components/ServiceLayout";

const sections = [
  {
    items: [{ name: "Overview", href: "/key-manager", icon: "Gauge" }],
  },
  {
    title: "Key Manager",
    items: [
      { name: "Secrets", href: "/key-manager/secrets", icon: "Vault" },
      {
        name: "Containers",
        href: "/key-manager/containers",
        icon: "Package",
      },
      { name: "Orders", href: "/key-manager/orders", icon: "ScrollText" },
      {
        name: "Access and Storage",
        href: "/key-manager/secret-stores",
        icon: "DatabaseZap",
      },
    ],
  },
];

export default function KeyManagerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ServiceLayout sidebarSections={sections}>{children}</ServiceLayout>;
}

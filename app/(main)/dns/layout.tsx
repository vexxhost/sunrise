import { ServiceLayout } from "@/components/ServiceLayout";

const dnsSidebarSections = [
  {
    items: [
      { name: "Overview", href: "/dns", icon: "Gauge" },
    ],
  },
  {
    title: "DNS",
    items: [
      { name: "Zones", href: "/dns/zones", icon: "Globe" },
      { name: "Record Sets", href: "/dns/record-sets", icon: "FileText" },
    ],
  },
  {
    title: "Settings",
    items: [
      { name: "Zone Transfers", href: "/dns/zone-transfers", icon: "Settings" },
    ],
  },
];

export default function DNSLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ServiceLayout sidebarSections={dnsSidebarSections}>
      {children}
    </ServiceLayout>
  );
}

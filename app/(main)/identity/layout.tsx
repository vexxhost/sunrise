import { ServiceLayout } from "@/components/ServiceLayout";
import { ConfiguredService } from "@/components/services/ServiceGuards";

const identitySidebarSections = [
  {
    items: [{ name: "Overview", href: "/identity", icon: "Gauge" }],
  },
  {
    title: "Credentials",
    items: [
      {
        name: "Application Credentials",
        href: "/identity/application-credentials",
        icon: "KeyRound",
      },
    ],
  },
];

export default function IdentityLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ConfiguredService id="identity">
      <ServiceLayout sidebarSections={identitySidebarSections}>
        {children}
      </ServiceLayout>
    </ConfiguredService>
  );
}

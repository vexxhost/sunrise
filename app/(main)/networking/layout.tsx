import { ServiceLayout } from "@/components/ServiceLayout";
import { ConfiguredServiceGroup } from "@/components/services/ServiceGuards";
import { loadCloudContext } from "@/lib/cloud-context";
import type { NavigationDestinationId } from "@/lib/navigation-destinations";

function networkingSidebarSections(
  visibleDestinations: ReadonlySet<NavigationDestinationId>,
) {
  return [
    {
      items: [{ name: "Overview", href: "/networking", icon: "Gauge" }],
    },
    {
      title: "Network",
      items: [
        ...(visibleDestinations.has("networking.topology")
          ? [
              {
                name: "Topology",
                href: "/networking/topology",
                icon: "Workflow",
              },
            ]
          : []),
        ...(visibleDestinations.has("networking.networks")
          ? [
              {
                name: "Networks",
                href: "/networking/networks",
                icon: "Network",
              },
            ]
          : []),
        ...(visibleDestinations.has("networking.routers")
          ? [
              {
                name: "Routers",
                href: "/networking/routers",
                icon: "Router",
              },
            ]
          : []),
        ...(visibleDestinations.has("networking.ports")
          ? [
              {
                name: "Ports",
                href: "/networking/ports",
                icon: "Cable",
              },
            ]
          : []),
        ...(visibleDestinations.has("networking.floating-ips")
          ? [
              {
                name: "Floating IPs",
                href: "/networking/floating-ips",
                icon: "Globe2",
              },
            ]
          : []),
        ...(visibleDestinations.has("networking.load-balancers")
          ? [
              {
                name: "Load Balancers",
                href: "/networking/load-balancers",
                icon: "Waypoints",
              },
            ]
          : []),
      ],
    },
    {
      title: "Security",
      items: [
        ...(visibleDestinations.has("networking.security-groups")
          ? [
              {
                name: "Security Groups",
                href: "/networking/security-groups",
                icon: "Shield",
              },
            ]
          : []),
        ...(visibleDestinations.has("networking.address-groups")
          ? [
              {
                name: "Address Groups",
                href: "/networking/address-groups",
                icon: "ListTree",
              },
            ]
          : []),
      ],
    },
  ];
}

export default async function NetworkingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { snapshot } = await loadCloudContext();
  const visibleDestinations = new Set(
    snapshot.destinations
      .filter(
        ({ service, status }) =>
          service === "networking" && status !== "unavailable",
      )
      .map(({ id }) => id),
  );

  return (
    <ConfiguredServiceGroup id="networking">
      <ServiceLayout
        sidebarSections={networkingSidebarSections(visibleDestinations)}
      >
        {children}
      </ServiceLayout>
    </ConfiguredServiceGroup>
  );
}

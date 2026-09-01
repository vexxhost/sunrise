import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Fragment } from "react";

const serviceNames: Record<string, string> = {
  compute: "Compute",
  kubernetes: "Kubernetes",
  "object-storage": "Object Storage",
  buckets: "Buckets",
  roles: "Roles",
  orchestration: "Orchestration",
  dns: "DNS",
  "file-system": "File System",
  clusters: "Clusters",
  templates: "Templates",
  instances: "Instances",
  instance: "Instance",
  "instance-flavors": "Instance Flavors",
  networks: "Networking",
  resources: "Networks",
  routers: "Routers",
  ports: "Ports",
  "floating-ips": "Floating IPs",
  volumes: "Volumes",
  snapshots: "Snapshots",
  images: "Images",
  "key-pairs": "Key Pairs",
  "security-groups": "Security Groups",
  overview: "Overview",
  "node-groups": "Node Groups",
  storage: "Storage",
  security: "Security",
  "add-ons": "Add-ons",
  components: "Components",
  networking: "Networking",
  authority: "Authority",
  template: "Template",
  labels: "Labels",
};

export function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) {
    return null;
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link href="/">Home</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        {segments.map((segment, index) => {
          const href = "/" + segments.slice(0, index + 1).join("/");
          const isLast = index === segments.length - 1;
          const label = serviceNames[segment] || segment;

          return (
            <Fragment key={segment + index}>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage>{label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href={href}>{label}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

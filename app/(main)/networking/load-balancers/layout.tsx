import { ConfiguredService } from "@/components/services/ServiceGuards";

export default function LoadBalancersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ConfiguredService id="load-balancer">{children}</ConfiguredService>;
}

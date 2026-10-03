import { ConfiguredService } from "@/components/services/ServiceGuards";

export default function InstanceFlavorsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ConfiguredService id="compute">{children}</ConfiguredService>;
}

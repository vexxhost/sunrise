import { ConfiguredService } from "@/components/services/ServiceGuards";

export default function VolumesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ConfiguredService id="volume">{children}</ConfiguredService>;
}

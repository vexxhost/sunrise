import { ConfiguredService } from "@/components/services/ServiceGuards";

export default function SnapshotsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ConfiguredService id="volume">{children}</ConfiguredService>;
}

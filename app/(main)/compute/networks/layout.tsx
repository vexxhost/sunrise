import { NetworkingNav } from "./NetworkingNav";

export default function NetworkingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold">Networking</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Understand connectivity, addresses, and security boundaries for the
          active project.
        </p>
      </header>
      <NetworkingNav />
      {children}
    </div>
  );
}

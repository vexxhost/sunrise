import AuthProvider from "../Auth/Provider";

export function Server({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

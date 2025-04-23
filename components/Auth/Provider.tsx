import React from "react";
import { session } from "@/lib/session";
import Login from "@/components/Auth/Login";

export default async function Provider({ children }: any) {
  const unscopedToken = await session().get("keystone_unscoped_token");
  if (!unscopedToken) {
    return <Login />;
  }

  return <>{children}</>;
}

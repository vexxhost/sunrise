"use client";

import { useEffect, useState } from "react";
import { authReturnToFromLocation } from "@/lib/auth-navigation";
import { normalizeAuthReturnTo } from "@/lib/auth-return";

export function useCurrentAuthReturnTo(initialReturnTo = "/") {
  const fallback = normalizeAuthReturnTo(initialReturnTo);
  const [returnTo, setReturnTo] = useState(fallback);

  useEffect(() => {
    const synchronize = () => {
      const current = authReturnToFromLocation(window.location);
      setReturnTo(current === "/" && fallback !== "/" ? fallback : current);
    };
    synchronize();
    window.addEventListener("popstate", synchronize);
    window.addEventListener("hashchange", synchronize);
    return () => {
      window.removeEventListener("popstate", synchronize);
      window.removeEventListener("hashchange", synchronize);
    };
  }, [fallback]);

  return returnTo;
}

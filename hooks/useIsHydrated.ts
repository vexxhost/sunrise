import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

export function useIsHydrated() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}

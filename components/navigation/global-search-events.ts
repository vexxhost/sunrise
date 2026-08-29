export const GLOBAL_SEARCH_EVENT = "sunrise:open-global-search";

export function openGlobalSearch() {
  window.dispatchEvent(new Event(GLOBAL_SEARCH_EVENT));
}

export function appendUniqueBy<T>(
  target: T[],
  seen: Set<string>,
  candidates: T[],
  identity: (item: T) => string,
) {
  for (const candidate of candidates) {
    const key = identity(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    target.push(candidate);
  }
}

interface TransitionQueryResult<T> {
  data?: T;
  isError: boolean;
}

export function collectTransitionUpdates<T extends { id: string }>(
  results: readonly TransitionQueryResult<T>[],
) {
  return {
    hasErrors: results.some((result) => result.isError),
    updates: new Map(
      results
        .map((result) => result.data)
        .filter((resource): resource is T => Boolean(resource))
        .map((resource) => [resource.id, resource]),
    ),
  };
}

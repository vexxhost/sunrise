export class StoredSessionSupersededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoredSessionSupersededError";
  }
}

export function isStoredSessionSupersededError(
  error: unknown,
): error is StoredSessionSupersededError {
  return error instanceof StoredSessionSupersededError;
}

// Carries the HTTP status so callers (e.g. the query retry policy) can tell a
// non-retryable 4xx from a transient 5xx.
export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "HttpError";
  }
}

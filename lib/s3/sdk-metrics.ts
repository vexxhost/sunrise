import "server-only";

import { elapsedSeconds, observeRgwRequest } from "@/lib/metrics";

type RgwApi = "iam" | "s3" | "sts";

type MiddlewareArguments<Input extends object> = {
  input: Input;
  request?: unknown;
};

type MiddlewareResult<Output extends object> = {
  output: Output;
  response: unknown;
};

type MiddlewareHandler<Input extends object, Output extends object> = (
  args: MiddlewareArguments<Input>,
) => Promise<MiddlewareResult<Output>>;

type RgwMetricsMiddleware = <Input extends object, Output extends object>(
  next: MiddlewareHandler<Input, Output>,
  context: { commandName?: string },
) => MiddlewareHandler<Input, Output>;

type InstrumentableClient = {
  middlewareStack: {
    addRelativeTo(
      middleware: RgwMetricsMiddleware,
      options: {
        name: string;
        relation: "after";
        toMiddleware: string;
      },
    ): void;
  };
};

function operationName(commandName?: string) {
  return commandName?.replace(/Command$/, "") || "Unknown";
}

function responseStatus(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const metadata = (value as { $metadata?: { httpStatusCode?: unknown } })
    .$metadata;
  return typeof metadata?.httpStatusCode === "number"
    ? metadata.httpStatusCode
    : undefined;
}

export function instrumentRgwClient<T extends InstrumentableClient>(
  client: T,
  api: RgwApi,
): T {
  const middleware: RgwMetricsMiddleware = (next, context) => async (args) => {
    const startedAt = performance.now();
    const operation = operationName(context.commandName);
    try {
      const result = await next(args);
      observeRgwRequest({
        api,
        durationSeconds: elapsedSeconds(startedAt),
        operation,
        outcome: "success",
        status: responseStatus(result.output),
      });
      return result;
    } catch (error) {
      observeRgwRequest({
        api,
        durationSeconds: elapsedSeconds(startedAt),
        operation,
        outcome: "error",
        status: responseStatus(error),
      });
      throw error;
    }
  };

  client.middlewareStack.addRelativeTo(middleware, {
    name: `sunriseRgw${api.toUpperCase()}Metrics`,
    relation: "after",
    toMiddleware: "awsAuthMiddleware",
  });
  return client;
}

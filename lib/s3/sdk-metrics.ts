import "server-only";

import type {
  InitializeMiddleware,
  MetadataBearer,
  MiddlewareStack,
} from "@smithy/types";
import { elapsedSeconds, observeRgwRequest } from "@/lib/metrics";

type RgwApi = "iam" | "s3" | "sts";

type InstrumentableClient = {
  middlewareStack: MiddlewareStack<object, MetadataBearer>;
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

export function instrumentRgwClient<T>(client: T, api: RgwApi): T {
  const instrumentable = client as T & InstrumentableClient;
  const middleware: InitializeMiddleware<object, MetadataBearer> =
    (next, context) => async (args) => {
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

  instrumentable.middlewareStack.add(middleware, {
    name: `sunriseRgw${api.toUpperCase()}Metrics`,
    step: "initialize",
  });
  return client;
}

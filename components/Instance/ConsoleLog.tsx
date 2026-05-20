"use client";

import { FormEvent, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { serverConsoleOutputQueryOptions } from "@/hooks/queries/useServers";

interface ConsoleLogProps {
  serverId: string;
  regionId?: string;
  projectId?: string;
}

const DEFAULT_LOG_LENGTH = 35;

function parseLogLength(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_LOG_LENGTH;
  }

  return parsed;
}

export function ConsoleLog({ serverId, regionId, projectId }: ConsoleLogProps) {
  const [lengthInput, setLengthInput] = useState(String(DEFAULT_LOG_LENGTH));
  const [logLength, setLogLength] = useState<number | null>(DEFAULT_LOG_LENGTH);
  const { data, error, isError, isFetching, refetch } = useQuery(
    serverConsoleOutputQueryOptions(regionId, projectId, serverId, logLength),
  );

  const applyLength = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLogLength(parseLogLength(lengthInput));
  };

  const viewFullLog = () => {
    setLogLength(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h2 className="text-xl font-semibold tracking-tight">Instance Console Log</h2>
        <form className="flex flex-wrap items-center gap-2" onSubmit={applyLength}>
          <Label htmlFor="instance-console-log-length">Log Length</Label>
          <Input
            id="instance-console-log-length"
            type="number"
            min={1}
            value={lengthInput}
            onChange={(event) => setLengthInput(event.target.value)}
            className="w-28"
          />
          <Button type="submit" disabled={isFetching}>
            Go
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={viewFullLog}
            disabled={isFetching && logLength === null}
          >
            View Full Log
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => refetch()}
            disabled={isFetching}
            title="Refresh log"
          >
            <RotateCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            <span className="sr-only">Refresh log</span>
          </Button>
        </form>
      </div>

      {isError ? (
        <p className="text-sm text-destructive">
          {(error as Error)?.message ?? "Failed to load console log."}
        </p>
      ) : (
        <pre className="max-h-[65vh] min-h-96 overflow-auto rounded-md border bg-muted/30 p-3 font-mono text-xs leading-relaxed text-foreground whitespace-pre-wrap">
          {isFetching && !data
            ? "Loading console log..."
            : data || "No console output returned."}
        </pre>
      )}
    </div>
  );
}

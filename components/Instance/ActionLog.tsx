'use client';

import { Fragment, useState } from 'react';
import { useSuspenseQuery, useQuery } from '@tanstack/react-query';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  serverActionsQueryOptions,
  serverActionQueryOptions,
} from '@/hooks/queries/useServers';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { ServerActionEvent } from '@/types/openstack';

interface ActionLogProps {
  serverId: string;
  regionId?: string;
  projectId?: string;
}

function formatTime(value: string | null | undefined) {
  if (!value) return '—';
  try {
    return `${value} (${formatDistanceToNow(parseISO(value), { addSuffix: true })})`;
  } catch {
    return value;
  }
}

function ActionEvents({
  serverId,
  regionId,
  projectId,
  requestId,
}: {
  serverId: string;
  regionId?: string;
  projectId?: string;
  requestId: string;
}) {
  const { data, isLoading, isError, error } = useQuery(
    serverActionQueryOptions(regionId, projectId, serverId, requestId),
  );

  if (isLoading) {
    return <p className="text-xs text-muted-foreground">Loading events…</p>;
  }
  if (isError) {
    return (
      <p className="text-xs text-destructive">
        {(error as Error)?.message ?? 'Failed to load action events.'}
      </p>
    );
  }

  const events = data?.events ?? [];
  if (events.length === 0) {
    return <p className="text-xs text-muted-foreground">No events recorded.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Event</TableHead>
          <TableHead>Result</TableHead>
          <TableHead>Started</TableHead>
          <TableHead>Finished</TableHead>
          <TableHead>Host</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {events.map((event: ServerActionEvent, index) => (
          <TableRow key={`${event.event}-${index}`}>
            <TableCell className="font-mono text-xs">{event.event}</TableCell>
            <TableCell>{event.result ?? '—'}</TableCell>
            <TableCell>{formatTime(event.start_time)}</TableCell>
            <TableCell>{formatTime(event.finish_time)}</TableCell>
            <TableCell className="font-mono text-xs">
              {event.host ?? event.hostId ?? '—'}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function ActionLog({ serverId, regionId, projectId }: ActionLogProps) {
  const { data: actions } = useSuspenseQuery(
    serverActionsQueryOptions(regionId, projectId, serverId),
  );
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (requestId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(requestId)) {
        next.delete(requestId);
      } else {
        next.add(requestId);
      }
      return next;
    });
  };

  if (actions.length === 0) {
    return (
      <p className="ml-2 pl-2 text-xs text-muted-foreground">
        No actions recorded for this instance.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8" />
          <TableHead>Action</TableHead>
          <TableHead>Request ID</TableHead>
          <TableHead>Started</TableHead>
          <TableHead>User</TableHead>
          <TableHead>Message</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {actions.map((action) => {
          const isOpen = expanded.has(action.request_id);
          return (
            <Fragment key={action.request_id}>
              <TableRow
                className="cursor-pointer"
                onClick={() => toggle(action.request_id)}
              >
                <TableCell>
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </TableCell>
                <TableCell className="font-medium">{action.action}</TableCell>
                <TableCell className="font-mono text-xs">
                  {action.request_id}
                </TableCell>
                <TableCell>{formatTime(action.start_time)}</TableCell>
                <TableCell className="font-mono text-xs">
                  {action.user_id ?? '—'}
                </TableCell>
                <TableCell>{action.message ?? '—'}</TableCell>
              </TableRow>
              {isOpen && (
                <TableRow>
                  <TableCell />
                  <TableCell colSpan={5} className="bg-muted/30">
                    <ActionEvents
                      serverId={serverId}
                      regionId={regionId}
                      projectId={projectId}
                      requestId={action.request_id}
                    />
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}

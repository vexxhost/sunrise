import { Activity, Plus, Trash2 } from "lucide-react";

import type { HealthMonitorDialogAction } from "@/components/LoadBalancer/HealthMonitorMutationDialog";
import { EditActionButton } from "@/components/resources/EditActionButton";
import { ProgressStatusBadge } from "@/components/resources/ProgressStatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatOctaviaStatus,
  isOctaviaProvisioning,
  octaviaStatusVariant,
} from "@/lib/openstack/octavia";
import {
  canChangeHealthMonitor,
  healthMonitorTypeForPool,
  readHealthMonitorSettings,
} from "@/lib/openstack/octavia-health-monitor-settings";
import type { OctaviaHealthMonitor, OctaviaPool } from "@/types/openstack";

export function HealthMonitorTable({
  pools,
  monitors,
  supportsChanges,
  busy,
  onAction,
}: {
  pools: OctaviaPool[];
  monitors: OctaviaHealthMonitor[];
  supportsChanges: boolean;
  busy: boolean;
  onAction: (target: HealthMonitorDialogAction) => void;
}) {
  const byId = new Map(monitors.map((monitor) => [monitor.id, monitor]));
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Activity className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Health monitors</h2>
        <Badge variant="outline">{monitors.length}</Badge>
      </div>
      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pool</TableHead>
              <TableHead>Monitor</TableHead>
              <TableHead>Check</TableHead>
              <TableHead>Interval / Timeout</TableHead>
              <TableHead>Success / Failure</TableHead>
              <TableHead>Admin state</TableHead>
              <TableHead>Operating</TableHead>
              <TableHead>Provisioning</TableHead>
              {supportsChanges ? (
                <TableHead className="text-right">Actions</TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pools.map((pool) => {
              const poolName = pool.name || pool.id;
              const monitor = pool.healthmonitor_id
                ? byId.get(pool.healthmonitor_id)
                : undefined;
              const type = healthMonitorTypeForPool(pool);
              const source = monitor && readHealthMonitorSettings(monitor);
              const monitorName = monitor?.name || monitor?.id;
              return (
                <TableRow key={pool.id}>
                  <TableCell className="max-w-52 whitespace-normal wrap-anywhere">
                    {poolName}
                  </TableCell>
                  {!monitor ? (
                    <TableCell colSpan={7} className="text-muted-foreground">
                      {pool.healthmonitor_id ? "Unavailable" : "Not configured"}
                    </TableCell>
                  ) : (
                    <>
                      <TableCell className="max-w-52 whitespace-normal wrap-anywhere">
                        {monitorName}
                      </TableCell>
                      <TableCell className="max-w-64 whitespace-normal wrap-anywhere">
                        {monitor.type}
                        {(monitor.type === "HTTP" ||
                          monitor.type === "HTTPS") &&
                        monitor.url_path ? (
                          <div className="text-muted-foreground">
                            <span className="font-mono">
                              {monitor.http_method} {monitor.url_path}
                            </span>
                            {monitor.expected_codes ? (
                              <div>{monitor.expected_codes}</div>
                            ) : null}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {monitor.delay}s / {monitor.timeout}s
                      </TableCell>
                      <TableCell>
                        {monitor.max_retries} /{" "}
                        {monitor.max_retries_down ?? "-"}
                      </TableCell>
                      <TableCell>
                        {monitor.admin_state_up ? "Up" : "Down"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={octaviaStatusVariant(
                            monitor.operating_status,
                          )}
                        >
                          {formatOctaviaStatus(monitor.operating_status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {isOctaviaProvisioning(monitor) ? (
                          <ProgressStatusBadge
                            label={formatOctaviaStatus(
                              monitor.provisioning_status,
                            )}
                          />
                        ) : (
                          <Badge
                            variant={octaviaStatusVariant(
                              monitor.provisioning_status,
                            )}
                          >
                            {formatOctaviaStatus(monitor.provisioning_status)}
                          </Badge>
                        )}
                      </TableCell>
                    </>
                  )}
                  {supportsChanges ? (
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {!monitor && type && pool.healthmonitor_id == null ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Add health monitor to ${poolName}`}
                            title="Add health monitor"
                            disabled={busy || !canChangeHealthMonitor(pool)}
                            onClick={() =>
                              onAction({ action: "create", pool, type })
                            }
                          >
                            <Plus className="size-4" />
                          </Button>
                        ) : null}
                        {monitor && monitor.type === type ? (
                          <>
                            <EditActionButton
                              type="button"
                              compact
                              label={`Edit health monitor ${monitorName}`}
                              disabled={
                                busy ||
                                !source ||
                                !canChangeHealthMonitor(pool, monitor)
                              }
                              onClick={() =>
                                source &&
                                onAction({
                                  action: "edit",
                                  monitor,
                                  pool,
                                  source,
                                })
                              }
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              tone="danger"
                              size="icon-sm"
                              aria-label={`Delete health monitor ${monitorName}`}
                              title="Delete health monitor"
                              disabled={
                                busy ||
                                !canChangeHealthMonitor(pool, monitor, true)
                              }
                              onClick={() =>
                                onAction({ action: "delete", monitor, pool })
                              }
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

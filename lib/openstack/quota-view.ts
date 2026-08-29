import type {
  OverviewService,
  OverviewServiceId,
} from '@/lib/openstack/overview';
import type { QuotaLevel, QuotaMetric } from '@/lib/openstack/quota';

export type QuotaRow = QuotaMetric & {
  serviceId: OverviewServiceId;
  serviceLabel: string;
};

export type QuotaStatusFilter = 'all' | 'attention' | QuotaLevel;

export type QuotaFilters = {
  query: string;
  service: 'all' | OverviewServiceId;
  status: QuotaStatusFilter;
};

export function buildQuotaRows(services: OverviewService[]): QuotaRow[] {
  return services.flatMap((service) =>
    service.metrics.map((metric) => ({
      ...metric,
      serviceId: service.id,
      serviceLabel: service.label,
    }))
  );
}

export function isAttentionLevel(level: QuotaLevel): boolean {
  return level === 'warning' || level === 'critical';
}

export function filterQuotaRows(
  rows: QuotaRow[],
  filters: QuotaFilters
): QuotaRow[] {
  const query = filters.query.trim().toLocaleLowerCase();

  return rows.filter((row) => {
    if (filters.service !== 'all' && row.serviceId !== filters.service) {
      return false;
    }

    if (
      filters.status !== 'all' &&
      (filters.status === 'attention'
        ? !isAttentionLevel(row.level)
        : row.level !== filters.status)
    ) {
      return false;
    }

    return (
      !query ||
      row.label.toLocaleLowerCase().includes(query) ||
      row.serviceLabel.toLocaleLowerCase().includes(query)
    );
  });
}

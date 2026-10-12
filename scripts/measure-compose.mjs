import { performance } from "node:perf_hooks";

const baseUrl = process.env.SUNRISE_MEASURE_BASE_URL || "http://localhost:9990";
const samples = Number(process.env.SUNRISE_MEASURE_SAMPLES || "50");

if (!Number.isSafeInteger(samples) || samples < 5 || samples > 10_000) {
  throw new Error("SUNRISE_MEASURE_SAMPLES must be an integer from 5 to 10000");
}

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * fraction) - 1];
}

async function measure(pathname) {
  const durations = [];

  for (let index = 0; index < samples + 1; index += 1) {
    const startedAt = performance.now();
    const response = await fetch(new URL(pathname, baseUrl), {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    await response.arrayBuffer();
    if (!response.ok) {
      throw new Error(`${pathname} returned HTTP ${response.status}`);
    }
    if (index > 0) durations.push(performance.now() - startedAt);
  }

  return {
    samples,
    minMs: Number(Math.min(...durations).toFixed(2)),
    medianMs: Number(percentile(durations, 0.5).toFixed(2)),
    p95Ms: Number(percentile(durations, 0.95).toFixed(2)),
    maxMs: Number(Math.max(...durations).toFixed(2)),
  };
}

console.log(
  JSON.stringify(
    {
      measuredAt: new Date().toISOString(),
      baseUrl,
      endpoints: {
        healthz: await measure("/healthz"),
        readyz: await measure("/readyz"),
      },
    },
    null,
    2,
  ),
);

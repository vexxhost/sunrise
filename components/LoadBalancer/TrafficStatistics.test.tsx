import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TrafficStatistics } from "./TrafficStatistics";

describe("Octavia traffic statistics", () => {
  it("distinguishes zero counters from missing data and formats bytes", () => {
    const markup = renderToStaticMarkup(
      <TrafficStatistics
        stats={{
          active_connections: 0,
          total_connections: 12_345,
          bytes_in: 0,
          bytes_out: 1536,
        }}
      />,
    );
    expect(markup).toContain(">0</dd>");
    expect(markup).toContain(">12,345</dd>");
    expect(markup).toContain(">0 B</dd>");
    expect(markup).toContain(">1.5 KiB</dd>");
    expect(markup).toContain(">Not reported</dd>");
  });

  it("shows unavailable instead of implying zero traffic", () => {
    const markup = renderToStaticMarkup(<TrafficStatistics stats={null} />);
    expect(markup).toContain("Traffic statistics are unavailable.");
    expect(markup).not.toContain("Active connections");
  });
});

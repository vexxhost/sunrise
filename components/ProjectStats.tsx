"use client";

import ProgressCard from "@/components/ProgressCard";

const limitSummaryData = [
  {
    name: "Compute",
    items: [
      { label: "Instances", used: 0, limit: 10, units: "" },
      { label: "VCPUs", used: 0, limit: 20, units: "" },
      { label: "RAM", used: 0, limit: 50, units: "GB" },
    ],
  },
  {
    name: "Volume",
    items: [
      { label: "Volumes", used: 1, limit: 10, units: "" },
      { label: "Volume Snapshots", used: 0, limit: 10, units: "" },
      { label: "Volume Storage", used: 20, limit: 1000, units: "GB" },
    ],
  },
  {
    name: "Network",
    items: [
      { label: "Floating IPs", used: 0, limit: 50, units: "" },
      { label: "Security Groups", used: 1, limit: 10, units: "" },
      { label: "Security Group Rules", used: 4, limit: 100, units: "" },
      { label: "Networks", used: 0, limit: 100, units: "" },
      { label: "Ports", used: 0, limit: 500, units: "" },
      { label: "Routers", used: 0, limit: 10, units: "" },
    ],
  },
];

export default function ProjectStats() {
  return (
    <>
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-2xl font-semibold leading-6 text-gray-900">
            Limit Summary
          </h1>
        </div>
      </div>
      {limitSummaryData.map((group) => (
        <div key={group.name}>
          <h2 className="text-xl font-semibold pt-5 pb-3">{group.name}</h2>
          <ul
            role="list"
            className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
          >
            {group.items.map((item, i) => (
              <div key={i}>
                <li className="col-span-1 flex flex-col divide-y text-center items-center">
                  <ProgressCard
                    label={item.label}
                    used={item.used}
                    limit={item.limit}
                    units={item.units}
                  />
                </li>
              </div>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}

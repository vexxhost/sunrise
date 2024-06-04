import React from "react";

import { Badge } from "@/components/ui/badge"

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

import {CircularProgress} from "@/components/ui/circular-progress";

export default function ProgressCard({label, used, limit, units}) {
  return (
    <Card className="w-[240px] h-[260px] border-none">
      <CardContent className="justify-center items-center pb-0">
        <CircularProgress
          classNames={{
            svg: "w-36 h-36 drop-shadow-md",
            indicator: "stroke-black",
            track: "stroke-black/10",
            value: "text-3xl font-semibold text-white",
          }}
          value={used/limit*100}
          strokeWidth={4}
          showValueLabel={true}
          aria-label={label}
        />
      </CardContent>
      <CardFooter className="justify-center items-center pt-0">
        <div className="sm:flex sm:items-center">
            <div className="sm:flex-auto">
                <h3 className="font-bold p-2">{label}</h3>
                <Badge variant="outline">
                    Used {used}{units ? units : ""} of {limit}{units ? units : ""}
                </Badge>
            </div>
        </div>
      </CardFooter>
    </Card>
  );
}

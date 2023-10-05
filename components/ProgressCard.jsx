import React from "react";

import {CircularProgress, Card, CardBody, CardFooter, Chip} from "@nextui-org/react";

export default function ProgressCard({label, used, limit, units}) {
  return (
    <Card className="w-[240px] h-[260px] border-none">
      <CardBody className="justify-center items-center pb-0">
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
      </CardBody>
      <CardFooter className="justify-center items-center pt-0">
        <div className="sm:flex sm:items-center">
            <div className="sm:flex-auto">
                <h3 className="font-bold p-2">{label}</h3>
                <Chip
                    classNames={{
                        base: "border-2 border-slate/30",
                        content: "text-slate/90 text-small font-semibold",
                    }}
                    variant="bordered"
                    >
                    Used {used}{units ? units : ""} of {limit}{units ? units : ""}
                </Chip>
            </div>
        </div>
      </CardFooter>
    </Card>
  );
}

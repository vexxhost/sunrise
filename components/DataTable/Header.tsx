import pluralize from "pluralize";
import { ReactNode } from "react";
import { titleCase } from "title-case";

interface DataTableHeaderProps {
    resourceName: string;
    actions: ReactNode;
}

export function DataTableHeader({ resourceName, actions }: DataTableHeaderProps) {
    return <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">
            {titleCase(pluralize(resourceName))}
        </h1>
        {actions}
    </div>
}

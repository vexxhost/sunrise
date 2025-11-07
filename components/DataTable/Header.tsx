import { titleCase } from "title-case";
import { DataTableAction } from "../DataTable";
import pluralize from "pluralize";
import { ButtonGroup } from "../ui/button-group";
import { Button } from "../ui/button";

interface DataTableHeaderProps {
    resourceName: string;
    actions: DataTableAction[];
}

export function DataTableHeader({ resourceName, actions }: DataTableHeaderProps) {
    return <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">
            {titleCase(pluralize(resourceName))}
        </h1>
        {actions.length > 0 && (
            <ButtonGroup>
                {actions.map((action, index) => {
                    const Icon = action.icon;
                    return (
                        <Button
                            key={index}
                            variant={action.variant || 'default'}
                            size="sm"
                            onClick={action.onClick}
                            className="gap-2 h-10 cursor-pointer"
                        >
                            {Icon && <Icon className="h-4 w-4" />}
                            {action.label}
                        </Button>
                    );
                })}
            </ButtonGroup>
        )}
    </div>
}

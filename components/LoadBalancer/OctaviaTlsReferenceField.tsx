import { OctaviaBarbicanReference } from "@/components/LoadBalancer/OctaviaBarbicanReference";
import { MutationAlert } from "@/components/mutations/MutationAlert";
import { ResourceLink } from "@/components/resources/ResourceLink";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BarbicanReferenceNames } from "@/lib/openstack/barbican-references";

const KEEP = "keep";
const REMOVE = "remove";
const descriptions = {
  client: {
    label: "Backend client certificate",
    name: "client certificate",
    description:
      "An unencrypted PKCS#12 certificate and key bundle stored as a binary secret in",
    removalWarning:
      "Octavia will stop presenting a client certificate. Members that require one may reject connections.",
  },
  crl: {
    label: "Certificate revocation list",
    name: "revocation list",
    description:
      "A PEM revocation list signed by the member CA, stored as a binary secret in",
    removalWarning:
      "Removing the list stops revocation checks. Octavia will still verify member certificates against the CA.",
  },
  listenerCrl: {
    label: "Client certificate revocation list",
    name: "revocation list",
    description:
      "A PEM revocation list signed by the client CA, stored as a binary secret in",
    removalWarning:
      "Removing the list stops revocation checks without changing authentication mode or the client CA.",
  },
} as const;

export function OctaviaTlsReferenceField({
  id,
  kind,
  current,
  names,
  after,
  choices,
  disabled,
  onChange,
}: {
  id: string;
  kind: keyof typeof descriptions;
  current?: string | null;
  names?: BarbicanReferenceNames;
  after: string | null | undefined;
  choices: { id: string; name?: string | null }[];
  disabled: boolean;
  onChange: (after: string | null | undefined) => void;
}) {
  const { label, name, description, removalWarning } = descriptions[kind];
  const unavailable =
    typeof after === "string" && !choices.some((choice) => choice.id === after);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <Label htmlFor={id}>{label}</Label>
        {current ? (
          <OctaviaBarbicanReference
            reference={current}
            names={names}
            alternate={`Open current ${name}`}
            external="External reference"
            newTab
            className="text-xs"
          />
        ) : null}
      </div>
      <Select
        value={
          unavailable ? "" : after === undefined ? KEEP : (after ?? REMOVE)
        }
        disabled={disabled}
        onValueChange={(value) =>
          onChange(value === KEEP ? undefined : value === REMOVE ? null : value)
        }
      >
        <SelectTrigger
          id={id}
          className="w-full"
          aria-invalid={unavailable}
          aria-describedby={`${id}-help`}
        >
          <SelectValue placeholder={`Selected ${name} unavailable`} />
        </SelectTrigger>
        <SelectContent className="max-w-[var(--radix-select-content-available-width)]">
          <SelectItem value={KEEP}>
            {current ? `Keep current ${name}` : `No ${name}`}
          </SelectItem>
          {current ? (
            <SelectItem value={REMOVE}>Remove {name}</SelectItem>
          ) : null}
          {choices.map(({ id, name }) => (
            <SelectItem key={id} value={id} className="wrap-anywhere">
              {name ? `${name} (${id.slice(0, 8)})` : id}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p id={`${id}-help`} className="text-xs text-muted-foreground">
        {description}{" "}
        <ResourceLink href="/key-manager/secrets" target="_blank">
          Key Manager
        </ResourceLink>
        .
      </p>
      {after === null ? (
        <MutationAlert variant="warning">{removalWarning}</MutationAlert>
      ) : unavailable ? (
        <MutationAlert>
          The selected {name} is no longer available.
        </MutationAlert>
      ) : null}
    </div>
  );
}

export const BARBICAN_NAME_BATCH_SIZE = 20;

export type BarbicanReference = {
  collection: "secrets" | "containers";
  id: string;
};

export type BarbicanReferenceNames = Partial<Record<string, string>>;

export function barbicanReferenceKey({ collection, id }: BarbicanReference) {
  return `${collection}/${id}`;
}

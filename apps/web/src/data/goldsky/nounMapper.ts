import type { PonderNoun } from "@/data/ponder/nouns/types";

export type GoldskyNoun = {
  id: string;
  owner?: { id?: string | null; delegate?: { id?: string | null } | null } | null;
  seed?: {
    background?: string | number | null;
    body?: string | number | null;
    accessory?: string | number | null;
    head?: string | number | null;
    glasses?: string | number | null;
  } | null;
};

function toNumber(value: string | number | null | undefined): number {
  return Number(value ?? 0);
}

/** Maps Goldsky's canonical nested noun entity to the legacy display shape. */
export function mapGoldskyNoun(noun: GoldskyNoun): PonderNoun | null {
  if (!noun.owner?.id || !noun.seed) return null;
  return {
    id: noun.id,
    owner: noun.owner.id,
    delegate: noun.owner.delegate?.id ?? undefined,
    background: toNumber(noun.seed.background),
    body: toNumber(noun.seed.body),
    accessory: toNumber(noun.seed.accessory),
    head: toNumber(noun.seed.head),
    glasses: toNumber(noun.seed.glasses),
  };
}

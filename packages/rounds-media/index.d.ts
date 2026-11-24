export type DeterministicCar = {
  cid: string;
  uri: `ipfs://${string}`;
  bytes: Uint8Array;
  car: Uint8Array;
};

export function createDeterministicCar(
  bytes: Uint8Array,
): Promise<DeterministicCar>;
export function inspectDeterministicCar(car: Uint8Array): Promise<{
  cid: string;
  bytes: Uint8Array;
}>;

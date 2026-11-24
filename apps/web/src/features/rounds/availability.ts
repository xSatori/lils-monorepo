export type RoundsReadAvailability =
  | { state: "ready" }
  | { state: "factory-unavailable" }
  | { state: "rpc-unavailable"; message: string };

export function getRoundsReadAvailability({
  chainId,
  hasClient,
  hasFactory,
}: {
  chainId: number;
  hasClient: boolean;
  hasFactory: boolean;
}): RoundsReadAvailability {
  if (!hasClient) {
    return {
      state: "rpc-unavailable",
      message:
        chainId === 11_155_111
          ? "Sepolia RPC unavailable."
          : "Network RPC unavailable.",
    };
  }

  return hasFactory ? { state: "ready" } : { state: "factory-unavailable" };
}

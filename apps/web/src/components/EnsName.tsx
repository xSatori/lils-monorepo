"use client";
import { Address, getAddress } from "viem";
import { HTMLAttributes } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAddressOverrides } from "@/utils/addressOverrides";
import {
  resolveEnsName,
  truncateAddressForDisplay,
} from "@/utils/ensIdentity";

interface EnsNameProps extends HTMLAttributes<HTMLSpanElement> {
  address: Address;
}

/**
 * Name component using mainnet ENS resolution with caching
 * Falls back to truncated address if ENS name is not available
 */
export function EnsName({
  address,
  className,
  ...props
}: EnsNameProps) {
  const normalizedAddress = getAddress(address);
  
  // Check for address overrides first
  const override = getAddressOverrides(normalizedAddress);
  const overrideName = override?.name;

  const { data: ensName } = useQuery({
    queryKey: ["ens-name", normalizedAddress],
    queryFn: () => resolveEnsName(normalizedAddress),
    enabled: !overrideName,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 7 * 24 * 60 * 60 * 1000,
    retry: 1,
  });

  const displayName =
    overrideName || ensName || truncateAddressForDisplay(normalizedAddress);

  return (
    <span className={className} {...props}>
      {displayName}
    </span>
  );
}


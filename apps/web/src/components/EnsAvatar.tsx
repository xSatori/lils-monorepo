"use client";
import { Address, getAddress } from "viem";
import { HTMLAttributes, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/utils/shadcn";
import { getAddressOverrides } from "@/utils/addressOverrides";
import { resolveEnsAvatar, resolveEnsName } from "@/utils/ensIdentity";

interface EnsAvatarProps extends HTMLAttributes<HTMLDivElement> {
  address: Address;
  size?: number;
}

/**
 * Generate a gradient color from an address
 */
function generateGradientFromAddress(address: string): string {
  const hash = address.slice(2, 10);
  const num = parseInt(hash, 16);
  const color = Math.ceil(num % 16777215)
    .toString(16)
    .padStart(6, "0");
  return `linear-gradient(45deg, #${color}, #FFFFFF)`;
}

/**
 * Avatar component using mainnet ENS avatar resolution with caching
 * Falls back to generated gradient avatar if ENS avatar is not available
 */
export function EnsAvatar({
  address,
  size = 24,
  className,
  ...props
}: EnsAvatarProps) {
  const normalizedAddress = getAddress(address);
  
  // Check for address overrides first
  const override = getAddressOverrides(normalizedAddress);
  const overrideAvatar = override?.avatar;

  const { data: ensName } = useQuery({
    queryKey: ["ens-name", normalizedAddress],
    queryFn: () => resolveEnsName(normalizedAddress),
    enabled: !overrideAvatar,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 7 * 24 * 60 * 60 * 1000,
    retry: 1,
  });

  const { data: ensAvatar } = useQuery({
    queryKey: ["ens-avatar", ensName],
    queryFn: () => resolveEnsAvatar(ensName!),
    enabled: !!ensName && !overrideAvatar,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 7 * 24 * 60 * 60 * 1000,
    retry: 1,
  });

  const avatarUrl = overrideAvatar || ensAvatar;
  const gradient = useMemo(
    () => generateGradientFromAddress(normalizedAddress),
    [normalizedAddress]
  );

  return (
    <div
      className={cn(
        "relative rounded-full overflow-hidden border border-black/10 flex-shrink-0",
        className
      )}
      style={{ width: size, height: size }}
      {...props}
    >
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          className="w-full h-full object-cover"
          onError={(e) => {
            // Fallback to gradient if image fails to load
            const target = e.target as HTMLImageElement;
            target.style.display = "none";
            const parent = target.parentElement;
            if (parent) {
              parent.style.background = gradient;
            }
          }}
        />
      ) : (
        <div
          className="w-full h-full"
          style={{ background: gradient }}
        />
      )}
    </div>
  );
}


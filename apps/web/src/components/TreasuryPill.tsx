"use client";
import { useTreasuryData } from "@/hooks/useTreasuryData";
import NumberFlow from "@number-flow/react";
import { Button } from "./ui/button";
import { useChainId } from "wagmi";
import { CHAIN_SPECIFIC_CONFIGS } from "@/config";
import { useMemo } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

export default function TreasuryPill() {
  const { data, isLoading, error } = useTreasuryData();
  const chainId = useChainId();

  const executorAddress = useMemo(() => {
    const config = CHAIN_SPECIFIC_CONFIGS[chainId];
    return config?.addresses.nounsTreasury || null;
  }, [chainId]);

  const getEtherscanUrl = () => {
    if (!executorAddress) return "#";
    
    const address = executorAddress.toLowerCase();
    if (chainId === 1) {
      return `https://etherscan.io/address/${address}#tokentxns`;
    } else if (chainId === 11155111) {
      return `https://sepolia.etherscan.io/address/${address}#tokentxns`;
    }
    return `https://etherscan.io/address/${address}#tokentxns`; // Default to mainnet
  };

  const handleClick = () => {
    window.open(getEtherscanUrl(), "_blank", "noopener,noreferrer");
  };

  if (isLoading) {
    return (
      <Button variant="secondary" className="flex flex-row gap-2 px-4 py-[6px]">
        <span className="label-md">Treasury</span>
        <span className="label-md">...</span>
      </Button>
    );
  }

  if (error || !data) {
    return null; // Don't show anything on error
  }

  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <Button
          variant="secondary"
          className="flex flex-row gap-2 px-4 py-[6px]"
          onClick={handleClick}
        >
          <span className="label-md">Treasury</span>
          <span className="label-md flex items-center">
            Ξ
            <NumberFlow
              value={data.totalEth}
              format={{
                notation:
                  data.totalEth > 9999 || data.totalEth < -9999
                    ? "compact"
                    : "standard",
              }}
            />
          </span>
          <span className="label-md">
            +{data.totalNouns} Nouns
          </span>
        </Button>
      </TooltipTrigger>
      <TooltipContent 
        side="bottom"
        sideOffset={8}
        avoidCollisions={true}
        collisionPadding={64}
        className="max-w-[300px]"
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <div className="font-semibold">Total Treasury</div>
            <div>Ξ {data.totalEth.toFixed(4)} ETH</div>
            <div>$ {data.totalUsd.toLocaleString()} USD</div>
            <div>{data.totalNouns} Nouns</div>
          </div>
          
          <div className="border-t border-gray-600 pt-2">
            <div className="font-semibold text-sm mb-2">Balances (Total)</div>
            <div className="text-xs space-y-1">
              {(() => {
                const totals = {
                  eth: data.executor.eth + data.payer.eth + data.tokenBuyer.eth,
                  steth: data.executor.steth + data.payer.steth + data.tokenBuyer.steth,
                  weth: data.executor.weth + data.payer.weth + data.tokenBuyer.weth,
                  oeth: data.executor.oeth + data.payer.oeth + data.tokenBuyer.oeth,
                  reth: data.executor.reth + data.payer.reth + data.tokenBuyer.reth,
                  usdc: data.executor.usdc + data.payer.usdc + data.tokenBuyer.usdc,
                };
                
                const items = [];
                if (totals.eth > 0) items.push(<div key="eth">ETH: {totals.eth.toFixed(4)}</div>);
                if (totals.steth > 0) items.push(<div key="steth">stETH: {totals.steth.toFixed(4)}</div>);
                if (totals.weth > 0) items.push(<div key="weth">WETH: {totals.weth.toFixed(4)}</div>);
                if (totals.oeth > 0) items.push(<div key="oeth">OETH: {totals.oeth.toFixed(4)}</div>);
                if (totals.reth > 0) items.push(<div key="reth">rETH: {totals.reth.toFixed(4)}</div>);
                // Always show USDC
                items.push(<div key="usdc">USDC: {totals.usdc.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>);
                
                return items.length > 0 ? items : <div>No balances</div>;
              })()}
            </div>
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}


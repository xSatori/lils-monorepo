"use client";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Button } from "./ui/button";
import { Address } from "viem";
import { EnsAvatar } from "./EnsAvatar";
import { EnsName } from "./EnsName";
import TreasuryPill from "./TreasuryPill";
import clsx from "clsx";
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Link, useNavigate } from "react-router-dom";
import { LinkExternal } from "./ui/link";
import Icon from "./ui/Icon";
import { useDisconnect } from "wagmi";
import { useCollection } from "@/hooks/useDrafts";
import DelegationDialog from "./dialog/DelegationDialog";

interface WalletDropdownProps {
  disableMobileShrink?: boolean;
}

interface MenuItem {
  label: string;
  href?: string;
  external?: boolean;
  onClick?: () => void;
  hasDot?: boolean;
  icon?: string;
  isAuction?: boolean;
}

const MENU_SECTIONS = {
  YOU: [
    { label: "Edit profile", href: "/profile/edit" },
    { label: "Manage delegation", href: "/delegation" },
    { label: "Proposal & topic drafts", href: "/new", hasDot: true },
  ],
  DAO: [
    { label: "Auction", href: "/", isAuction: true },
    { label: "Explore", href: "/explore" },
    { label: "Proposals", href: "/vote" },
    { label: "Candidates", href: "/candidates" },
    { label: "Discussion topics", href: "/topics" },
    { label: "Voters", href: "/profiles" },
    // { label: "Treasury", href: "/stats/treasury" },
  ],
  COMMUNITY: [
    { label: "Discord", href: "https://discord.gg/X6gpawuBaX", external: true },
    { label: "X", href: "https://x.com/lilnounsdao", external: true },
  ],
};

export default function WalletDropdown({ disableMobileShrink }: WalletDropdownProps) {
  const [open, setOpen] = useState(false);
  const [delegationDialogOpen, setDelegationDialogOpen] = useState(false);
  const { disconnect } = useDisconnect();
  const { items: drafts } = useCollection();
  const navigate = useNavigate();
  const hasDrafts = drafts.length > 0;
  
  const scrollToAuction = () => {
    navigate("/");
    // Scroll to top after navigation (auction is at the top of home page)
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, 100);
  };

  return (
    <>
      <ConnectButton.Custom>
        {({ account, chain, openAccountModal, openChainModal, openConnectModal }) => {
          const connected = account && chain;

          return (
            <div className="flex flex-row gap-2">
            <TreasuryPill />
            {(() => {
              if (!connected) {
                return (
                  <Button onClick={openConnectModal} variant="secondary" className="py-[10px]">
                    Connect
                  </Button>
                );
              }

              if (chain.unsupported) {
                return (
                  <Button variant="negative" onClick={openChainModal}>
                    Wrong Network
                  </Button>
                );
              }

              return (
                <Popover open={open} onOpenChange={setOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="secondary"
                      className="flex flex-row gap-2 px-4 py-[6px]"
                    >
                      <EnsAvatar address={account.address as Address} size={32} />
                      <EnsName
                        address={account.address as Address}
                        className={clsx("label-md md:block", !disableMobileShrink && "hidden")}
                      />
                      <Icon icon="chevronDown" size={16} className="fill-content-primary" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="end"
                    sideOffset={8}
                    className="w-[280px] bg-white p-0 text-gray-900 border-2 border-gray-200 shadow-lg"
                  >
                    {/* Header */}
                    <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-3">
                      <EnsAvatar address={account.address as Address} size={32} />
                      <div className="flex-1 min-w-0">
                        <EnsName
                          address={account.address as Address}
                          className="label-md text-gray-900 truncate"
                        />
                      </div>
                      <Icon icon="chevronDown" size={16} className="fill-gray-600 rotate-180 shrink-0" />
                    </div>

                    {/* Menu Content */}
                    <div className="max-h-[calc(100vh-200px)] overflow-y-auto">
                      {/* YOU Section */}
                      <div className="px-4 py-2">
                        <div className="label-sm text-gray-500 uppercase mb-2">YOU</div>
                        <div className="flex flex-col gap-1">
                          <MenuItemComponent
                            label="My Profile"
                            href={`/profile/${account.address}`}
                            onClose={() => setOpen(false)}
                          />
                          <MenuItemComponent 
                            label="Manage delegation" 
                            onClick={() => {
                              setDelegationDialogOpen(true);
                              setOpen(false);
                            }}
                            onClose={() => setOpen(false)}
                          />
                          {/* <MenuItemComponent
                            label="Proposal & topic drafts"
                            href="/new"
                            hasDot={hasDrafts}
                            onClose={() => setOpen(false)}
                          /> */}
                          {/* TODO: Add proposal & topic drafts */}

                        </div>
                      </div>

                      {/* DAO Section */}
                      <div className="px-4 py-2 border-t border-gray-200">
                        <div className="label-sm text-gray-500 uppercase mb-2">DAO</div>
                        <div className="flex flex-col gap-1">
                          {MENU_SECTIONS.DAO.map((item) => (
                            <MenuItemComponent 
                              key={item.label} 
                              {...item}
                              onClose={() => setOpen(false)}
                              onClick={item.isAuction ? scrollToAuction : undefined}
                            />
                          ))}
                        </div>
                      </div>

                      {/* COMMUNITY Section */}
                      <div className="px-4 py-2 border-t border-gray-200">
                        <div className="label-sm text-gray-500 uppercase mb-2">COMMUNITY</div>
                        <div className="flex flex-col gap-1">
                          {MENU_SECTIONS.COMMUNITY.map((item) => (
                            <MenuItemComponent 
                              key={item.label} 
                              {...item}
                              onClose={() => setOpen(false)}
                            />
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Account and Disconnect */}
                    <div className="border-t border-gray-200">
                      <div className="p-2">
                        <MenuItemComponent
                          label="Account"
                          onClick={() => {
                            openAccountModal();
                            setOpen(false);
                          }}
                          hasDot={true}
                          onClose={() => setOpen(false)}
                        />
                      </div>
                      <div className="p-2">
                        <Button
                          variant="ghost"
                          className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => {
                            disconnect();
                            setOpen(false);
                          }}
                        >
                          Disconnect wallet
                        </Button>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              );
            })()}
            </div>
          );
        }}
      </ConnectButton.Custom>
      <DelegationDialog open={delegationDialogOpen} onOpenChange={setDelegationDialogOpen} />
    </>
  );
}

function MenuItemComponent({ 
  label, 
  href, 
  external, 
  onClick, 
  hasDot, 
  icon,
  isAuction,
  onClose 
}: MenuItem & { onClose?: () => void }) {
  const handleClick = () => {
    if (onClick) {
      onClick();
    }
    if (onClose) {
      // Close dropdown after navigation
      setTimeout(() => onClose(), 100);
    }
  };

  const content = (
    <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer">
      <span className="label-md text-gray-900">{label}</span>
      <div className="flex items-center gap-2">
        {hasDot && (
          <div className="h-1.5 w-1.5 rounded-full bg-gray-500" />
        )}
        {external && (
          <Icon icon="arrowUpRight" size={14} className="fill-gray-600" />
        )}
        {icon && (
          <Icon icon={icon as any} size={14} className="fill-gray-600" />
        )}
      </div>
    </div>
  );

  if (onClick || isAuction) {
    return <div onClick={handleClick}>{content}</div>;
  }

  if (external && href) {
    return (
      <LinkExternal href={href} className="block" onClick={handleClick}>
        {content}
      </LinkExternal>
    );
  }

  if (href) {
    return (
      <Link to={href} className="block" onClick={handleClick}>
        {content}
      </Link>
    );
  }

  return content;
}


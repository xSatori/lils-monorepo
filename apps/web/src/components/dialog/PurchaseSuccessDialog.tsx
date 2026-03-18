"use client";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNounImage } from "@/hooks/useNounImage";
import { getNounById } from "@/data/noun/getNounById";
import { Noun, NounTraitType } from "@/data/noun/types";
import { Separator } from "../ui/separator";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import Image from "../OptimizedImage";
import Confetti from "../Confetti";
import { DrawerDialogDescription } from "../ui/DrawerDialog";
import ShareToFarcaster from "../ShareToFarcaster";
import ShareToX from "../ShareToX";
import { LinkExternal } from "../ui/link";
import { useDiscordEvents } from "@/hooks/useDiscordEvents";
import { formatEventDateTime, getDiscordEventUrl } from "@/data/discord/getScheduledEvents";
import { getPostOverviews } from "@/data/cms/getPostOverviews";
import {
  DrawerDialog,
  DrawerDialogContent,
  DrawerDialogContentInner,
  DrawerDialogTitle,
} from "../ui/DrawerDialog";
import { Link } from "react-router-dom";
import Icon from "../ui/Icon";
import clsx from "clsx";
import { useAccount, useEnsAddress } from "wagmi";
import { useWriteNounsNftTokenDelegate, useReadNounsNftTokenBalanceOf, useReadNounsNftTokenGetCurrentVotes } from "@/data/generated/wagmi";
import { isAddress, getAddress } from "viem";
import { EnsAvatar } from "../EnsAvatar";
import { EnsName } from "../EnsName";

interface PurchaseSuccessDialogProps {
  nounId: string;
  txHash: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DISCORD_INVITE_URL = "https://discord.gg/X6gpawuBaX";
const TWITTER_URL = "https://twitter.com/lilnounsdao";

export default function PurchaseSuccessDialog({
  nounId,
  txHash,
  open,
  onOpenChange,
}: PurchaseSuccessDialogProps) {
  const [displayNoun, setDisplayNoun] = useState<Noun | undefined>();
  const [showConfetti, setShowConfetti] = useState(false);
  const { address: account } = useAccount();
  
  // For testing: use previous noun (nounId - 1) instead of current one
  const testNounId = useMemo(() => {
    if (!nounId) return "";
    const numId = parseInt(nounId);
    return numId > 0 ? (numId - 1).toString() : nounId;
  }, [nounId]);

  // Fetch noun data (using previous noun for testing)
  const { data: noun, isLoading: nounLoading } = useQuery({
    queryKey: ["noun", testNounId],
    queryFn: async () => {
      if (!testNounId) return null;
      return await getNounById(testNounId);
    },
    enabled: !!testNounId && !!nounId && !!txHash && open,
  });

  useEffect(() => {
    if (noun) {
      setDisplayNoun(noun);
    }
  }, [noun]);

  // Trigger confetti when dialog opens, stop when closed
  useEffect(() => {
    if (open) {
      setShowConfetti(true);
      // Reset confetti after animation completes (20 seconds)
      const timer = setTimeout(() => setShowConfetti(false), 20000);
      return () => clearTimeout(timer);
    } else {
      // Stop confetti immediately when dialog closes
      setShowConfetti(false);
    }
  }, [open]);

  const fullImageData = useNounImage("full", noun || undefined);
  const shareUrl = `${window.location.origin}/explore?lilnounId=${nounId}`;
  const shareText = `I just purchased Lil Noun ${nounId} on Lilnouns.wtf! 🎉`;

  // Fetch Discord events
  const { data: discordEvents = [] } = useDiscordEvents(undefined, open);

  // Fetch CMS posts
  const { data: cmsPosts = [] } = useQuery({
    queryKey: ["post-overviews"],
    queryFn: getPostOverviews,
    enabled: open,
    staleTime: 5 * 60 * 1000,
    select: (data) => data.slice(0, 3), // Show first 3 posts
  });

  const nextEvent = discordEvents[0];

  // Don't show dialog if no nounId or txHash
  const shouldShow = !!(nounId && txHash);

  return (
    <>
      {/* Always render Confetti to avoid hooks violation, control visibility via prop */}
      <Confetti show={shouldShow && showConfetti} />
      <DrawerDialog open={open && shouldShow} onOpenChange={onOpenChange}>
        <DrawerDialogContent
          className={clsx(
            "md:aspect-[100/45] md:max-w-[min(95vw,1400px)]",
            displayNoun?.traits.background.seed === 1 ? "bg-nouns-warm" : "bg-nouns-cool",
          )}
        >
          <DrawerDialogTitle className="sr-only">
            Purchase Success - Lil Noun {nounId}
          </DrawerDialogTitle>
          <DrawerDialogDescription className="sr-only">
            You successfully purchased Lil Noun {nounId}. Share your purchase and learn what's next.
          </DrawerDialogDescription>
          <DrawerDialogContentInner className={clsx("p-0 md:flex-row")}>
            {/* Left side - Noun Image */}
            <div className="flex w-full flex-col items-center gap-4 px-6 pt-6 md:w-[45%] md:px-8 md:pt-12">
              <div className="w-full pl-6 heading-1 md:hidden">
                🎉 Congratulations!
              </div>
              <Image
                src={fullImageData ?? "/noun-loading-skull.gif"}
                width={600}
                height={600}
                alt="Lil Noun"
                unoptimized={fullImageData === undefined}
                className="flex aspect-square h-fit max-h-[400px] w-full max-w-[min(70%,400px)] shrink-0 justify-center object-contain object-bottom md:h-full md:max-h-none md:w-full md:max-w-none"
              />
              <div className="flex flex-col items-center gap-2 text-center md:hidden">
                <h2 className="heading-2">Lil Noun {nounId}</h2>
                <p className="text-semantic-positive label-lg">Successfully Purchased!</p>
              </div>
            </div>

            {/* Right side - Content */}
            <div className="flex w-full flex-auto flex-col gap-6 overflow-visible px-6 pb-6 scrollbar-track-transparent md:h-full md:overflow-y-auto md:px-8 md:pt-12">
              <div className="hidden md:flex flex-col gap-2">
                <span className="text-semantic-positive label-lg">🎉 Success!</span>
                <h2 className="heading-1">Congratulations!</h2>
                <p className="paragraph-lg">You're now the proud owner of Lil Noun {nounId}!</p>
              </div>

              <Separator className="h-[2px]" />

              {/* Share Section */}
              <div className="flex flex-col gap-4">
                <h5>Share Your Purchase</h5>
                <div className="flex flex-col gap-2 md:flex-row md:items-stretch">
                  <ShareToFarcaster text={shareText}>
                    <Button variant="primary" className="w-full md:flex-1 gap-3 h-12 flex items-center justify-center">
                      <Icon icon="farcaster" size={20} className="fill-white shrink-0" />
                      Share to Farcaster
                    </Button>
                  </ShareToFarcaster>
                  <ShareToX text={shareText} url={shareUrl}>
                    <Button variant="secondary" className="w-full md:flex-1 gap-3 h-12 flex items-center justify-center">
                      <Icon icon="xTwitter" size={20} className="fill-content-primary shrink-0" />
                      Share on X
                    </Button>
                  </ShareToX>
                </div>
              </div>

              <Separator className="h-[2px]" />

              {/* Traits Section */}
              {nounLoading ? (
                <div className="flex flex-col gap-4">
                  <h5>Traits</h5>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    {Array(5).fill(0).map((_, i) => (
                      <div key={i} className="flex justify-start gap-4 rounded-xl bg-black/5 p-2">
                        <Skeleton className="h-12 w-12 rounded-lg" />
                        <div className="flex flex-col gap-1">
                          <Skeleton className="h-4 w-16" />
                          <Skeleton className="h-4 w-24" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <h5>Traits</h5>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <NounTraitCard type="head" noun={noun || undefined} />
                    <NounTraitCard type="glasses" noun={noun || undefined} />
                    <NounTraitCard type="body" noun={noun || undefined} />
                    <NounTraitCard type="accessory" noun={noun || undefined} />
                    <NounTraitCard type="background" noun={noun || undefined} />
                  </div>
                </div>
              )}

              <Separator className="h-[2px]" />

              {/* What's Next Section */}
              <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-2">
                  <h5>✨ What's Next?</h5>
                  <p className="text-content-secondary paragraph-sm">
                    Welcome to the Lil Nouns community! Here's how to get started:
                  </p>
                </div>

                {/* Join Communities */}
                <div className="flex flex-col gap-3">
                  <h6 className="label-md">Join the Community</h6>
                  <div className="flex flex-col gap-2 md:flex-row">
                    <LinkExternal
                      href={DISCORD_INVITE_URL}
                      className="flex items-center gap-3 rounded-xl bg-[#5865F2] p-4 text-white transition-all hover:brightness-90"
                    >
                      <Icon icon="farcaster" size={24} className="fill-white" />
                      <div className="flex flex-col">
                        <span className="label-md font-semibold">Join Discord</span>
                        <span className="text-xs text-gray-200">3k+ Members</span>
                      </div>
                    </LinkExternal>
                    <LinkExternal
                      href={TWITTER_URL}
                      className="flex items-center gap-3 rounded-xl bg-black p-4 text-white transition-all hover:brightness-90"
                    >
                      <Icon icon="xTwitter" size={24} className="fill-white" />
                      <div className="flex flex-col">
                        <span className="label-md font-semibold">Follow on X</span>
                        <span className="text-xs text-gray-400">Stay updated</span>
                      </div>
                    </LinkExternal>
                  </div>
                </div>

                {/* Next Community Call */}
                {nextEvent && (
                  <div className="flex flex-col gap-3">
                    <h6 className="label-md">📅 Next Community Call</h6>
                    <LinkExternal
                      href={getDiscordEventUrl(nextEvent)}
                      className="flex items-start gap-3 rounded-xl bg-black/5 p-4 transition-all hover:bg-black/10"
                    >
                      <div className="flex flex-1 flex-col gap-1">
                        <span className="label-md font-semibold">{nextEvent.name}</span>
                        {nextEvent.description && (
                          <span className="text-content-secondary paragraph-sm line-clamp-2">
                            {nextEvent.description}
                          </span>
                        )}
                        <span className="text-content-secondary label-sm">
                          {formatEventDateTime(nextEvent.scheduled_start_time)}
                        </span>
                      </div>
                      <Icon icon="arrowUpRight" size={20} className="fill-content-secondary shrink-0 mt-1" />
                    </LinkExternal>
                  </div>
                )}

                {/* Learn Articles */}
                {cmsPosts.length > 0 && (
                  <div className="flex flex-col gap-3">
                    <h6 className="label-md">📚 Learn More</h6>
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                      {cmsPosts.map((post: any) => (
                        <Link
                          key={post.id}
                          to={`/learn/${post.slug}`}
                          className="group flex flex-col gap-2 rounded-xl bg-black/5 p-3 transition-all hover:bg-black/10"
                        >
                          <span className="label-md font-semibold line-clamp-2 group-hover:text-content-primary">
                            {post.title}
                          </span>
                          {post.description && (
                            <span className="text-content-secondary paragraph-sm line-clamp-2">
                              {post.description}
                            </span>
                          )}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {/* Token Powers */}
                <div className="flex flex-col gap-3">
                  <h6 className="label-md">⚡ What Your Token Unlocks</h6>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-start gap-3 rounded-xl bg-black/5 p-4">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-content-primary text-white text-xs font-bold mt-0.5">
                        ✓
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="label-md font-semibold">Vote on Proposals</span>
                        <span className="text-content-secondary paragraph-sm">
                          Participate in DAO governance and shape the future of Lil Nouns
                        </span>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 rounded-xl bg-black/5 p-4">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-content-primary text-white text-xs font-bold mt-0.5">
                        ✎
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="label-md font-semibold">Create Proposals</span>
                        <span className="text-content-secondary paragraph-sm">
                          Submit ideas and proposals to the DAO treasury
                        </span>
                      </div>
                    </div>
                    <Link
                      to="/vote"
                      className="flex items-start gap-3 rounded-xl bg-black/5 p-4 transition-all hover:bg-black/10"
                    >
                      <Icon icon="arrowRight" size={24} className="fill-content-primary shrink-0 mt-0.5" />
                      <div className="flex flex-col gap-1">
                        <span className="label-md font-semibold">Explore Governance</span>
                        <span className="text-content-secondary paragraph-sm">
                          See active proposals and voting history
                        </span>
                      </div>
                    </Link>
                  </div>
                </div>

                {/* Delegation Section */}
                {account && <DelegationSection account={account} />}
              </div>
            </div>
          </DrawerDialogContentInner>
        </DrawerDialogContent>
      </DrawerDialog>
    </>
  );
}

function DelegationSection({ account }: { account: `0x${string}` }) {
  const [delegateInput, setDelegateInput] = useState("");
  const [resolvedAddress, setResolvedAddress] = useState<`0x${string}` | null>(null);
  
  // Check if input is ENS name
  const isEnsName = delegateInput.includes(".") && !isAddress(delegateInput);
  
  // Resolve ENS name to address
  const { data: ensAddress, isLoading: isResolvingEns } = useEnsAddress({
    name: isEnsName ? delegateInput : undefined,
    query: { enabled: isEnsName && delegateInput.length > 0 },
  });

  // Get resolved address (either direct address or ENS resolved)
  const delegateAddress = useMemo(() => {
    if (isAddress(delegateInput)) {
      return getAddress(delegateInput) as `0x${string}`;
    }
    if (ensAddress) {
      return ensAddress;
    }
    return null;
  }, [delegateInput, ensAddress]);

  // Update resolved address when ENS resolves
  useEffect(() => {
    if (delegateAddress) {
      setResolvedAddress(delegateAddress);
    } else {
      setResolvedAddress(null);
    }
  }, [delegateAddress]);

  // Get user's token balance
  const { data: tokenBalance } = useReadNounsNftTokenBalanceOf({
    args: account ? [account] : undefined,
    query: { enabled: !!account },
  });

  const availableVotes = tokenBalance ? Number(tokenBalance) : 0;

  // Get delegatee's current votes
  const { data: delegateeVotes } = useReadNounsNftTokenGetCurrentVotes({
    args: resolvedAddress ? [resolvedAddress] : undefined,
    query: { enabled: !!resolvedAddress },
  });

  const currentVotes = delegateeVotes ? Number(delegateeVotes) : 0;

  // Delegation write hook
  const { writeContractAsync, isPending, isSuccess, isError, error } = useWriteNounsNftTokenDelegate();

  const handleDelegate = async () => {
    if (!resolvedAddress || !account) return;
    
    try {
      await writeContractAsync({
        args: [resolvedAddress],
      });
    } catch (err) {
      console.error("Delegation error:", err);
    }
  };

  const isValidAddress = resolvedAddress !== null;
  const isSameAsAccount = resolvedAddress?.toLowerCase() === account.toLowerCase();
  const canDelegate = isValidAddress && !isSameAsAccount && availableVotes > 0 && !isPending && !isSuccess;

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-gradient-to-br from-purple-50 to-blue-50 p-4 border-2 border-purple-200">
      <div className="flex flex-col gap-2">
        <h6 className="label-md font-semibold">🎯 Can't vote right now? Delegate your vote!</h6>
        <p className="text-content-secondary paragraph-sm">
          Delegate your voting power to someone else so they can vote on proposals on your behalf. You can change or revoke delegation anytime.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <label className="label-sm text-content-secondary">Delegate to (address or ENS)</label>
          <div className="relative">
            <input
              type="text"
              value={delegateInput}
              onChange={(e) => setDelegateInput(e.target.value)}
              placeholder="0x... or vitalik.eth"
              className={clsx(
                "w-full rounded-lg border-2 px-4 py-3 label-md transition-all",
                isResolvingEns && "border-blue-300",
                isValidAddress && !isSameAsAccount && "border-green-300",
                delegateInput.length > 0 && !isValidAddress && "border-red-300",
                isSameAsAccount && "border-yellow-300"
              )}
            />
            {isResolvingEns && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
              </div>
            )}
          </div>
          {delegateInput.length > 0 && !isResolvingEns && (
            <div className="text-xs text-content-secondary">
              {!isValidAddress && "Invalid address or ENS name"}
              {isSameAsAccount && "You're already delegating to yourself"}
              {isValidAddress && !isSameAsAccount && resolvedAddress && (
                <div className="flex items-center gap-2">
                  <EnsAvatar address={resolvedAddress} size={16} />
                  <EnsName address={resolvedAddress} />
                  <span className="text-content-secondary">
                    {currentVotes > 0 ? `Already has ${currentVotes} vote${currentVotes !== 1 ? 's' : ''}` : 'Has 0 votes'}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {availableVotes > 0 && (
          <Button
            onClick={handleDelegate}
            disabled={!canDelegate}
            variant={canDelegate ? "primary" : "ghost"}
            className="w-full"
          >
            {isPending && "Delegating..."}
            {isSuccess && "✓ Delegated!"}
            {isError && "Delegation Failed"}
            {!isPending && !isSuccess && !isError && (
              <>
                Delegate {availableVotes} {availableVotes === 1 ? "Vote" : "Votes"}
              </>
            )}
          </Button>
        )}

        {availableVotes === 0 && (
          <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-3">
            <p className="text-xs text-yellow-800">
              You don't have any tokens to delegate. Once you own a Lil Noun, you can delegate your voting power.
            </p>
          </div>
        )}

        {isSuccess && (
          <div className="rounded-lg bg-green-50 border border-green-200 p-3">
            <p className="text-xs text-green-800">
              ✓ Successfully delegated {availableVotes} {availableVotes === 1 ? "vote" : "votes"}!
            </p>
          </div>
        )}

        {isError && error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3">
            <p className="text-xs text-red-800">
              Delegation failed: {error.message || "Unknown error"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function NounTraitCard({ type, noun }: { type: NounTraitType; noun?: Noun }) {
  const traitImage = useNounImage(type, noun);
  const trait = noun?.traits[type];

  return (
    <div className="flex justify-start gap-4 rounded-xl bg-black/5 p-2">
      {traitImage ? (
        <Image
          src={traitImage}
          width={48}
          height={48}
          alt="Lil Noun Trait"
          className="h-12 w-12 rounded-lg"
        />
      ) : (
        <Skeleton className="h-12 w-12 rounded-lg" />
      )}
      <div className="flex flex-col">
        <span className="text-content-secondary paragraph-sm">
          {type.charAt(0).toUpperCase() + type.slice(1)}
        </span>
        <span className="label-md">
          {trait?.name
            ?.split("-")
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ")}
        </span>
      </div>
    </div>
  );
}


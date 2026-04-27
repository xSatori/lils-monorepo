import { Helmet } from "react-helmet-async";
import { Link, useParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import {
  ArrowLeft,
  Ban,
  Settings,
  EyeOff,
  ExternalLink,
  FileText,
  Pencil,
  Plus,
  ShieldCheck,
  Trophy,
  Users,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialogBase";
import CreateRoundDialog from "@/components/Rounds/CreateRoundDialog";
import RoundCard from "@/components/Rounds/RoundCard";
import RoundTimeline from "@/components/Rounds/RoundTimeline";
import { lilRounds, getRoundByHandle } from "@/data/rounds/lilRounds";
import {
  LIL_NOUNS_TOKEN_ADDRESS,
  LIL_NOUNS_TREASURY_ADDRESS,
} from "@/data/rounds/onchain";
import { getRoundState } from "@/data/rounds/roundState";
import { CreateRoundInput, Round } from "@/data/rounds/types";
import NotFoundPage from "./NotFoundPage";

const createdRoundsStorageKey = "lil-nouns-created-rounds";
const globalRoundAdminWallets = [
  "0x0000000000000000000000000000000000000000",
  "0xdcf37d8aa17142f053aaa7dc56025ab00d897a19",
];

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
}) {
  return (
    <div className="flex min-h-[116px] flex-col justify-between rounded-[16px] border bg-white p-5">
      <div className="flex items-center justify-between gap-4 text-content-secondary label-sm">
        <span>{label}</span>
        <Icon className="h-5 w-5" />
      </div>
      <p className="heading-4">{value}</p>
    </div>
  );
}

function RoundSection({
  title,
  rounds,
}: {
  title: string;
  rounds: typeof lilRounds;
}) {
  if (rounds.length === 0) return null;

  return (
    <section className="flex flex-col gap-4">
      <h2 className="heading-5">{title}</h2>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
        {rounds.map((round) => (
          <RoundCard key={round.id} round={round} />
        ))}
      </div>
    </section>
  );
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function createRoundFromInput(input: CreateRoundInput, existingRounds: Round[]): Round {
  const baseHandle = slugify(input.name) || `round-${Date.now()}`;
  const existingHandles = new Set(existingRounds.map((round) => round.handle));
  let handle = baseHandle;
  let count = 2;

  while (existingHandles.has(handle)) {
    handle = `${baseHandle}-${count}`;
    count += 1;
  }

  return {
    ...input,
    id: handle,
    handle,
    participants: 1,
    creator: input.admin.wallet || input.admin.handle,
    visibility: "Public",
    moderationStatus: "Open",
    community: {
      name: "Lil Nouns DAO",
      handle: "lil-nouns",
      image: "/app-icon.jpeg",
    },
    proposals: [],
  };
}

function shortAddress(address: string) {
  if (!address.startsWith("0x") || address.length < 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function RoundsIndex({
  rounds,
  onCreateRound,
}: {
  rounds: Round[];
  onCreateRound: (round: CreateRoundInput) => void;
}) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const activeRounds = rounds.filter((round) => {
    const state = getRoundState(round);
    return state === "Proposing" || state === "Voting";
  });
  const upcomingRounds = rounds.filter((round) => getRoundState(round) === "Upcoming");
  const endedRounds = rounds.filter((round) => getRoundState(round) === "Ended");
  const fundsDeployed = rounds
    .reduce((total, round) => total + Number(round.funds.replace(/[^0-9.]/g, "")), 0)
    .toLocaleString("en-US", { maximumFractionDigits: 2 });
  const totalProposals = rounds.reduce((total, round) => total + round.proposals.length, 0);
  const uniqueParticipants = rounds.reduce((total, round) => total + round.participants, 0);

  return (
    <>
      <Helmet>
        <title>Rounds | Lil Nouns DAO</title>
        <meta
          name="description"
          content="Explore Lil Nouns funding rounds, submit ideas, and vote on what the DAO should fund."
        />
        <link rel="canonical" href="https://www.lilnouns.wtf/rounds" />
      </Helmet>

      <div className="flex w-full max-w-[1400px] flex-col gap-12 p-6 pb-24 md:p-10 md:pb-24">
        <section className="grid gap-8 lg:grid-cols-[1fr_520px] lg:items-start">
          <div className="flex flex-col gap-4">
            <h1 className="heading-2">Rounds</h1>
            <p className="max-w-[760px] text-content-secondary paragraph-lg">
              Rounds let the Lil Nouns community fund focused batches of work.
              Submit a scoped proposal, earn support, and help decide which ideas
              receive funding. Anyone can create a round.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button onClick={() => setIsCreateOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create Round
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Rounds Created" value={String(rounds.length)} icon={Trophy} />
            <StatCard label="Funds Deployed" value={`${fundsDeployed} ETH`} icon={WalletCards} />
            <StatCard label="Proposals" value={String(totalProposals)} icon={FileText} />
            <StatCard label="Unique Participants" value={String(uniqueParticipants)} icon={Users} />
          </div>
        </section>

        <RoundSection title="Happening Now" rounds={activeRounds} />
        <RoundSection title="Starting Soon" rounds={upcomingRounds} />
        <RoundSection title="Completed" rounds={endedRounds} />
      </div>

      <CreateRoundDialog
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreateRound={onCreateRound}
      />
    </>
  );
}

function AdminAction({
  icon: Icon,
  label,
  description,
}: {
  icon: LucideIcon;
  label: string;
  description: string;
}) {
  return (
    <button className="flex items-start gap-3 rounded-[12px] bg-background-ternary p-3 text-left transition-colors hover:bg-background-secondary">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-content-secondary" />
      <span className="min-w-0">
        <span className="block label-md">{label}</span>
        <span className="block text-content-secondary paragraph-sm">{description}</span>
      </span>
    </button>
  );
}

function RoundLinks({ round }: { round: Round }) {
  return (
    <div className="rounded-[16px] border bg-white p-5">
      <h2 className="heading-6 mb-4">Links</h2>
      <div className="grid gap-3 md:grid-cols-3">
        {round.links.map((link) => (
          <a
            key={link.href}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex min-h-[104px] items-start justify-between gap-4 rounded-[12px] bg-background-ternary p-4 transition-colors hover:bg-background-secondary"
          >
            <div className="min-w-0">
              <p className="label-md">{link.label}</p>
              <p className="text-content-secondary paragraph-sm">{link.description}</p>
            </div>
            <ExternalLink className="mt-1 h-4 w-4 shrink-0 text-content-secondary transition-colors group-hover:text-content-primary" />
          </a>
        ))}
      </div>
    </div>
  );
}

function AdminControlsModal({
  isOpen,
  onOpenChange,
  canManageRound,
  canManageGlobally,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  canManageRound: boolean;
  canManageGlobally: boolean;
}) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[640px]">
        <div className="flex flex-col gap-6 p-6">
          <div className="flex flex-col gap-2">
            <DialogTitle className="heading-5">Admin Controls</DialogTitle>
            <p className="text-content-secondary paragraph-md">
              Controls are available to connected wallets assigned as this round's
              admin or as a global rounds admin.
            </p>
          </div>

          {canManageRound && (
            <div className="rounded-[16px] border bg-white p-5">
              <h2 className="heading-6 mb-4">Round Controls</h2>
              <div className="flex flex-col gap-3">
                <AdminAction
                  icon={Pencil}
                  label="Edit round"
                  description="Update details, links, dates, and awards."
                />
                <AdminAction
                  icon={EyeOff}
                  label="Moderate proposals"
                  description="Hide spam, flag duplicates, and manage review notes."
                />
              </div>
            </div>
          )}

          {canManageGlobally && (
            <div className="rounded-[16px] border bg-white p-5">
              <div className="mb-4 flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-blue-600" />
                <h2 className="heading-6">Global Admin</h2>
              </div>
              <div className="flex flex-col gap-3">
                <AdminAction
                  icon={Ban}
                  label="Pause round"
                  description="Pause abusive or misconfigured rounds."
                />
                <AdminAction
                  icon={FileText}
                  label="Audit changes"
                  description="Review creation, edits, moderation, and funding metadata."
                />
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function OnchainRoundCard({ round }: { round: Round }) {
  const onchain = round.onchain;
  const eligibilityToken = onchain?.eligibilityTokenAddress || LIL_NOUNS_TOKEN_ADDRESS;
  const feeRecipient = onchain?.feeRecipient || LIL_NOUNS_TREASURY_ADDRESS;

  return (
    <div className="rounded-[16px] border bg-white p-5">
      <h2 className="heading-6 mb-4">Onchain Setup</h2>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <p className="text-content-secondary label-sm">Network</p>
          <p className="label-md">Ethereum mainnet</p>
        </div>
        <div className="flex items-center justify-between gap-4">
          <p className="text-content-secondary label-sm">Prize token</p>
          <p className="label-md">{onchain?.prizeTokenType || "ETH"}</p>
        </div>
        {onchain?.prizeTokenAddress && (
          <div className="flex items-center justify-between gap-4">
            <p className="text-content-secondary label-sm">Token address</p>
            <p className="label-md">{shortAddress(onchain.prizeTokenAddress)}</p>
          </div>
        )}
        <div className="flex items-center justify-between gap-4">
          <p className="text-content-secondary label-sm">Creation fee</p>
          <p className="label-md">{onchain?.feeAmount || "0.01 ETH"}</p>
        </div>
        <div className="flex items-center justify-between gap-4">
          <p className="text-content-secondary label-sm">Fee recipient</p>
          <p className="label-md">{shortAddress(feeRecipient)}</p>
        </div>
        <div className="flex items-center justify-between gap-4">
          <p className="text-content-secondary label-sm">Eligibility</p>
          <p className="label-md">
            {onchain?.eligibilityType === "CustomERC721" ? "Custom NFT" : "Lil Nouns"}
          </p>
        </div>
        <div className="flex items-center justify-between gap-4">
          <p className="text-content-secondary label-sm">Voting token</p>
          <p className="label-md">{shortAddress(eligibilityToken)}</p>
        </div>
      </div>
    </div>
  );
}

function loadCreatedRounds() {
  if (typeof window === "undefined") return [];

  try {
    const storedRounds = window.localStorage.getItem(createdRoundsStorageKey);
    if (!storedRounds) return [];
    const parsedRounds = JSON.parse(storedRounds);
    return Array.isArray(parsedRounds) ? (parsedRounds as Round[]) : [];
  } catch (error) {
    console.error("Failed to load created rounds", error);
    return [];
  }
}

function RoundDetail({ handle, rounds }: { handle: string; rounds: Round[] }) {
  const round = rounds.find((item) => item.handle === handle) || getRoundByHandle(handle);
  const { address, isConnected } = useAccount();
  const [isAdminOpen, setIsAdminOpen] = useState(false);

  if (!round) return <NotFoundPage />;

  const state = getRoundState(round);
  const sortedProposals = [...round.proposals].sort((a, b) => b.votes - a.votes);
  const connectedWallet = address?.toLowerCase();
  const roundAdminWallet = round.admin.wallet?.toLowerCase();
  const canManageGlobally = Boolean(
    connectedWallet && globalRoundAdminWallets.includes(connectedWallet),
  );
  const canManageRound = Boolean(
    connectedWallet && roundAdminWallet && connectedWallet === roundAdminWallet,
  ) || canManageGlobally;
  const canOpenAdminControls = isConnected && (canManageRound || canManageGlobally);

  return (
    <>
      <Helmet>
        <title>{round.name} | Lil Nouns Rounds</title>
        <meta name="description" content={round.summary} />
        <link rel="canonical" href={`https://www.lilnouns.wtf/rounds/${round.handle}`} />
      </Helmet>

      <div className="flex w-full max-w-[1180px] flex-col gap-8 p-6 pb-24 md:p-10 md:pb-24">
        <div className="flex items-center justify-between gap-4">
          <Link
            to="/rounds"
            className="flex w-fit items-center gap-2 text-content-secondary label-md transition-colors hover:text-content-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            Rounds
          </Link>

          {canOpenAdminControls && (
            <Button
              variant="secondary"
              className="px-4 py-2"
              onClick={() => setIsAdminOpen(true)}
            >
              <Settings className="mr-2 h-4 w-4" />
              Admin
            </Button>
          )}
        </div>

        <section className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="overflow-hidden rounded-[16px] border bg-white">
            <img src={round.image} alt={round.name} className="h-[280px] w-full object-cover" />
            <div className="flex flex-col gap-5 p-6">
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full bg-background-secondary px-3 py-1 label-sm">
                  {state}
                </span>
                <span className="text-content-secondary label-sm">{round.funds} available</span>
              </div>
              <div className="flex flex-col gap-3">
                <h1 className="heading-2">{round.name}</h1>
                <p className="text-content-secondary paragraph-lg">{round.description}</p>
              </div>
              <RoundLinks round={round} />
              <RoundTimeline round={round} />
            </div>
          </div>

          <aside className="flex flex-col gap-4">
            <div className="rounded-[16px] border bg-white p-5">
              <h2 className="heading-6 mb-4">Awards</h2>
              <div className="flex flex-col gap-3">
                {round.awards.map((award) => (
                  <div key={award.place} className="flex items-center justify-between gap-4">
                    <div>
                      <p className="label-md">{award.label}</p>
                      <p className="text-content-secondary paragraph-sm">
                        Place {award.place}
                      </p>
                    </div>
                    <p className="label-md">{award.amount}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[16px] border bg-white p-5">
              <h2 className="heading-6 mb-4">Admin</h2>
              <div className="flex items-center gap-3">
                <img
                  src={round.admin.image}
                  alt={round.admin.name}
                  className="h-10 w-10 rounded-full object-cover"
                />
                <div className="min-w-0">
                  <p className="truncate label-md">{round.admin.name}</p>
                  <p className="text-content-secondary paragraph-sm">
                    {round.admin.role} / @{round.admin.handle}
                  </p>
                </div>
              </div>
            </div>

            <OnchainRoundCard round={round} />

            <div className="rounded-[16px] border bg-white p-5">
              <h2 className="heading-6 mb-4">Community</h2>
              <div className="flex items-center gap-3">
                <img
                  src={round.community.image}
                  alt={round.community.name}
                  className="h-10 w-10 rounded-full object-cover"
                />
                <div>
                  <p className="label-md">{round.community.name}</p>
                  <p className="text-content-secondary paragraph-sm">
                    {round.participants} participants
                  </p>
                </div>
              </div>
            </div>

          </aside>
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="heading-5">Proposals</h2>
            <span className="text-content-secondary label-sm">
              {sortedProposals.length} submitted
            </span>
          </div>

          {sortedProposals.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {sortedProposals.map((proposal) => (
                <article
                  key={proposal.id}
                  className="overflow-hidden rounded-[16px] border bg-white"
                >
                  {proposal.image && (
                    <img
                      src={proposal.image}
                      alt={proposal.title}
                      className="h-36 w-full object-cover"
                      loading="lazy"
                    />
                  )}
                  <div className="flex flex-col gap-3 p-5">
                    <div className="flex items-start justify-between gap-4">
                      <h3 className="heading-6">{proposal.title}</h3>
                      <span className="rounded-full bg-background-secondary px-3 py-1 label-sm">
                        {proposal.votes} votes
                      </span>
                    </div>
                    <p className="text-content-secondary paragraph-sm">{proposal.summary}</p>
                    <p className="text-content-secondary label-sm">By {proposal.proposer}</p>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-[16px] border bg-white p-8 text-center text-content-secondary">
              No proposals have been submitted yet.
            </div>
          )}
        </section>
      </div>

      <AdminControlsModal
        isOpen={isAdminOpen}
        onOpenChange={setIsAdminOpen}
        canManageRound={canManageRound}
        canManageGlobally={canManageGlobally}
      />
    </>
  );
}

export default function RoundsPage() {
  const { round } = useParams();
  const [createdRounds, setCreatedRounds] = useState<Round[]>(loadCreatedRounds);
  const rounds = useMemo(() => [...createdRounds, ...lilRounds], [createdRounds]);

  useEffect(() => {
    try {
      window.localStorage.setItem(createdRoundsStorageKey, JSON.stringify(createdRounds));
    } catch (error) {
      console.error("Failed to persist created rounds", error);
    }
  }, [createdRounds]);

  function handleCreateRound(input: CreateRoundInput) {
    setCreatedRounds((currentRounds) => [
      createRoundFromInput(input, [...currentRounds, ...lilRounds]),
      ...currentRounds,
    ]);
  }

  if (round) return <RoundDetail handle={round} rounds={rounds} />;
  return <RoundsIndex rounds={rounds} onCreateRound={handleCreateRound} />;
}

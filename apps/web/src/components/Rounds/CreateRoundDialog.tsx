import { FormEvent, useMemo, useState } from "react";
import { isAddress } from "viem";
import { Plus, Trash2 } from "lucide-react";
import {
  DrawerDialog,
  DrawerDialogContent,
  DrawerDialogContentInner,
  DrawerDialogTitle,
} from "@/components/ui/DrawerDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  LIL_NOUNS_TOKEN_ADDRESS,
  LIL_NOUNS_TREASURY_ADDRESS,
} from "@/data/rounds/onchain";
import {
  CreateRoundInput,
  RoundEligibilityType,
  RoundPrizeTokenType,
  RoundWinnerPayout,
} from "@/data/rounds/types";

interface CreateRoundDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateRound: (round: CreateRoundInput) => void;
}

const defaultImage = "/get-funded.gif";
const defaultAdminImage = "/lilnoggles.png";
const flatFeeLabel = "0.01 ETH";

function dateValue(offsetDays: number) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function toIsoDate(date: string) {
  const parsed = new Date(`${date}T17:00:00`);
  return parsed.toISOString();
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="label-sm text-content-secondary">{label}</span>
      {children}
    </label>
  );
}

function SegmentButton({
  isActive,
  children,
  onClick,
}: {
  isActive: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[10px] px-3 py-2 label-sm transition-colors ${
        isActive
          ? "bg-content-primary text-white"
          : "bg-background-secondary text-content-secondary hover:text-content-primary"
      }`}
    >
      {children}
    </button>
  );
}

const emptyWinner = (): RoundWinnerPayout => ({ wallet: "", amount: "" });

export default function CreateRoundDialog({
  isOpen,
  onClose,
  onCreateRound,
}: CreateRoundDialogProps) {
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [funds, setFunds] = useState("");
  const [image, setImage] = useState(defaultImage);
  const [adminName, setAdminName] = useState("");
  const [adminHandle, setAdminHandle] = useState("");
  const [adminWallet, setAdminWallet] = useState("");
  const [sourceOfFunds, setSourceOfFunds] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [rubric, setRubric] = useState("");
  const [start, setStart] = useState(dateValue(1));
  const [votingStart, setVotingStart] = useState(dateValue(7));
  const [end, setEnd] = useState(dateValue(14));
  const [prizeTokenType, setPrizeTokenType] = useState<RoundPrizeTokenType>("ETH");
  const [prizeTokenAddress, setPrizeTokenAddress] = useState("");
  const [eligibilityType, setEligibilityType] = useState<RoundEligibilityType>("LilNouns");
  const [eligibilityTokenAddress, setEligibilityTokenAddress] = useState("");
  const [useVotePower, setUseVotePower] = useState(true);
  const [winnerPayouts, setWinnerPayouts] = useState<RoundWinnerPayout[]>([emptyWinner()]);
  const [error, setError] = useState("");

  const resolvedEligibilityToken =
    eligibilityType === "LilNouns"
      ? LIL_NOUNS_TOKEN_ADDRESS
      : eligibilityTokenAddress.trim();

  const validWinners = winnerPayouts.filter(
    (winner) => winner.wallet.trim() || winner.amount.trim(),
  );

  const hasValidWinnerPayouts =
    validWinners.length >= 1 &&
    validWinners.length <= 20 &&
    validWinners.every(
      (winner) => isAddress(winner.wallet.trim()) && winner.amount.trim(),
    );

  const canSubmit = useMemo(
    () =>
      Boolean(
        name.trim() &&
          summary.trim() &&
          description.trim() &&
          funds.trim() &&
          adminName.trim() &&
          adminHandle.trim() &&
          adminWallet.trim() &&
          sourceOfFunds.trim() &&
          isAddress(adminWallet.trim()) &&
          resolvedEligibilityToken &&
          isAddress(resolvedEligibilityToken) &&
          (prizeTokenType === "ETH" || isAddress(prizeTokenAddress.trim())) &&
          hasValidWinnerPayouts,
      ),
    [
      adminHandle,
      adminName,
      adminWallet,
      description,
      funds,
      hasValidWinnerPayouts,
      name,
      prizeTokenAddress,
      prizeTokenType,
      resolvedEligibilityToken,
      sourceOfFunds,
      summary,
    ],
  );

  function resetForm() {
    setName("");
    setSummary("");
    setDescription("");
    setFunds("");
    setImage(defaultImage);
    setAdminName("");
    setAdminHandle("");
    setAdminWallet("");
    setSourceOfFunds("");
    setAnnouncement("");
    setRubric("");
    setStart(dateValue(1));
    setVotingStart(dateValue(7));
    setEnd(dateValue(14));
    setPrizeTokenType("ETH");
    setPrizeTokenAddress("");
    setEligibilityType("LilNouns");
    setEligibilityTokenAddress("");
    setUseVotePower(true);
    setWinnerPayouts([emptyWinner()]);
    setError("");
  }

  function updateWinner(index: number, field: keyof RoundWinnerPayout, value: string) {
    setWinnerPayouts((current) =>
      current.map((winner, winnerIndex) =>
        winnerIndex === index ? { ...winner, [field]: value } : winner,
      ),
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const startTime = new Date(start).getTime();
    const votingTime = new Date(votingStart).getTime();
    const endTime = new Date(end).getTime();

    if (!canSubmit) {
      setError("Add valid round details, admin wallet, eligibility token, and 1-20 winner payouts.");
      return;
    }

    if (!(startTime < votingTime && votingTime < endTime)) {
      setError("Timeline must be ordered: start, voting start, then end.");
      return;
    }

    const normalizedWinners = validWinners.map((winner) => ({
      wallet: winner.wallet.trim(),
      amount: winner.amount.trim(),
    }));

    onCreateRound({
      name: name.trim(),
      summary: summary.trim(),
      description: description.trim(),
      funds: funds.trim(),
      image: image.trim() || defaultImage,
      start: toIsoDate(start),
      votingStart: toIsoDate(votingStart),
      end: toIsoDate(end),
      admin: {
        name: adminName.trim(),
        handle: adminHandle.trim().replace(/^@/, ""),
        image: defaultAdminImage,
        role: "Round admin",
        wallet: adminWallet.trim(),
      },
      links: [
        {
          label: "Source of funds",
          href: sourceOfFunds.trim(),
          description: "Where this round's funding comes from",
        },
        ...(announcement.trim()
          ? [
              {
                label: "Announcement",
                href: announcement.trim(),
                description: "Launch post and participation details",
              },
            ]
          : []),
        ...(rubric.trim()
          ? [
              {
                label: "Review rubric",
                href: rubric.trim(),
                description: "Criteria admins use to review submissions",
              },
            ]
          : []),
      ],
      awards: normalizedWinners.map((winner, index) => ({
        place: index + 1,
        label: index === 0 ? "Top grant" : `Winner ${index + 1}`,
        amount: winner.amount,
      })),
      onchain: {
        chainId: 1,
        prizeTokenType,
        prizeTokenAddress:
          prizeTokenType === "ERC20" ? prizeTokenAddress.trim() : undefined,
        feeAmount: flatFeeLabel,
        feeRecipient: LIL_NOUNS_TREASURY_ADDRESS,
        eligibilityType,
        eligibilityTokenAddress: resolvedEligibilityToken,
        useVotePower,
        winnerPayouts: normalizedWinners,
      },
    });

    resetForm();
    onClose();
  }

  return (
    <DrawerDialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DrawerDialogContent className="md:max-w-[920px]">
        <DrawerDialogTitle className="sr-only">Create round</DrawerDialogTitle>
        <DrawerDialogContentInner className="items-stretch gap-6">
          <div className="flex flex-col gap-2">
            <h2 className="heading-4">Create a round</h2>
            <p className="max-w-[720px] text-content-secondary paragraph-md">
              Create a mainnet round, lock prizes into its contract, assign a round admin,
              and set winner payouts before voting starts.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Round name">
                <Input value={name} onChange={(event) => setName(event.target.value)} />
              </Field>
              <Field label="Funds available">
                <Input
                  value={funds}
                  onChange={(event) => setFunds(event.target.value)}
                  placeholder="5 ETH"
                />
              </Field>
              <Field label="Summary">
                <Input value={summary} onChange={(event) => setSummary(event.target.value)} />
              </Field>
              <Field label="Cover image path or URL">
                <Input value={image} onChange={(event) => setImage(event.target.value)} />
              </Field>
              <div className="md:col-span-2">
                <Field label="Description">
                  <Textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    className="min-h-[104px] rounded-xl border-2 border-border-primary text-base"
                  />
                </Field>
              </div>
            </div>

            <div className="grid gap-4 rounded-[16px] border bg-background-ternary p-4 md:grid-cols-3">
              <Field label="Round starts">
                <Input type="date" value={start} onChange={(event) => setStart(event.target.value)} />
              </Field>
              <Field label="Voting starts">
                <Input
                  type="date"
                  value={votingStart}
                  onChange={(event) => setVotingStart(event.target.value)}
                />
              </Field>
              <Field label="Round ends">
                <Input type="date" value={end} onChange={(event) => setEnd(event.target.value)} />
              </Field>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Admin name">
                <Input value={adminName} onChange={(event) => setAdminName(event.target.value)} />
              </Field>
              <Field label="Admin handle">
                <Input
                  value={adminHandle}
                  onChange={(event) => setAdminHandle(event.target.value)}
                  placeholder="@round-admin"
                />
              </Field>
              <Field label="Admin wallet">
                <Input
                  value={adminWallet}
                  onChange={(event) => setAdminWallet(event.target.value)}
                  placeholder="0x..."
                />
              </Field>
            </div>

            <div className="grid gap-4 rounded-[16px] border bg-white p-4 md:grid-cols-2">
              <div className="flex flex-col gap-3">
                <span className="label-sm text-content-secondary">Prize token</span>
                <div className="flex gap-2">
                  <SegmentButton isActive={prizeTokenType === "ETH"} onClick={() => setPrizeTokenType("ETH")}>
                    ETH
                  </SegmentButton>
                  <SegmentButton isActive={prizeTokenType === "ERC20"} onClick={() => setPrizeTokenType("ERC20")}>
                    ERC-20
                  </SegmentButton>
                </div>
                {prizeTokenType === "ERC20" && (
                  <Input
                    value={prizeTokenAddress}
                    onChange={(event) => setPrizeTokenAddress(event.target.value)}
                    placeholder="ERC-20 token address"
                  />
                )}
              </div>
              <div className="rounded-[12px] bg-background-ternary p-4">
                <p className="label-md">Lil Nouns fee</p>
                <p className="mt-1 text-content-secondary paragraph-sm">
                  {flatFeeLabel} per round, paid to the Lil Nouns treasury on creation.
                </p>
              </div>
            </div>

            <div className="grid gap-4 rounded-[16px] border bg-white p-4 md:grid-cols-2">
              <div className="flex flex-col gap-3">
                <span className="label-sm text-content-secondary">Voting eligibility</span>
                <div className="flex flex-wrap gap-2">
                  <SegmentButton
                    isActive={eligibilityType === "LilNouns"}
                    onClick={() => setEligibilityType("LilNouns")}
                  >
                    Lil Nouns
                  </SegmentButton>
                  <SegmentButton
                    isActive={eligibilityType === "CustomERC721"}
                    onClick={() => setEligibilityType("CustomERC721")}
                  >
                    Custom NFT
                  </SegmentButton>
                </div>
                {eligibilityType === "CustomERC721" && (
                  <Input
                    value={eligibilityTokenAddress}
                    onChange={(event) => setEligibilityTokenAddress(event.target.value)}
                    placeholder="ERC-721 collection address"
                  />
                )}
              </div>
              <div className="flex flex-col gap-3">
                <span className="label-sm text-content-secondary">Voting power check</span>
                <div className="flex flex-wrap gap-2">
                  <SegmentButton isActive={useVotePower} onClick={() => setUseVotePower(true)}>
                    Holders + delegates
                  </SegmentButton>
                  <SegmentButton isActive={!useVotePower} onClick={() => setUseVotePower(false)}>
                    Holders only
                  </SegmentButton>
                </div>
                <p className="text-content-secondary paragraph-sm">
                  Offchain vote results are submitted as onchain receipts; each eligible wallet can submit once.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 rounded-[16px] border bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="heading-6">Winner payouts</h3>
                  <p className="text-content-secondary paragraph-sm">
                    Add 1-20 winner wallets. Admins can edit payouts until the final onchain distribution transaction.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={winnerPayouts.length >= 20}
                  onClick={() => setWinnerPayouts((current) => [...current, emptyWinner()])}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add
                </Button>
              </div>
              <div className="grid gap-3">
                {winnerPayouts.map((winner, index) => (
                  <div key={index} className="grid gap-3 md:grid-cols-[1fr_180px_auto]">
                    <Input
                      value={winner.wallet}
                      onChange={(event) => updateWinner(index, "wallet", event.target.value)}
                      placeholder="Winner wallet 0x..."
                    />
                    <Input
                      value={winner.amount}
                      onChange={(event) => updateWinner(index, "amount", event.target.value)}
                      placeholder="2.5 ETH"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={winnerPayouts.length === 1}
                      onClick={() =>
                        setWinnerPayouts((current) =>
                          current.filter((_, winnerIndex) => winnerIndex !== index),
                        )
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Source of funds link">
                <Input
                  value={sourceOfFunds}
                  onChange={(event) => setSourceOfFunds(event.target.value)}
                  placeholder="https://..."
                />
              </Field>
              <Field label="Announcement link optional">
                <Input
                  value={announcement}
                  onChange={(event) => setAnnouncement(event.target.value)}
                  placeholder="https://..."
                />
              </Field>
              <Field label="Review rubric link optional">
                <Input
                  value={rubric}
                  onChange={(event) => setRubric(event.target.value)}
                  placeholder="https://..."
                />
              </Field>
            </div>

            {error && (
              <p className="rounded-xl bg-semantic-negative/10 p-3 text-semantic-negative label-sm">
                {error}
              </p>
            )}

            <div className="flex flex-col-reverse gap-3 border-t pt-5 md:flex-row md:justify-end">
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={!canSubmit}>
                <Plus className="mr-2 h-4 w-4" />
                Create Round
              </Button>
            </div>
          </form>
        </DrawerDialogContentInner>
      </DrawerDialogContent>
    </DrawerDialog>
  );
}

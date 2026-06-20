"use client";
import AutoresizingTextArea from "@/components/AutoresizingTextarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Form, FormControl, FormField, FormItem } from "@/components/ui/form";
import clsx from "clsx";
import { useCandidateFeedbackContext } from "./TopicFeedbackProvider";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { useTopicFeedback } from "@/hooks/data-contract/useTopicFeedback";
import TransactionButton from "@/components/TransactionButton";
import { FeedbackPost, ProposalIdea } from "@/data/goldsky/governance/ideaTypes";
import { TransactionState } from "@/hooks/transactions/types";
import { EnsAvatar } from "../EnsAvatar";
import { EnsName } from "../EnsName";
import { getAddress } from "viem";
import { X } from "lucide-react";
import { HTMLAttributes, useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { useReadContract } from "wagmi";
import { nounsNftTokenConfig } from "@/data/generated/wagmi";
import { CHAIN_CONFIG } from "@/config";
import { useScreenSize } from "@/hooks/useScreenSize";
import { extractSlugFromTopicId } from "@/data/goldsky/governance/getTopics";

const formSchema = z.object({
  reason: z.string().optional(),
  support: z.string().optional(), // Make support optional to allow commenting without voting
  replies: z.array(z.string().nonempty("Reply cannot be empty.")),
});

function encodeRevote(feedback: FeedbackPost): string {
  if (!feedback.reason) {
    return "";
  } else {
    return `\n\n+1\n\n${feedback.reason.replace(/^/gm, "> ")}\n\n`;
  }
}

function encodeReply(feedback: FeedbackPost, reply: string): string {
  // Use full address to allow deterministic linking in the subgraph
  return `\n\n@${feedback.voterAddress}\n\n${reply}\n${(feedback.reason ?? "").replace(/^/gm, "> ")}\n\n`;
}

export function CandidateFeedbackForm({ candidate, onSuccess }: { candidate: ProposalIdea; onSuccess?: () => void }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      reason: "",
      support: "",
      replies: [],
    },
  });

  const { replies: replyFeedbacks, revotes } = useCandidateFeedbackContext();
  const {
    sendFeedback,
    error,
    state,
  } = useTopicFeedback();
  const screenSize = useScreenSize();

  async function onSubmit({ support, reason, replies }: z.infer<typeof formSchema>) {
    const encodedRevotes = revotes.map(encodeRevote).join("\n");
    const encodedReplies = replyFeedbacks
      .map((feedback, i) => encodeReply(feedback, replies[i]))
      .join("\n");

    const encodedReason = encodedRevotes + encodedReplies + (reason || "");
    const slug = extractSlugFromTopicId(candidate.id);
    // Default to abstain (2) if no support selected or "comment" - allows commenting without voting
    const supportNum = support === "for" ? 1 : support === "against" ? 0 : 2;
    
    await sendFeedback(candidate.proposerAddress, slug, supportNum, encodedReason);
    onSuccess?.();
  }

  useEffect(() => {
    const shouldOpen =
      (replyFeedbacks.length > 0 || revotes.length > 0) && screenSize === "sm";
    if (shouldOpen) {
      setDrawerOpen(true);
    }
  }, [revotes, replyFeedbacks, screenSize]);

  return (
    <>
      {/* Desktop */}
      <div className="sticky bottom-0 z-10 hidden w-full max-w-[780px] flex-col items-center gap-2 rounded-t-[20px] bg-background-primary pb-8 lg:flex">
        <CandidateFeedbackFormInner
          candidate={candidate}
          form={form}
          onSubmit={onSubmit}
          txnState={state}
          txnErrorMsg={error?.message}
          onSuccess={onSuccess}
        />
        <FeedbackAs />
      </div>

      {/* Mobile */}
      <div className="sticky bottom-[84px] z-[2] flex items-center justify-center lg:hidden pwa:bottom-[104px]">
        <Drawer
          repositionInputs={false}
          modal={false}
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
        >
          <DrawerTrigger asChild>
            <Button
              className="h-[48px] w-fit rounded-full"
              onClick={() => setDrawerOpen(true)}
            >
              Add Feedback
            </Button>
          </DrawerTrigger>
          <DrawerContent className="flex-col gap-6 p-6 shadow-fixed-bottom">
            <DrawerTitle className="heading-4">Add Feedback</DrawerTitle>
            <div className="flex flex-col gap-2">
              <CandidateFeedbackFormInner
                candidate={candidate}
                form={form}
                onSubmit={onSubmit}
                txnState={state}
                txnErrorMsg={error?.message}
                onSuccess={onSuccess}
              />
              <FeedbackAs />
            </div>
          </DrawerContent>
        </Drawer>
      </div>
    </>
  );
}

function FeedbackAs() {
  const { address } = useAccount();
  const { data: voteWeight } = useReadContract({
    address: CHAIN_CONFIG.addresses.nounsToken,
    abi: nounsNftTokenConfig.abi,
    functionName: "getCurrentVotes",
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
    },
  });

  return (
    <div className="flex w-full items-center justify-center gap-1 px-4 text-content-secondary paragraph-sm">
      {address ? (
        <>
          Feedback as <EnsName address={address} />
        </>
      ) : (
        "Connect wallet to add feedback"
      )}
    </div>
  );
}

function CandidateFeedbackFormInner({
  candidate,
  form,
  onSubmit,
  txnState,
  txnErrorMsg,
  onSuccess,
}: {
  candidate: ProposalIdea;
  form: ReturnType<typeof useForm<z.infer<typeof formSchema>>>;
  onSubmit: (params: z.infer<typeof formSchema>) => void;
  txnState: TransactionState;
  txnErrorMsg?: string;
  onSuccess?: () => void;
}) {
  const {
    replies,
    revotes,
    removeRevote,
    removeReply,
    clearReplies,
    clearRevotes,
  } = useCandidateFeedbackContext();

  function handleRemoveReply(
    reply: NonNullable<(typeof replies)[0]>,
    index: number,
  ) {
    removeReply(reply);

    // Update form state to match the new replies array
    const currentReplies = form.getValues("replies");
    currentReplies.splice(index, 1);
    form.setValue("replies", currentReplies);
    form.trigger("replies");
  }

  // Add entry to replies array and trigger validation
  useEffect(() => {
    const currentReplies = form.getValues("replies");

    if (replies.length > currentReplies.length) {
      const newReplies = replies.slice(currentReplies.length).map(() => "");
      form.setValue("replies", [...currentReplies, ...newReplies]);
    }
    form.trigger("replies");
  }, [replies, form]);

  const { address } = useAccount();
  const { data: voteWeight } = useReadContract({
    address: CHAIN_CONFIG.addresses.nounsToken,
    abi: nounsNftTokenConfig.abi,
    functionName: "getCurrentVotes",
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
    },
  });

  // Disable during submission
  const disabled = useMemo(() => {
    return txnState === "pending-signature" || txnState === "pending-txn";
  }, [txnState]);

  // Reset things on success
  useEffect(() => {
    if (txnState == "success") {
      clearReplies();
      clearRevotes();
      form.reset({
        reason: "",
        support: "",
        replies: [],
      });
      onSuccess?.();
    }
  }, [txnState, clearReplies, clearRevotes, form, onSuccess]);

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className={clsx(
          "flex w-full flex-col overflow-hidden rounded-[20px] bg-background-secondary ring-border-primary focus-within:ring-2",
          disabled && "pointer-events-none opacity-50",
        )}
      >
        <fieldset disabled={disabled} style={{ all: "unset" }}>
          <div className="flex w-full flex-col gap-2">
            <div className="flex max-h-[30dvh] w-full flex-col gap-2 overflow-y-auto overflow-x-hidden px-4 pt-4">
              {revotes.map((revote, i) => (
                <RevoteCard
                  revote={revote}
                  key={i}
                  onClick={() => removeRevote(revote)}
                />
              ))}

              {replies.map((reply, i) => (
                <div className="flex min-w-0 flex-col" key={i}>
                  <RevoteCard
                    revote={reply}
                    key={i}
                    onClick={() => handleRemoveReply(reply, i)}
                  />
                  <div className="flex gap-2">
                    <div className="relative w-[20px] shrink-0">
                      <div className="absolute right-0 top-0 h-[19px] w-[7px] rounded-bl-[12px] border-b border-l" />
                    </div>
                    <FormField
                      key={i}
                      control={form.control}
                      name={`replies.${i}`}
                      render={({ field }) => (
                        <FormItem className="w-full">
                          <FormControl>
                            <div className="relative">
                              <AutoresizingTextArea
                                placeholder={`Reply...`}
                                className="pt-2"
                                {...field}
                              />
                            </div>
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              ))}
              <FormField
                control={form.control}
                name="reason"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <AutoresizingTextArea
                        placeholder="I believe that .... (optional)"
                        {...field}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <div className="flex flex-col items-end gap-1 px-4 pb-4">
              <div className="flex items-center justify-end gap-4">
                <FormField
                  control={form.control}
                  name="support"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value ?? undefined}
                        >
                          <SelectTrigger
                            className={clsx(
                              "h-8 w-[150px] rounded-full border",
                              {
                                "border-semantic-positive bg-semantic-positive fill-white text-white":
                                  field.value == "for",
                                "border-semantic-negative bg-semantic-negative fill-white text-white":
                                  field.value == "against",
                              },
                            )}
                          >
                            <SelectValue placeholder="Comment only" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={"comment"}>
                              Comment only
                            </SelectItem>
                            <SelectItem value={"for"}>
                              For
                              {address &&
                                voteWeight != undefined &&
                                ` (${voteWeight})`}
                            </SelectItem>
                            <SelectItem value={"against"}>
                              Against
                              {address &&
                                voteWeight != undefined &&
                                ` (${voteWeight})`}
                            </SelectItem>
                            <SelectItem value={"abstain"}>
                              Abstain
                              {address &&
                                voteWeight != undefined &&
                                ` (${voteWeight})`}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </FormControl>
                    </FormItem>
                  )}
                />
                <TransactionButton
                  type="submit"
                  className="h-8 w-fit rounded-full px-5 py-1.5"
                  disabled={!form.formState.isValid || (!form.watch("reason")?.trim() && (!form.watch("support") || form.watch("support") === "comment"))}
                  txnState={txnState}
                >
                  {form.watch("support") && form.watch("support") !== "comment" ? "Submit" : "Comment"}
                </TransactionButton>
              </div>

              {txnErrorMsg && (
                <div className="max-h-[50px] w-full overflow-y-auto text-center text-semantic-negative paragraph-sm">
                  {txnErrorMsg}
                </div>
              )}
            </div>
          </div>
        </fieldset>
      </form>
    </Form>
  );
}

function RevoteCard({
  revote,
  ...props
}: { revote: FeedbackPost } & HTMLAttributes<HTMLButtonElement>) {
  const getSupportLabel = () => {
    switch (revote.support) {
      case 0: return "Against";
      case 1: return "For";
      case 2: return "Comment";
      default: return "";
    }
  };

  return (
    <button
      className="flex w-full items-center justify-between gap-1 rounded-[12px] bg-background-primary px-3 py-2 transition-colors label-sm hover:bg-background-primary/70"
      {...props}
    >
      <div className="flex items-center gap-2">
        <EnsAvatar address={getAddress(revote.voterAddress)} size={24} />
        <div className="flex flex-col items-start">
          <EnsName address={getAddress(revote.voterAddress)} className="label-sm" />
          <span className="text-content-secondary paragraph-xs">
            {getSupportLabel()} ({revote.votes} votes)
          </span>
        </div>
      </div>
      <X size={16} className="stroke-content-secondary" />
    </button>
  );
}


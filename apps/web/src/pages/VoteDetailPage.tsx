import { Helmet } from 'react-helmet-async'
import { useParams, Link, useLocation } from 'react-router-dom'
import { useMemo } from 'react'
import { getProposal } from '@/data/goldsky/governance/getProposalVersioned'
import { DetailedProposal, ProposalVote } from '@/data/goldsky/governance/common'
import { isSepoliaNetwork } from '@/utils/networkDetection'
import { getProposalOverviews } from '@/data/goldsky/governance/getProposalOverviews'
import { getSnapshotProposals, matchSnapshotProposal, getSnapshotVotes } from '@/data/snapshot/getSnapshotProposals'
import { useQuery } from '@tanstack/react-query'
import { CreateVote } from '@/components/Proposal/CreateVote'
import CreateVoteProvider from '@/components/Proposal/CreateVote/CreateVoteProvider'
import { ProposalStateBadge } from '@/components/Proposal/ProposalStateBadge'
import { MetagovStatusBadge } from '@/components/Proposal/MetagovStatusBadge'
import VotingSummary from '@/components/Proposal/VotingSummary'
import FilteredSortedProposalVotes, { VOTE_SORT_ITEMS } from '@/components/Proposal/FilteredSortedProposalVotes'
import ProposalTransactionSummary from '@/components/Proposal/ProposalTransactionSummary'
import {
  SidebarMainContent,
  SidebarProvider,
  SidebarSideContent,
} from '@/components/Sidebar/ProposalSidebar'
import MarkdownRenderer from '@/components/MarkdownRenderer'
import LoadingSpinner from '@/components/LoadingSpinner'
import SearchProvider, { SearchInput } from '@/components/Search'
import SortProvider, { SortSelect } from '@/components/Sort'
import FilterProvider, { FilterSelect } from '@/components/Filter'
import { TooltipPopover } from '@/components/ui/tooltipPopover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ChevronRight } from 'lucide-react'
import { IdentityExplorerLink } from '@/components/IdentityExplorerLink'
import { formatTimeLeft } from '@/utils/format'
import Icon from '@/components/ui/Icon'
import {
  SubnavTabs,
  SubnavTabsContent,
  SubnavTabsList,
  SubnavTabsTrigger,
} from '@/components/SubnavTab'
import { ResponsiveContent } from '@/components/ResponsiveContet'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import LoadingSkeletons from '@/components/LoadingSkeletons'
import { SnapshotVoteForm } from '@/components/Proposal/SnapshotVoteForm'
import { SnapshotVotes } from '@/components/Proposal/SnapshotVotes'
import snapshot from '@snapshot-labs/snapshot.js'
import { useAccount, useWalletClient } from 'wagmi'
import { EnsAvatar } from "@/components/EnsAvatar";
import { EnsName } from "@/components/EnsName";
import clsx from "clsx";
import { getAddress } from "viem";
import { LinkExternal } from "@/components/ui/link";
import { CHAIN_CONFIG } from "@/config";
import { getDelegates, Delegate } from '@/data/snapshot/getDelegates'
import { SnapshotVote as SnapshotVoteType } from '@/data/snapshot/getSnapshotProposals'
import { useFilterContext } from '@/components/Filter'
import { Pencil, RefreshCw, History } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useProposalVersions } from '@/hooks/useProposalVersions'
import { ProposalVersionHistoryModal } from '@/components/Proposal/ProposalVersionHistoryModal'
import { getCandidateForProposal } from '@/data/goldsky/governance/getCandidateForProposal'
import { isDaoVersion5 } from '@/utils/daoVersion'

// Helper function to parse vote direction from reason text
function parseVoteDirection(reason: string | null): number {
  if (!reason) return 1 // Default to FOR if no reason
  const reasonLower = reason.toLowerCase()
  if (reasonLower.includes('abstain') || reasonLower.includes('abstains')) return 2
  if (reasonLower.includes('against') || reasonLower.includes('shut it down')) return 0
  return 1 // Default to FOR for positive/neutral reasons
}

// Helper function to extract voter address from vote ID
function extractVoterAddress(voteId: string): string {
  return voteId.split('-')[0] as `0x${string}`
}

const VOTE_FILTER_ITEMS: { name: string; value: string }[] = [
  { name: "All votes", value: "all" },
  { name: "Nouns DAO", value: "nouns" },
  { name: "Lil Nouns", value: "lilnouns" },
];

export default function VoteDetailPage() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const isNounsDaoProposal = location.pathname.includes('/vote/nouns/')

  if (!id) {
    return (
      <div className="flex w-full max-w-4xl flex-col items-center justify-center p-20">
        <h1 className="heading-2 mb-4">Invalid Proposal ID</h1>
      </div>
    )
  }

  const proposalId = parseInt(id)

  if (isNaN(proposalId)) {
    return (
      <div className="flex w-full max-w-4xl flex-col items-center justify-center p-20">
        <h1 className="heading-2 mb-4">Invalid Proposal ID</h1>
      </div>
    )
  }

  const daoName = isNounsDaoProposal ? "Nouns DAO" : "Lil Nouns DAO";
  const canonicalUrl = isNounsDaoProposal 
    ? `https://www.lilnouns.wtf/vote/nouns/${proposalId}`
    : `https://www.lilnouns.wtf/vote/${proposalId}`;

  return (
    <CreateVoteProvider>
      <SearchProvider>
        <SortProvider defaultSortValue="recent">
          <FilterProvider defaultFilterValue="all">
          <>
            <Helmet>
              <title>{`Proposal ${proposalId} | ${daoName}`}</title>
              <meta name="description" content={`Vote on Proposal ${proposalId} in ${daoName} governance.`} />
              <link rel="canonical" href={canonicalUrl} />

              {/* OpenGraph */}
              <meta property="og:title" content={`Proposal ${proposalId} | ${daoName}`} />
              <meta property="og:description" content={`Vote on Proposal ${proposalId} in ${daoName} governance.`} />
              <meta property="og:url" content={canonicalUrl} />
            </Helmet>

            {/* Desktop */}
            <div className="hidden w-full lg:block">
              <SidebarProvider>
                <SidebarMainContent>
                  <div className="flex w-full max-w-[780px] flex-col gap-8 p-6 pb-24 md:p-10 md:pb-24">
                    <div className="flex w-full flex-col gap-8 md:px-4">
                      {/* Breadcrumb */}
                      <div className="flex items-center gap-2 paragraph-sm">
                        <Link to="/vote">Proposals</Link>
                        <ChevronRight size={16} className="stroke-content-secondary" />
                        <span className="text-content-secondary">{daoName} Proposal {proposalId}</span>
                      </div>

                      <ProposalTopWrapper proposalId={proposalId} isNounsDao={isNounsDaoProposal} />
                      <ProposalMarkdownWrapper proposalId={proposalId} isNounsDao={isNounsDaoProposal} />
                    </div>

                    <ResponsiveContent screenSizes={["lg"]}>
                      {isNounsDaoProposal ? (
                        <SnapshotVoteWrapper proposalId={proposalId} />
                      ) : (
                        <CreateVoteWrapper proposalId={proposalId} />
                      )}
                    </ResponsiveContent>
                  </div>
                </SidebarMainContent>

                <SidebarSideContent className="flex flex-col gap-8 p-6 pb-24 pt-10 scrollbar-thin">
                  <div className="flex flex-col gap-4">
                    <h2 className="heading-6">Proposal votes</h2>
                    <VotingSummaryWrapper proposalId={proposalId} isNounsDao={isNounsDaoProposal} />
                  </div>

                  <div className="flex justify-between">
                    <div>
                      <h2 className="heading-5">Activity</h2>
                      <LearnHowActivityWorksTooltipPopover />
                    </div>
                    <div className="flex flex-col gap-2">
                    <SortSelect items={VOTE_SORT_ITEMS} className="w-[160px]" />
                      {isNounsDaoProposal && <FilterSelect items={VOTE_FILTER_ITEMS} className="w-[160px]" />}
                    </div>
                  </div>

                  <SearchInput
                    placeholder="Search activity"
                    className="w-full bg-background-primary"
                  />

                  <div className="flex flex-col gap-6 pb-[48px]">
                    <VotesWrapper proposalId={proposalId} isNounsDao={isNounsDaoProposal} />
                  </div>
                </SidebarSideContent>
              </SidebarProvider>
            </div>

            {/* Mobile */}
            <div className="flex w-full max-w-[780px] flex-col gap-8 p-6 pb-24 md:p-10 md:pb-24 lg:hidden">
              <div className="flex items-center gap-2 paragraph-sm">
                <Link to="/vote">Proposals</Link>
                <ChevronRight size={16} className="stroke-content-secondary" />
                <span className="text-content-secondary">{daoName} Proposal {proposalId}</span>
              </div>

              <ProposalTopWrapper proposalId={proposalId} isNounsDao={isNounsDaoProposal} />

              <SubnavTabs defaultTab="proposal" className="w-full">
                <SubnavTabsList className="sticky top-[64px] z-[1]">
                  <SubnavTabsTrigger tab="proposal">Proposal</SubnavTabsTrigger>
                  <SubnavTabsTrigger tab="activity">Activity</SubnavTabsTrigger>
                </SubnavTabsList>
                <SubnavTabsContent tab="proposal">
                  <ProposalMarkdownWrapper proposalId={proposalId} isNounsDao={isNounsDaoProposal} />
                </SubnavTabsContent>
                <SubnavTabsContent tab="activity" className="flex flex-col gap-6">
                  <div className="flex flex-col gap-3">
                    <LearnHowActivityWorksTooltipPopover />
                    <SortSelect
                      items={VOTE_SORT_ITEMS}
                      className="h-[44px] w-full"
                    />
                    {isNounsDaoProposal && (
                      <FilterSelect
                        items={VOTE_FILTER_ITEMS}
                        className="h-[44px] w-full"
                      />
                    )}
                    <SearchInput
                      placeholder="Search activity"
                      className="w-full bg-background-primary"
                    />
                  </div>
                  <VotesWrapper proposalId={proposalId} isNounsDao={isNounsDaoProposal} />
                </SubnavTabsContent>
              </SubnavTabs>

              <ResponsiveContent screenSizes={["sm", "md"]}>
                {isNounsDaoProposal ? (
                  <SnapshotVoteWrapper proposalId={proposalId} />
                ) : (
                  <CreateVoteWrapper proposalId={proposalId} />
                )}
              </ResponsiveContent>
            </div>
          </>
        </FilterProvider>
        </SortProvider>
      </SearchProvider>
    </CreateVoteProvider>
  )
}

function SnapshotVoteWrapper({ proposalId }: { proposalId: number }) {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  
  // Fetch Nouns DAO proposal
  const { data: proposal } = useQuery({
    queryKey: ['proposal', proposalId.toString(), 'nouns'],
    queryFn: () => getProposal(proposalId.toString(), 'nouns'),
  });

  // Fetch Snapshot proposals
  const { data: snapshotProposals = [] } = useQuery({
    queryKey: ['snapshot-proposals'],
    queryFn: () => getSnapshotProposals('leagueoflils.eth'),
    staleTime: 5 * 60 * 1000,
  });

  const snapshotProposal = proposal
    ? matchSnapshotProposal(proposal, snapshotProposals)
    : undefined;

  // Fetch Snapshot votes to check if user has already voted
  const { data: snapshotVotes = [], isLoading: isLoadingSnapshotVotes, refetch: refetchVotes } = useQuery({
    queryKey: ['snapshot-votes', snapshotProposal?.id],
    queryFn: () => getSnapshotVotes(snapshotProposal!.id),
    enabled: !!snapshotProposal && !!address,
    staleTime: 30 * 1000, // Refresh every 30 seconds to catch new votes
  });

  // Check if connected address has already voted
  const hasVoted = address && snapshotVotes.some(
    vote => vote.voter.toLowerCase() === address.toLowerCase()
  );
  
  // Get user's vote if they've voted
  const userVote = address ? snapshotVotes.find(
    vote => vote.voter.toLowerCase() === address.toLowerCase()
  ) : undefined;

  const handleVote = async (choice: number, reason?: string) => {
    if (!snapshotProposal || !address || !walletClient) {
      throw new Error("Cannot vote: missing requirements");
    }

    const hub = 'https://hub.snapshot.org';
    const client = new snapshot.Client712(hub);

    // Convert wagmi walletClient to ethers signer format expected by Snapshot
    // Snapshot.js expects an object with _signTypedData method (ethers format)
    // We need to convert from ethers format to viem format
    const signer = {
      _signTypedData: async (domain: any, types: any, message: any) => {
        // Snapshot.js passes ethers-style types, but viem expects a different format
        // Extract primaryType from types (ethers format: { EIP712Domain: [...], Vote: [...] })
        const primaryType = Object.keys(types).find(key => key !== 'EIP712Domain') || 'Vote';
        
        // Convert ethers domain format to viem format
        const viemDomain = {
          name: domain.name,
          version: domain.version,
          chainId: domain.chainId ? BigInt(domain.chainId) : undefined,
          verifyingContract: domain.verifyingContract,
          salt: domain.salt,
        };

        // Use wagmi's signTypedData through walletClient
        const signature = await walletClient.signTypedData({
          account: address,
          domain: viemDomain,
          types: types as any,
          primaryType: primaryType,
          message: message as any,
        });
        return signature;
      },
      getAddress: async () => address,
    };

    const voteObject: any = {
      space: 'leagueoflils.eth',
      proposal: snapshotProposal.id,
      type: 'single-choice' as any,
      choice: choice,
      app: 'snapshot',
      ...(reason && { reason }),
    };

    await (client.vote as any)(signer, address, voteObject);
  };

  // Enhanced handleVote that refetches votes after successful vote
  const handleVoteWithRefresh = async (choice: number, reason?: string) => {
    await handleVote(choice, reason);
    // Refetch votes to update hasVoted status
    setTimeout(() => {
      refetchVotes();
    }, 2000); // Wait 2 seconds for Snapshot to index the vote
  };

  if (!snapshotProposal) {
    return null;
  }

  return (
    <>
      {/* Desktop - Form appears after proposal content, requires scrolling */}
      <div className="hidden w-full max-w-[780px] flex-col items-center gap-2 mt-8 lg:flex">
        <SnapshotVoteForm
          snapshotProposal={snapshotProposal}
          onVote={handleVoteWithRefresh}
          isLoading={isLoadingSnapshotVotes}
          hasVoted={hasVoted}
          userVote={userVote}
        />
      </div>

      {/* Mobile - Form appears after proposal content */}
      <div className="lg:hidden mt-8">
        <SnapshotVoteForm
          snapshotProposal={snapshotProposal}
          onVote={handleVoteWithRefresh}
          isLoading={isLoadingSnapshotVotes}
          hasVoted={hasVoted}
          userVote={userVote}
        />
      </div>
    </>
  );
}

function ProposalTopWrapper({ proposalId, isNounsDao }: { proposalId: number; isNounsDao: boolean }) {
  const isSepolia = isSepoliaNetwork()
  const { address } = useAccount()
  const navigate = useNavigate()
  const isVersion5 = isDaoVersion5()
  
  // Create dummy proposal data if it's a test proposal
  const createDummyProposal = (): DetailedProposal | null => {
    if (!isSepolia) return null
    
    // Check if this is a dummy proposal ID
    if (proposalId === 999999 || proposalId === 999998) {
      const now = Math.floor(Date.now() / 1000)
      const votingEndTimestamp = now + (7 * 24 * 60 * 60) // 7 days from now
      
      const isCandidate = proposalId === 999998
      
      const description = isCandidate 
        ? 'This is a test candidate proposal for Sepolia testing. Candidates can be updated and signed before being promoted to full proposals.'
        : `# Sunset Nouns 95

## TL;DR

Requesting 9.5 WETH as retro for Nouns 95 by Macrohard + Berry OS.

---

[![image](https://hackmd.io/_uploads/HyxBAxihxg.png "https://youtu.be/VdwEABkFIqE")](https://youtu.be/VdwEABkFIqE)

*Our commercial illustrated by Nadiecito.*

---

Nouns 95 is a meme and art project. It has facilitated 5 proposal creations, 1,900+ token votes, and 1 winning auction bid in the DAO, and allows Nouners to celebrate Noun O'CLock via the Crystal Ball.

It combines the functionality of a suite of Nouns tooling into a single browser tab - code as art, something beautiful yet useful.

Since Elon recently launched his own Macrohard company, it is becoming impossible to continue developing Nouns 95 under the Macrohard moniker. This is an opportunity to sunset the Macrohard Nouns 95 design and launch Berry OS.

---

## The OS Experience

Nouns 95 replicates the Windows 95 operating system's Windows functionality in Typescript using a Zustand-based singleton system. Users can open as many windows as they'd like, the system will manage their position, Z-index, and focus automatically. The Taskbar & Start Menu provide further utility for multi-App use.

Apps are written with Tyescript components using CSS modules. Apps can be nearly infintely complex in their functions, and contained simply within the windows system with 2 top-level CSS modules.

A single App Config file mediates between the two layers, making the addition of new Programs simple.

## Berry OS

[Berry OS](https://berryos.wtf) takes the core learnings of Nouns 95 and refines its design for a more robust and stable architecture for a more authentic OS emulator experience with user customization features.

The OS is mobile friendly, works as a Forecaster Miniapp, and soon as an Android APK, all in one codebase.

![ezgif.com-optimize](https://hackmd.io/_uploads/rk0dYsB0lx.gif)

---

![ezgif.com-optimize-2](https://hackmd.io/_uploads/SJesjsSRel.gif)

---

*Nouns 95 & Berry OS are fully open-source under a WTFPL licenses.
Their repos can be found [here, and here.](https://github.com/Nouns95/nouns95)*

---

## Retro Comp

the 9.5 WETH is retro comp for Nouns 95 & Berry OS as living art works.

## About Wylin

Wylin is an artist and entrepreneur. After exhibiting in galleries, he dropped out of a fine art and design school's architecture program and declined the opportunity to work in the corporate construction world to pursue decentralized agriculture. 

![IMG_0189 2-min](https://hackmd.io/_uploads/rJgg1-orCxx.jpg)`

      // Parse votes from JSON data
      const rawVotes = isCandidate ? [] : [
        { id: '0x05a1ff0a32bc24265bcb39499d0c5d9a6cb2011c-884', reason: '\n\nI like Nouns 95 and Wylin and am generally in favor of funding nounish builders to develop novel open source software.\n\nAlso agree with the arguments against funding redundant internal tooling. Strongly prefer to fund products that either have a path to sustainability (or dare I say, direct financial upside), or provide significant value that justifies the grant. Bonus points if you can do both.\n\nDespite that, I think nouns gov has been far too harsh on software this past year relative to other props. Other than nouns.world (which is more content than tech), every software related prop this past year has been defeated (some repeatedly). Wtf??? Building, piloting, and proliferating software is one of our greatest strengths and opportunities as a community, yet we\'ve repeatedly turned away builders who invested their own time and resources to build in our ecosystem. Do I think it makes sense for us to spend 9.5 ETH for what\'s been developed so far with Nouns 95 and Berry OS? Respectfully, no. Am I willing to make a bet on Wylin to continue building and iterating toward something even better? Fuck yes. Let him cook.\n\nAlso very excited about the upcoming Octant V2 pool and hope that it helps reverse this trend. If this prop doesn\'t pass, hope we can support Berry OS development and many more software projects forever.\n\n', transactionHash: '0xea45b320c40c12f021f11dfda9d1ed4de2e11f4f8e2e07a2fb5a32032c9d51a9' },
        { id: '0x06ae622bf2029db79bdebd38f723f1f33f95f6c5-884', reason: '\n\nNouns 95 has been a creative and functional project, bringing together art and utility in a unique way. It\'s facilitated engagement and innovation within the Nouns DAO. The transition to Berry OS, with its enhanced architecture and user customization, feels like a natural evolution. Supporting this sunset and the retro compensation acknowledges the value of the creators\' work and encourages further innovation.\n\n', transactionHash: '0x3810f6fdde0c1e7ac4762273ddb127c6880b8ffc8fcbf96281f9fc51865f0a82' },
        { id: '0x136883b2841d7de5c13ecee65788fde191da5f20-884', reason: '\n\nI absolutley adore this idea, while Nouns 95  gives me major PTSD  but i love the concept and execution. Berry OS looks terrific and it is always cool to see Wylin working in real time in the discord during the lil nouns calls Looking forward to more berry things\n\n', transactionHash: '0xdc5e9743c4d03eec9d1af2b77b3fe417be87f444c190b062d0b1e7a0322f25a7' },
        { id: '0x14c86d9255d5b9768704b670c57f30662aff41f0-884', reason: 'aside from our regular support for artists and public goods tech, the governance parameters transaction builder is a unique tooling facilitating core DAO functions\n\nfor this, a For vote is merited', transactionHash: '0xa5b3cd42ab04c6329d6c889438c967470e576accd8360bffaa3e5b935e27dcb5' },
        { id: '0x1d2f6943059a42da929d6a8057d1e010095cd801-884', reason: '\n\n✅ ▒▒▒▒▒▒▒▒▒▒ | 0.0% (0)\n❌ ▒▒▒▒▒▒▒▒▒▒ | 0.0% (0)\n\n', transactionHash: '0x4ea63093c15f841a11a0e5c02c113871eff92a28178e2274ea3a69cfbb5f90a0' },
        { id: '0x215db99298af65306a4c60bd3b7612d5f60b03d7-884', reason: null, transactionHash: '0xfd1837f48ed327aad2bd512b2f986251d82f74b38068b8efa87361298e02ae49' },
        { id: '0x614ab6edb88fec7e6cd5e9ba83ffc6d5a88d975f-884', reason: '\n\nlove the retro windows 95 vibe! didn\'t grow up with it, but great retro experience!\n\n', transactionHash: '0x997cdeacc6a2d3ad30a4c366c1419178c46349d72fa7419f38b9987d6b66b61a' },
        { id: '0x65a3870f48b5237f27f674ec42ea1e017e111d63-884', reason: '\n\nvoting yes because I like wylin as a builder who has done plenty for nouns\n\n', transactionHash: '0xca0b74b06791426a5c2c32e6a3eeacd2689f1bbd0e4959cf34d34cd7b0575e50' },
        { id: '0x6fb5d14b61e595e6f34baf952c5d3e60e45883b0-884', reason: '\n\nAgainst funding redundant internal tooling.\n\n+1\n\n> I still think the best way to fund clients is through the client incentives program.  \n> It\'s the only model that really works long term, it rewards active usage and filters  \n> out clients that don\'t bring value that can reach mass adoption. It also keeps  \n> developers excited to keep improving and maintaining their projects, instead of just  \n> building something for quick funding and letting it fade away.  \n> \n> When incentives line up with real usage, everyone wins, users get better tools,  \n> developers stay engaged, and the DAO doesn\'t end up wasting funds on projects that  \n> go quiet after a few months. That\'s what healthy growth looks like.  \n> \n> If client owners feel their current share or incentives from the DAO aren\'t enough,  \n> they can always put together a proposal to adjust the program parameters. The system  \n> is already there to support them, it just needs to be used the right way.', transactionHash: '0xc879715041c269b48eb6058ab39e8205a2bdd5e2d719e504256fa3fadf640958' },
        { id: '0x73e09de9497f2dfff90b1e97ac0be9ccca1677ec-884', reason: '\n\nVotes from $nogs holders ⌐◨-◨\n\n**FOR: 2.09M $nogs**\n\n**AGAINST: 0 $nogs**\n\n**Voters: 1**\n\n', transactionHash: '0xf3863f27e03491cafc0893b2f75c5d1a44dc7e0115ee3688ee3acf95e3e858a8' },
        { id: '0x7f8ec393b8f1b7de8d6e9b089d9819e5217046c3-884', reason: '\n\nBerry OS looks outstanding. Well done, Wyllin.\n\n', transactionHash: '0xabee1eb0ac3c98fce320462f4fb29581f0f00308d02e4c4fc81e21af53341ceb' },
        { id: '0x8ab0c174f40c5e22b00065c4cc7b561c299cad1c-884', reason: null, transactionHash: '0xf00edf5d26b98d1d1e9fb022ec05304eab24399ce6759e9faf3ddd576bdf310c' },
        { id: '0x9c87a1065994f156f0b7b87aaa8b3c5f7bd67e02-884', reason: null, transactionHash: '0x7a80245cee1c824af326b78b756f5bfeea1e344077028e414d199a47d299fee8' },
        { id: '0x9e0e9d25a5ed9bc773f91691f0b45599255257b1-884', reason: '\n\nI don\'t think gradually shutting down the client incentives program is the right way forward.\n\n+1\n\n> torn on this .. while i respect the hustle, building in public, taking community requests, etc... i go back to the client incentive board and see you just got your client ID like 3 months ago and already #7 on the board? I feel like with some more promotion you\'re on your way to the top.. and worry that this may push unfunded clients (even ones above you currently on the client incentive dash) to submit similar props. Would like to see more promoting the client on socials to boost use and increase your incentives (i just checked your x and fc and its been a while). good luck.\n> \n> +1\n> \n> > I still think the best way to fund clients is through the client incentives program.  \n> > It\'s the only model that really works long term, it rewards active usage and filters  \n> > out clients that don\'t bring value that can reach mass adoption. It also keeps  \n> > developers excited to keep improving and maintaining their projects, instead of just  \n> > building something for quick funding and letting it fade away.  \n> > \n> > When incentives line up with real usage, everyone wins, users get better tools,  \n> > developers stay engaged, and the DAO doesn\'t end up wasting funds on projects that  \n> > go quiet after a few months. That\'s what healthy growth looks like.  \n> > \n> > If client owners feel their current share or incentives from the DAO aren\'t enough,  \n> > they can always put together a proposal to adjust the program parameters. The system  \n> > is already there to support them, it just needs to be used the right way.\n\n+1\n\n> I still think the best way to fund clients is through the client incentives program.  \n> It\'s the only model that really works long term, it rewards active usage and filters  \n> > out clients that don\'t bring value that can reach mass adoption. It also keeps  \n> > developers excited to keep improving and maintaining their projects, instead of just  \n> > building something for quick funding and letting it fade away.  \n> > \n> > When incentives line up with real usage, everyone wins, users get better tools,  \n> > developers stay engaged, and the DAO doesn\'t end up wasting funds on projects that  \n> > go quiet after a few months. That\'s what healthy growth looks like.  \n> > \n> > If client owners feel their current share or incentives from the DAO aren\'t enough,  \n> > they can always put together a proposal to adjust the program parameters. The system  \n> > is already there to support them, it just needs to be used the right way.\n\n+1\n\n> My concern is that this create another client building marathon.\n> \n> Nouns has burned around 2 million on more than 20 clients.\n> The few popular ones still run today on incentive money.\n> \n> Building client-incentive mechanism alone likely cost the DAO over 500k. Judged on the products we actually use today, which Verbs built last year.\n> \n> I think incentives are a fair way to filter which clients are useful, even though the process is locked behind KYC.\n> \n> DAO voted against spending a few dollars on taxes over compliance for clients.\n> So it feels strange to start another marathon of funding niche clients again by funding a new client over 100x of taxes that DAO might owe on client-incentives.\n> \n> If a client can gain enough traction, it can earn more.\n> Clients should be built to provide value that others do not and then compete fairly on incentives.\n\n+1\n\n> Against funding redundant internal tooling.\n> \n> +1\n> \n> > I still think the best way to fund clients is through the client incentives program.  \n> > It\'s the only model that really works long term, it rewards active usage and filters  \n> > out clients that don\'t bring value that can reach mass adoption. It also keeps  \n> > developers excited to keep improving and maintaining their projects, instead of just  \n> > building something for quick funding and letting it fade away.  \n> > \n> > When incentives line up with real usage, everyone wins, users get better tools,  \n> > developers stay engaged, and the DAO doesn\'t end up wasting funds on projects that  \n> > go quiet after a few months. That\'s what healthy growth looks like.  \n> > \n> > If client owners feel their current share or incentives from the DAO aren\'t enough,  \n> > they can always put together a proposal to adjust the program parameters. The system  \n> > is already there to support them, it just needs to be used the right way.', transactionHash: '0xfe5af6fac205012448a8a55c4c89941a1f5698da8d052dc04262085e7ad5c5bc' },
        { id: '0x9f5a86b068b44d108f811f5ede5948a989f9ab7d-884', reason: null, transactionHash: '0x5fe4c9e7be11619700bcd6596cc09d4cc0c746ea2e00cd15255333afe6d3fbf1' },
        { id: '0xa47f60564085b8792bae197be7762c7f7930ec67-884', reason: '\n\nGenius ideas should be encouraged, and Nouns 95 is definitely one of them. Great work!\n\n', transactionHash: '0x4a2854d4f29b69d96f4b7ba8dc26aeadb80a6a61cb7a6c72aafc0599b84f5224' },
        { id: '0xada31add8450ca0422983b9a3103633b78938617-884', reason: 'shut it down', transactionHash: '0xfc6749913880d2c237177977effa43dd1de36c87148ae7f463caad0241ef36df' },
        { id: '0xb29050965a5ac70ab487aa47546cdcbc97dae45d-884', reason: null, transactionHash: '0x665679ae4795ba91cd335daebbc025ec671ea9852ba3df2567aa662af32eeb37' },
        { id: '0xbe957a475844c127ddd207b4ff1f63900fd13e57-884', reason: '\n\nRead this the day it dropped along with comments and had to step back to think about it for a couple of days. I decided to support based on the following:\n\n👉🏾 It aligns culturally (art as utility, open source, open license). The DAO exists to fund experiments that expand culture and public goods, not just software. The DAO has already funded playgrounds, ads, creative infrastructure precisely because each of these proliferates the meme. Nouns 95 has demonstrably done this. \n👉🏾 It seems to fit the DAO\'s history of retro comping impactful tools. Retro comp has been part of the Nouns culture since early on. Even the Client Incentives Spec acknowledges this duality "automatic rewards for measurable on chain actions, and retro funding clients for other contributions and innovations as they happen"\n👉🏾 It complements rather than conflicts with client incentives. Client incentives are designed for ongoing, measurable activity￼. Proposals like this, in contrast, cover creative infrastructure that doesn\'t fit neatly into those automatic metrics. But rewarding the design and architecture work itself via proposal aligns with Nouns\' broader treasury mission.\n\nBiggest ⁉️ for me is the 9.5 ETH price tag. I\'m not experienced in pricing software/software builds but it feels like a lot. As art... less so. \n\nI also have concerns about what happens with things like this once they\'ve been funded and artists/devs move on to the next project. They sit in the archive and get forgotten about?? Gotta be a better way to showcase/highlight/revive all the fantastic work that\'s accumulated over the years??\n\n', transactionHash: '0xfb64feae48c3fac56776681864030eb195e55944cf138257eb9cea45351261f8' },
        { id: '0xc7ccec521eed20fcddff8f95424816ac421c7d87-884', reason: null, transactionHash: '0xcfc6e8aa12479254fea69b53ba6abf756793e844b31b8836eb81c5292cbfbfaa' },
        { id: '0xcc2688350d29623e2a0844cc8885f9050f0f6ed5-884', reason: 'Abstain - Wins  FOR - 13 VOTES  AGAINST - 13 VOTES  ABSTAINS - 5 VOTES', transactionHash: '0x74526bde4c590803a338dd7ff98dc9bcd2d388b69816b99ac8401823a948e600' },
        { id: '0xd2355d2c0fb7c992df43dcaf5251a7f773cd0a7e-884', reason: null, transactionHash: '0xf9fc0affb9562e2407b6b219fd56178ef4472a12fd524b7188005d55c691dda4' },
        { id: '0xdad67a985ce8fa4a3ea01fae4f41b2cf6241ec1b-884', reason: null, transactionHash: '0x97394aef0a6859042cd037f6a1d58928f4739e398cadb78fe20d930b1501f67f' },
        { id: '0xdcb4117e3a00632efcac3c169e0b23959f555e5e-884', reason: '**FOR 17 VOTES**\n\n**AGAINST 0 VOTES**\n\n**ABSTAIN 208 VOTES**', transactionHash: '0xeebcedee895af7836f4b475e2e353850a0fb21765c0b3590feef63e71fa16a2c' },
        { id: '0xdfb6ed808fadddad9154f5605e349fff96e3d939-884', reason: '\n\nwindows 95 has a special place in my heart, as one of the first computers i used had it! GL Wylin\n\n', transactionHash: '0x2f82820e3e037ce3f48a035aa5cd2a16f8cb8e3b252c0b1a30cfd5ec8cddd189' },
        { id: '0xedc1a397589a0236c4810883b7d559288a5fe7e1-884', reason: 'Post natively shown in berry os https://media3.giphy.com/media/v1.Y2lkPTZjMDliOTUydWh5cDlodW10bnA3MXVuNThxdG51bG15NXB2MzAwanA4NWNic3BhMSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/GI5lkXChv0VB0z1glJ/giphy.gif', transactionHash: '0xcbd17c045c9df3f83cec03c9d40048f39e89e460bc039f5cc3b828b76d901c51' },
        { id: '0xf64642b49886ba8fee006767c3b1303df25c5211-884', reason: 'Love the work as always.', transactionHash: '0xd3986fcbc18aa8cb386d7cd9a06fdd0f7266c77d71407aaa330d41794568a5c5' },
        { id: '0xf84a5fd946a7714c6d48508fa8292c8c5037b5a8-884', reason: '\n\nrun the sunset!\n\n', transactionHash: '0xe32a8a8632d01f712186f9a43e55c5df2f0a1eba326ddbd0db8713510f50076a' },
        { id: '0xfc538ffd2923dddaed09c8ad1a51686275c56183-884', reason: '\n\ntorn on this .. while i respect the hustle, building in public, taking community requests, etc... i go back to the client incentive board and see you just got your client ID like 3 months ago and already #7 on the board? I feel like with some more promotion you\'re on your way to the top.. and worry that this may push unfunded clients (even ones above you currently on the client incentive dash) to submit similar props. Would like to see more promoting the client on socials to boost use and increase your incentives (i just checked your x and fc and its been a while). good luck.\n\n+1\n\n> I still think the best way to fund clients is through the client incentives program.  \n> It\'s the only model that really works long term, it rewards active usage and filters  \n> out clients that don\'t bring value that can reach mass adoption. It also keeps  \n> developers excited to keep improving and maintaining their projects, instead of just  \n> building something for quick funding and letting it fade away.  \n> \n> When incentives line up with real usage, everyone wins, users get better tools,  \n> developers stay engaged, and the DAO doesn\'t end up wasting funds on projects that  \n> go quiet after a few months. That\'s what healthy growth looks like.  \n> \n> If client owners feel their current share or incentives from the DAO aren\'t enough,  \n> they can always put together a proposal to adjust the program parameters. The system  \n> is already there to support them, it just needs to be used the right way.', transactionHash: '0x751db7da28c561934d77994a90480a5bc23da69c93287952decc6542cdaea3d0' },
      ]

      const votes: ProposalVote[] = isCandidate ? [] : rawVotes.map((vote, index) => {
        const voterAddress = extractVoterAddress(vote.id) as `0x${string}`
        const supportDetailed = parseVoteDirection(vote.reason)
        const voteTime = now - (rawVotes.length - index) * 3600 // Stagger votes by 1 hour
        
        return {
          id: vote.id,
          voterAddress,
          supportDetailed,
          votes: '1', // Each vote represents 1 noun
          weight: 1,
          reason: vote.reason || undefined,
          transactionHash: vote.transactionHash as `0x${string}`,
          blockTimestamp: voteTime.toString(),
          timestamp: voteTime.toString(),
          nouns: [{ id: (index + 1).toString() }],
        }
      })
      
      // Calculate vote counts
      const forVotes = isCandidate ? 0 : votes.filter(v => v.supportDetailed === 1).length
      const againstVotes = isCandidate ? 0 : votes.filter(v => v.supportDetailed === 0).length
      const abstainVotes = isCandidate ? 0 : votes.filter(v => v.supportDetailed === 2).length
      
      return {
        id: proposalId,
        title: isCandidate ? 'Test Candidate Proposal' : 'Sunset Nouns 95',
        proposerAddress: '0xa7C37f79ff5E6F932147fC69724B6ED432CA6Aa7' as `0x${string}`,
        forVotes,
        againstVotes,
        abstainVotes,
        quorumVotes: 10,
        state: 'active',
        creationBlock: 0,
        votingStartBlock: 0,
        votingStartTimestamp: now,
        votingEndBlock: 0,
        votingEndTimestamp: votingEndTimestamp,
        isDummy: true,
        isTestCandidate: isCandidate,
        description,
        transactions: isCandidate ? [] : [
          {
            to: '0xa7C37f79ff5E6F932147fC69724B6ED432CA6Aa7' as `0x${string}`,
            signature: '_setImplementation(address)',
            value: BigInt(0),
            calldata: '0x' as `0x${string}`,
          },
          {
            to: '0xa7C37f79ff5E6F932147fC69724B6ED432CA6Aa7' as `0x${string}`,
            signature: '_setLastMinuteWindowInBlocks(uint32)',
            value: BigInt(0),
            calldata: '0x' as `0x${string}`,
          },
          {
            to: '0xa7C37f79ff5E6F932147fC69724B6ED432CA6Aa7' as `0x${string}`,
            signature: '_setObjectionPeriodDurationInBlocks(uint32)',
            value: BigInt(0),
            calldata: '0x' as `0x${string}`,
          },
          {
            to: '0xa7C37f79ff5E6F932147fC69724B6ED432CA6Aa7' as `0x${string}`,
            signature: '_setProposalUpdatablePeriodInBlocks(uint32)',
            value: BigInt(0),
            calldata: '0x' as `0x${string}`,
          },
        ],
        votes: isCandidate ? [] : votes,
      }
    }
    
    return null
  }

  const dummyProposal = createDummyProposal()
  
  // Track when proposal was initially loaded for version detection
  const [loadedTimestamp, setLoadedTimestamp] = useState<number | null>(null)
  
  // Fetch proposal - Nouns DAO if isNounsDao, otherwise Lil Nouns
  // Skip fetching if it's a dummy proposal
  const { data: proposal, isLoading, refetch } = useQuery({
    queryKey: ['proposal', proposalId.toString(), isNounsDao ? 'nouns' : 'lilnouns'],
    queryFn: () => getProposal(proposalId.toString(), isNounsDao ? 'nouns' : 'lilnouns'),
    enabled: !dummyProposal, // Don't fetch if it's a dummy proposal
  })
  
  // Use dummy proposal if available, otherwise use fetched proposal
  const finalProposal = dummyProposal || proposal

  // Fetch proposal versions - V5 only (V2 doesn't support proposal versions)
  // MUST be called before any early returns (Rules of Hooks)
  const proposalVersions = useProposalVersions(
    proposalId,
    isNounsDao ? 'nouns' : 'lilnouns',
    isVersion5 && !dummyProposal && !!finalProposal // Only fetch for V5 and if we have a valid proposal
  )
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false)
  
  // Fetch candidate for this proposal (if it came from a candidate) - V5 only
  const { data: sourceCandidate } = useQuery({
    queryKey: ['candidate-for-proposal', proposalId.toString(), isNounsDao ? 'nouns' : 'lilnouns'],
    queryFn: () => getCandidateForProposal(proposalId, isNounsDao ? 'nouns' : 'lilnouns'),
    enabled: isVersion5 && !dummyProposal && !!finalProposal, // Only fetch for V5 and if we have a valid proposal
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  // Track loaded timestamp when proposal is first loaded
  // V2 doesn't have lastUpdatedTimestamp, so use votingStartTimestamp
  useEffect(() => {
    if (finalProposal && !dummyProposal) {
      const timestamp = (isVersion5 && finalProposal.lastUpdatedTimestamp) 
        ? finalProposal.lastUpdatedTimestamp 
        : finalProposal.votingStartTimestamp
      if (loadedTimestamp === null) {
        setLoadedTimestamp(timestamp)
      }
    }
  }, [finalProposal, dummyProposal, loadedTimestamp, isVersion5])

  // Check for newer version periodically
  const [hasNewerVersion, setHasNewerVersion] = useState(false)
  useEffect(() => {
    if (!finalProposal || dummyProposal || !loadedTimestamp) return

    const checkForUpdates = async () => {
      try {
        const freshProposal = await getProposal(proposalId.toString(), isNounsDao ? 'nouns' : 'lilnouns')
        if (freshProposal) {
          // V2 doesn't have lastUpdatedTimestamp, so use votingStartTimestamp
          const freshTimestamp = (isVersion5 && freshProposal.lastUpdatedTimestamp)
            ? freshProposal.lastUpdatedTimestamp
            : freshProposal.votingStartTimestamp
          if (freshTimestamp > loadedTimestamp) {
            setHasNewerVersion(true)
          }
        }
      } catch (error) {
        console.error('Failed to check for proposal updates:', error)
      }
    }

    // Check every 30 seconds
    const interval = setInterval(checkForUpdates, 30000)
    return () => clearInterval(interval)
  }, [finalProposal, dummyProposal, loadedTimestamp, proposalId, isNounsDao, isVersion5])

  const handleRefreshProposal = () => {
    setHasNewerVersion(false)
    setLoadedTimestamp(null)
    refetch()
  }

  // Fetch Snapshot proposals for Nouns DAO
  const { data: snapshotProposals = [] } = useQuery({
    queryKey: ['snapshot-proposals'],
    queryFn: () => getSnapshotProposals('leagueoflils.eth'),
    enabled: isNounsDao,
    staleTime: 5 * 60 * 1000,
  })

  const snapshotProposal = isNounsDao && proposal
    ? matchSnapshotProposal(proposal, snapshotProposals)
    : undefined;

  if (isLoading && !dummyProposal) {
    return <LoadingSkeletons count={3} className="h-[80px] w-full" />
  }

  if (!finalProposal) {
    return (
      <div className="flex h-screen w-full flex-col items-center gap-4 py-8 text-center">
        <h2>Prop {proposalId} not found</h2>
        <p className="text-content-secondary max-w-md">
          This proposal may not exist, may have been cancelled, or may not be indexed yet. 
          Please verify the proposal ID and try again.
        </p>
        <Link to="/vote">
          <Button className="rounded-full">Back to proposals</Button>
        </Link>
      </div>
    )
  }

  const nowTimestamp = Math.floor(Date.now() / 1000)
  const endTimeDelta = Math.max(finalProposal.votingEndTimestamp - nowTimestamp, 0)
  const timeToVotingEndFormatted = formatTimeLeft(endTimeDelta, true)
  
  // Format exact end time
  const endDate = new Date(finalProposal.votingEndTimestamp * 1000)
  const endTimeFormatted = endDate.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })

  // Determine which badge to show
  const showLilNounsBadge = snapshotProposal && 
    snapshotProposal.state === 'active' && 
    finalProposal.state === 'active';
  
  const showAwaitingNounsMessage = snapshotProposal && 
    snapshotProposal.state === 'closed' && 
    finalProposal.state === 'active';

  const showNounsBadge = (!showLilNounsBadge && !showAwaitingNounsMessage) || 
    finalProposal.state !== 'active';

  const isProposer = address?.toLowerCase() === finalProposal.proposerAddress.toLowerCase()
  // V2 doesn't support updatable state - only V5 can edit proposals
  const canEdit = isVersion5 && 
    isProposer && 
    finalProposal.state === "updatable" &&
    !isNounsDao // Only Lil Nouns proposals can be updated

  const hasMultipleVersions = proposalVersions && proposalVersions.length > 1

  return (
    <>
      {/* Version update warning banner */}
      {isVersion5 && hasNewerVersion && !dummyProposal && (
        <div className="flex items-center justify-between gap-4 rounded-[12px] border border-semantic-warning bg-yellow-50 p-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-content-primary">
              A newer version of this proposal is available
            </span>
          </div>
          <Button
            variant="secondary"
            size="fit"
            onClick={handleRefreshProposal}
            className="flex items-center gap-2 px-3 py-2"
          >
            <RefreshCw size={16} />
            Refresh
          </Button>
        </div>
      )}
      
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="heading-3">{finalProposal.title}</h1>
          {finalProposal.isDummy && (
            <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded border border-yellow-300">
              TEST
            </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {hasMultipleVersions && (
              <Button
                variant="ghost"
                onClick={() => setIsHistoryModalOpen(true)}
                className="flex items-center gap-2"
              >
                <History size={16} />
                History ({proposalVersions.length})
              </Button>
            )}
          {canEdit && (
            <Button
              variant="ghost"
              onClick={() => navigate(`/update/proposal/${proposalId}`)}
              className="flex items-center gap-2"
            >
              <Pencil size={16} />
              Edit
            </Button>
          )}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex gap-2 text-content-secondary label-sm">
            {(finalProposal.state === "active" || showLilNounsBadge) && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1 cursor-help">
                    <Icon icon="clock" size={16} className="fill-content-secondary" />
                    <span>{timeToVotingEndFormatted} left • </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Ends at {endTimeFormatted}</p>
                </TooltipContent>
              </Tooltip>
            )}
            {showNounsBadge && <ProposalStateBadge state={finalProposal.state} objectionPeriodEndBlock={finalProposal.objectionPeriodEndBlock} />}
            {showLilNounsBadge && (
            <MetagovStatusBadge 
                state="metagov_active" 
              />
            )}
            {showAwaitingNounsMessage && (
              <div className="flex items-center gap-1 text-content-secondary label-sm">
                <span>Awaiting Nouns Vote</span>
              </div>
            )}
          </div>
          {sourceCandidate && (
            <div className="flex items-center gap-2 text-sm text-content-secondary">
              <span>Created from candidate:</span>
              <Link 
                to={`/candidates/${sourceCandidate.id}`}
                className="text-blue-600 hover:text-blue-800 underline"
              >
                {sourceCandidate.slug}
              </Link>
            </div>
          )}
        </div>
      </div>

      <div className="w-full md:hidden">
        <VotingSummary
          forVotes={finalProposal.forVotes}
          againstVotes={finalProposal.againstVotes}
          abstainVotes={finalProposal.abstainVotes}
          quorumVotes={finalProposal.quorumVotes}
          proposal={finalProposal}
          alwaysShowAbstain={true}
          isNounsDao={isNounsDao}
        />
        {snapshotProposal && (
          <div className="mt-4">
            <SnapshotVotes snapshotProposal={snapshotProposal} />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center whitespace-pre-wrap border-b border-t py-6 leading-7 text-content-secondary">
        Proposed by{" "}
        <IdentityExplorerLink address={finalProposal.proposerAddress} showAvatar />
        {/* V2 doesn't have signers - only show for V5 */}
        {isVersion5 && finalProposal.signers && finalProposal.signers.length > 0 && (
          <>
            , sponsored by{" "}
            {finalProposal.signers.map((signer, i) => (
              <span
                key={i}
                className="inline-flex items-center whitespace-pre-wrap"
              >
                <IdentityExplorerLink address={signer} showAvatar />
                {i < finalProposal.signers!.length - 1 && ", "}
              </span>
            ))}
          </>
        )}
      </div>

      <ProposalTransactionSummary transactions={finalProposal.transactions} proposalState={finalProposal.state} />

      {/* Proposal Version History Modal */}
      {proposalVersions && proposalVersions.length > 0 && (
        <ProposalVersionHistoryModal
          versions={proposalVersions}
          isOpen={isHistoryModalOpen}
          onClose={() => setIsHistoryModalOpen(false)}
        />
      )}
    </>
  )
}

function LearnHowActivityWorksTooltipPopover() {
  return (
    <TooltipPopover
      trigger={
        <div className="text-content-secondary underline transition-all label-sm hover:brightness-90">
          Learn how activity works
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <p>
          The Activity Feed offers a real-time view of proposal participation,
          including votes, comments, and discussions. Anyone can leave a
          comment, but only Lil Nouns delegates can vote on proposals.
        </p>
        <Link
          to="/learn/lil-nouns-dao-governance-explained"
          className="underline"
        >
          Learn more about Governance
        </Link>
      </div>
    </TooltipPopover>
  )
}

function ProposalMarkdownWrapper({ proposalId, isNounsDao }: { proposalId: number; isNounsDao: boolean }) {
  const isSepolia = isSepoliaNetwork()
  
  // Create dummy proposal data if it's a test proposal (same logic as ProposalTopWrapper)
  const createDummyProposal = (): DetailedProposal | null => {
    if (!isSepolia) return null
    
    if (proposalId === 999999 || proposalId === 999998) {
      const now = Math.floor(Date.now() / 1000)
      const votingEndTimestamp = now + (7 * 24 * 60 * 60)
      const isCandidate = proposalId === 999998
      
      const description = isCandidate 
        ? 'This is a test candidate proposal for Sepolia testing. Candidates can be updated and signed before being promoted to full proposals.'
        : `# Sunset Nouns 95

## TL;DR

Requesting 9.5 WETH as retro for Nouns 95 by Macrohard + Berry OS.

---

[![image](https://hackmd.io/_uploads/HyxBAxihxg.png "https://youtu.be/VdwEABkFIqE")](https://youtu.be/VdwEABkFIqE)

*Our commercial illustrated by Nadiecito.*

---

Nouns 95 is a meme and art project. It has facilitated 5 proposal creations, 1,900+ token votes, and 1 winning auction bid in the DAO, and allows Nouners to celebrate Noun O'CLock via the Crystal Ball.

It combines the functionality of a suite of Nouns tooling into a single browser tab - code as art, something beautiful yet useful.

Since Elon recently launched his own Macrohard company, it is becoming impossible to continue developing Nouns 95 under the Macrohard moniker. This is an opportunity to sunset the Macrohard Nouns 95 design and launch Berry OS.

---

## The OS Experience

Nouns 95 replicates the Windows 95 operating system's Windows functionality in Typescript using a Zustand-based singleton system. Users can open as many windows as they'd like, the system will manage their position, Z-index, and focus automatically. The Taskbar & Start Menu provide further utility for multi-App use.

Apps are written with Tyescript components using CSS modules. Apps can be nearly infintely complex in their functions, and contained simply within the windows system with 2 top-level CSS modules.

A single App Config file mediates between the two layers, making the addition of new Programs simple.

## Berry OS

[Berry OS](https://berryos.wtf) takes the core learnings of Nouns 95 and refines its design for a more robust and stable architecture for a more authentic OS emulator experience with user customization features.

The OS is mobile friendly, works as a Forecaster Miniapp, and soon as an Android APK, all in one codebase.

![ezgif.com-optimize](https://hackmd.io/_uploads/rk0dYsB0lx.gif)

---

![ezgif.com-optimize-2](https://hackmd.io/_uploads/SJesjsSRel.gif)

---

*Nouns 95 & Berry OS are fully open-source under a WTFPL licenses.
Their repos can be found [here, and here.](https://github.com/Nouns95/nouns95)*

---

## Retro Comp

the 9.5 WETH is retro comp for Nouns 95 & Berry OS as living art works.

## About Wylin

Wylin is an artist and entrepreneur. After exhibiting in galleries, he dropped out of a fine art and design school's architecture program and declined the opportunity to work in the corporate construction world to pursue decentralized agriculture. 

![IMG_0189 2-min](https://hackmd.io/_uploads/rJgg1-orCxx.jpg)`

      // Parse votes from JSON data
      const rawVotes = isCandidate ? [] : [
        { id: '0x05a1ff0a32bc24265bcb39499d0c5d9a6cb2011c-884', reason: '\n\nI like Nouns 95 and Wylin and am generally in favor of funding nounish builders to develop novel open source software.\n\nAlso agree with the arguments against funding redundant internal tooling. Strongly prefer to fund products that either have a path to sustainability (or dare I say, direct financial upside), or provide significant value that justifies the grant. Bonus points if you can do both.\n\nDespite that, I think nouns gov has been far too harsh on software this past year relative to other props. Other than nouns.world (which is more content than tech), every software related prop this past year has been defeated (some repeatedly). Wtf??? Building, piloting, and proliferating software is one of our greatest strengths and opportunities as a community, yet we\'ve repeatedly turned away builders who invested their own time and resources to build in our ecosystem. Do I think it makes sense for us to spend 9.5 ETH for what\'s been developed so far with Nouns 95 and Berry OS? Respectfully, no. Am I willing to make a bet on Wylin to continue building and iterating toward something even better? Fuck yes. Let him cook.\n\nAlso very excited about the upcoming Octant V2 pool and hope that it helps reverse this trend. If this prop doesn\'t pass, hope we can support Berry OS development and many more software projects forever.\n\n', transactionHash: '0xea45b320c40c12f021f11dfda9d1ed4de2e11f4f8e2e07a2fb5a32032c9d51a9' },
        { id: '0x06ae622bf2029db79bdebd38f723f1f33f95f6c5-884', reason: '\n\nNouns 95 has been a creative and functional project, bringing together art and utility in a unique way. It\'s facilitated engagement and innovation within the Nouns DAO. The transition to Berry OS, with its enhanced architecture and user customization, feels like a natural evolution. Supporting this sunset and the retro compensation acknowledges the value of the creators\' work and encourages further innovation.\n\n', transactionHash: '0x3810f6fdde0c1e7ac4762273ddb127c6880b8ffc8fcbf96281f9fc51865f0a82' },
        { id: '0x136883b2841d7de5c13ecee65788fde191da5f20-884', reason: '\n\nI absolutley adore this idea, while Nouns 95  gives me major PTSD  but i love the concept and execution. Berry OS looks terrific and it is always cool to see Wylin working in real time in the discord during the lil nouns calls Looking forward to more berry things\n\n', transactionHash: '0xdc5e9743c4d03eec9d1af2b77b3fe417be87f444c190b062d0b1e7a0322f25a7' },
        { id: '0x14c86d9255d5b9768704b670c57f30662aff41f0-884', reason: 'aside from our regular support for artists and public goods tech, the governance parameters transaction builder is a unique tooling facilitating core DAO functions\n\nfor this, a For vote is merited', transactionHash: '0xa5b3cd42ab04c6329d6c889438c967470e576accd8360bffaa3e5b935e27dcb5' },
        { id: '0x1d2f6943059a42da929d6a8057d1e010095cd801-884', reason: '\n\n✅ ▒▒▒▒▒▒▒▒▒▒ | 0.0% (0)\n❌ ▒▒▒▒▒▒▒▒▒▒ | 0.0% (0)\n\n', transactionHash: '0x4ea63093c15f841a11a0e5c02c113871eff92a28178e2274ea3a69cfbb5f90a0' },
        { id: '0x215db99298af65306a4c60bd3b7612d5f60b03d7-884', reason: null, transactionHash: '0xfd1837f48ed327aad2bd512b2f986251d82f74b38068b8efa87361298e02ae49' },
        { id: '0x614ab6edb88fec7e6cd5e9ba83ffc6d5a88d975f-884', reason: '\n\nlove the retro windows 95 vibe! didn\'t grow up with it, but great retro experience!\n\n', transactionHash: '0x997cdeacc6a2d3ad30a4c366c1419178c46349d72fa7419f38b9987d6b66b61a' },
        { id: '0x65a3870f48b5237f27f674ec42ea1e017e111d63-884', reason: '\n\nvoting yes because I like wylin as a builder who has done plenty for nouns\n\n', transactionHash: '0xca0b74b06791426a5c2c32e6a3eeacd2689f1bbd0e4959cf34d34cd7b0575e50' },
        { id: '0x6fb5d14b61e595e6f34baf952c5d3e60e45883b0-884', reason: '\n\nAgainst funding redundant internal tooling.\n\n+1\n\n> I still think the best way to fund clients is through the client incentives program.  \n> It\'s the only model that really works long term, it rewards active usage and filters  \n> out clients that don\'t bring value that can reach mass adoption. It also keeps  \n> developers excited to keep improving and maintaining their projects, instead of just  \n> building something for quick funding and letting it fade away.  \n> \n> When incentives line up with real usage, everyone wins, users get better tools,  \n> developers stay engaged, and the DAO doesn\'t end up wasting funds on projects that  \n> go quiet after a few months. That\'s what healthy growth looks like.  \n> \n> If client owners feel their current share or incentives from the DAO aren\'t enough,  \n> they can always put together a proposal to adjust the program parameters. The system  \n> is already there to support them, it just needs to be used the right way.', transactionHash: '0xc879715041c269b48eb6058ab39e8205a2bdd5e2d719e504256fa3fadf640958' },
        { id: '0x73e09de9497f2dfff90b1e97ac0be9ccca1677ec-884', reason: '\n\nVotes from $nogs holders ⌐◨-◨\n\n**FOR: 2.09M $nogs**\n\n**AGAINST: 0 $nogs**\n\n**Voters: 1**\n\n', transactionHash: '0xf3863f27e03491cafc0893b2f75c5d1a44dc7e0115ee3688ee3acf95e3e858a8' },
        { id: '0x7f8ec393b8f1b7de8d6e9b089d9819e5217046c3-884', reason: '\n\nBerry OS looks outstanding. Well done, Wyllin.\n\n', transactionHash: '0xabee1eb0ac3c98fce320462f4fb29581f0f00308d02e4c4fc81e21af53341ceb' },
        { id: '0x8ab0c174f40c5e22b00065c4cc7b561c299cad1c-884', reason: null, transactionHash: '0xf00edf5d26b98d1d1e9fb022ec05304eab24399ce6759e9faf3ddd576bdf310c' },
        { id: '0x9c87a1065994f156f0b7b87aaa8b3c5f7bd67e02-884', reason: null, transactionHash: '0x7a80245cee1c824af326b78b756f5bfeea1e344077028e414d199a47d299fee8' },
        { id: '0x9e0e9d25a5ed9bc773f91691f0b45599255257b1-884', reason: '\n\nI don\'t think gradually shutting down the client incentives program is the right way forward.\n\n+1\n\n> torn on this .. while i respect the hustle, building in public, taking community requests, etc... i go back to the client incentive board and see you just got your client ID like 3 months ago and already #7 on the board? I feel like with some more promotion you\'re on your way to the top.. and worry that this may push unfunded clients (even ones above you currently on the client incentive dash) to submit similar props. Would like to see more promoting the client on socials to boost use and increase your incentives (i just checked your x and fc and its been a while). good luck.\n> \n> +1\n> \n> > I still think the best way to fund clients is through the client incentives program.  \n> > It\'s the only model that really works long term, it rewards active usage and filters  \n> > out clients that don\'t bring value that can reach mass adoption. It also keeps  \n> > developers excited to keep improving and maintaining their projects, instead of just  \n> > building something for quick funding and letting it fade away.  \n> > \n> > When incentives line up with real usage, everyone wins, users get better tools,  \n> > developers stay engaged, and the DAO doesn\'t end up wasting funds on projects that  \n> > go quiet after a few months. That\'s what healthy growth looks like.  \n> > \n> > If client owners feel their current share or incentives from the DAO aren\'t enough,  \n> > they can always put together a proposal to adjust the program parameters. The system  \n> > is already there to support them, it just needs to be used the right way.\n\n+1\n\n> I still think the best way to fund clients is through the client incentives program.  \n> It\'s the only model that really works long term, it rewards active usage and filters  \n> > out clients that don\'t bring value that can reach mass adoption. It also keeps  \n> > developers excited to keep improving and maintaining their projects, instead of just  \n> > building something for quick funding and letting it fade away.  \n> > \n> > When incentives line up with real usage, everyone wins, users get better tools,  \n> > developers stay engaged, and the DAO doesn\'t end up wasting funds on projects that  \n> > go quiet after a few months. That\'s what healthy growth looks like.  \n> > \n> > If client owners feel their current share or incentives from the DAO aren\'t enough,  \n> > they can always put together a proposal to adjust the program parameters. The system  \n> > is already there to support them, it just needs to be used the right way.\n\n+1\n\n> My concern is that this create another client building marathon.\n> \n> Nouns has burned around 2 million on more than 20 clients.\n> The few popular ones still run today on incentive money.\n> \n> Building client-incentive mechanism alone likely cost the DAO over 500k. Judged on the products we actually use today, which Verbs built last year.\n> \n> I think incentives are a fair way to filter which clients are useful, even though the process is locked behind KYC.\n> \n> DAO voted against spending a few dollars on taxes over compliance for clients.\n> So it feels strange to start another marathon of funding niche clients again by funding a new client over 100x of taxes that DAO might owe on client-incentives.\n> \n> If a client can gain enough traction, it can earn more.\n> Clients should be built to provide value that others do not and then compete fairly on incentives.\n\n+1\n\n> Against funding redundant internal tooling.\n> \n> +1\n> \n> > I still think the best way to fund clients is through the client incentives program.  \n> > It\'s the only model that really works long term, it rewards active usage and filters  \n> > out clients that don\'t bring value that can reach mass adoption. It also keeps  \n> > developers excited to keep improving and maintaining their projects, instead of just  \n> > building something for quick funding and letting it fade away.  \n> > \n> > When incentives line up with real usage, everyone wins, users get better tools,  \n> > developers stay engaged, and the DAO doesn\'t end up wasting funds on projects that  \n> > go quiet after a few months. That\'s what healthy growth looks like.  \n> > \n> > If client owners feel their current share or incentives from the DAO aren\'t enough,  \n> > they can always put together a proposal to adjust the program parameters. The system  \n> > is already there to support them, it just needs to be used the right way.', transactionHash: '0xfe5af6fac205012448a8a55c4c89941a1f5698da8d052dc04262085e7ad5c5bc' },
        { id: '0x9f5a86b068b44d108f811f5ede5948a989f9ab7d-884', reason: null, transactionHash: '0x5fe4c9e7be11619700bcd6596cc09d4cc0c746ea2e00cd15255333afe6d3fbf1' },
        { id: '0xa47f60564085b8792bae197be7762c7f7930ec67-884', reason: '\n\nGenius ideas should be encouraged, and Nouns 95 is definitely one of them. Great work!\n\n', transactionHash: '0x4a2854d4f29b69d96f4b7ba8dc26aeadb80a6a61cb7a6c72aafc0599b84f5224' },
        { id: '0xada31add8450ca0422983b9a3103633b78938617-884', reason: 'shut it down', transactionHash: '0xfc6749913880d2c237177977effa43dd1de36c87148ae7f463caad0241ef36df' },
        { id: '0xb29050965a5ac70ab487aa47546cdcbc97dae45d-884', reason: null, transactionHash: '0x665679ae4795ba91cd335daebbc025ec671ea9852ba3df2567aa662af32eeb37' },
        { id: '0xbe957a475844c127ddd207b4ff1f63900fd13e57-884', reason: '\n\nRead this the day it dropped along with comments and had to step back to think about it for a couple of days. I decided to support based on the following:\n\n👉🏾 It aligns culturally (art as utility, open source, open license). The DAO exists to fund experiments that expand culture and public goods, not just software. The DAO has already funded playgrounds, ads, creative infrastructure precisely because each of these proliferates the meme. Nouns 95 has demonstrably done this. \n👉🏾 It seems to fit the DAO\'s history of retro comping impactful tools. Retro comp has been part of the Nouns culture since early on. Even the Client Incentives Spec acknowledges this duality "automatic rewards for measurable on chain actions, and retro funding clients for other contributions and innovations as they happen"\n👉🏾 It complements rather than conflicts with client incentives. Client incentives are designed for ongoing, measurable activity￼. Proposals like this, in contrast, cover creative infrastructure that doesn\'t fit neatly into those automatic metrics. But rewarding the design and architecture work itself via proposal aligns with Nouns\' broader treasury mission.\n\nBiggest ⁉️ for me is the 9.5 ETH price tag. I\'m not experienced in pricing software/software builds but it feels like a lot. As art... less so. \n\nI also have concerns about what happens with things like this once they\'ve been funded and artists/devs move on to the next project. They sit in the archive and get forgotten about?? Gotta be a better way to showcase/highlight/revive all the fantastic work that\'s accumulated over the years??\n\n', transactionHash: '0xfb64feae48c3fac56776681864030eb195e55944cf138257eb9cea45351261f8' },
        { id: '0xc7ccec521eed20fcddff8f95424816ac421c7d87-884', reason: null, transactionHash: '0xcfc6e8aa12479254fea69b53ba6abf756793e844b31b8836eb81c5292cbfbfaa' },
        { id: '0xcc2688350d29623e2a0844cc8885f9050f0f6ed5-884', reason: 'Abstain - Wins  FOR - 13 VOTES  AGAINST - 13 VOTES  ABSTAINS - 5 VOTES', transactionHash: '0x74526bde4c590803a338dd7ff98dc9bcd2d388b69816b99ac8401823a948e600' },
        { id: '0xd2355d2c0fb7c992df43dcaf5251a7f773cd0a7e-884', reason: null, transactionHash: '0xf9fc0affb9562e2407b6b219fd56178ef4472a12fd524b7188005d55c691dda4' },
        { id: '0xdad67a985ce8fa4a3ea01fae4f41b2cf6241ec1b-884', reason: null, transactionHash: '0x97394aef0a6859042cd037f6a1d58928f4739e398cadb78fe20d930b1501f67f' },
        { id: '0xdcb4117e3a00632efcac3c169e0b23959f555e5e-884', reason: '**FOR 17 VOTES**\n\n**AGAINST 0 VOTES**\n\n**ABSTAIN 208 VOTES**', transactionHash: '0xeebcedee895af7836f4b475e2e353850a0fb21765c0b3590feef63e71fa16a2c' },
        { id: '0xdfb6ed808fadddad9154f5605e349fff96e3d939-884', reason: '\n\nwindows 95 has a special place in my heart, as one of the first computers i used had it! GL Wylin\n\n', transactionHash: '0x2f82820e3e037ce3f48a035aa5cd2a16f8cb8e3b252c0b1a30cfd5ec8cddd189' },
        { id: '0xedc1a397589a0236c4810883b7d559288a5fe7e1-884', reason: 'Post natively shown in berry os https://media3.giphy.com/media/v1.Y2lkPTZjMDliOTUydWh5cDlodW10bnA3MXVuNThxdG51bG15NXB2MzAwanA4NWNic3BhMSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/GI5lkXChv0VB0z1glJ/giphy.gif', transactionHash: '0xcbd17c045c9df3f83cec03c9d40048f39e89e460bc039f5cc3b828b76d901c51' },
        { id: '0xf64642b49886ba8fee006767c3b1303df25c5211-884', reason: 'Love the work as always.', transactionHash: '0xd3986fcbc18aa8cb386d7cd9a06fdd0f7266c77d71407aaa330d41794568a5c5' },
        { id: '0xf84a5fd946a7714c6d48508fa8292c8c5037b5a8-884', reason: '\n\nrun the sunset!\n\n', transactionHash: '0xe32a8a8632d01f712186f9a43e55c5df2f0a1eba326ddbd0db8713510f50076a' },
        { id: '0xfc538ffd2923dddaed09c8ad1a51686275c56183-884', reason: '\n\ntorn on this .. while i respect the hustle, building in public, taking community requests, etc... i go back to the client incentive board and see you just got your client ID like 3 months ago and already #7 on the board? I feel like with some more promotion you\'re on your way to the top.. and worry that this may push unfunded clients (even ones above you currently on the client incentive dash) to submit similar props. Would like to see more promoting the client on socials to boost use and increase your incentives (i just checked your x and fc and its been a while). good luck.\n\n+1\n\n> I still think the best way to fund clients is through the client incentives program.  \n> It\'s the only model that really works long term, it rewards active usage and filters  \n> out clients that don\'t bring value that can reach mass adoption. It also keeps  \n> developers excited to keep improving and maintaining their projects, instead of just  \n> building something for quick funding and letting it fade away.  \n> \n> When incentives line up with real usage, everyone wins, users get better tools,  \n> developers stay engaged, and the DAO doesn\'t end up wasting funds on projects that  \n> go quiet after a few months. That\'s what healthy growth looks like.  \n> \n> If client owners feel their current share or incentives from the DAO aren\'t enough,  \n> they can always put together a proposal to adjust the program parameters. The system  \n> is already there to support them, it just needs to be used the right way.', transactionHash: '0x751db7da28c561934d77994a90480a5bc23da69c93287952decc6542cdaea3d0' },
      ]

      const votes: ProposalVote[] = isCandidate ? [] : rawVotes.map((vote, index) => {
        const voterAddress = extractVoterAddress(vote.id) as `0x${string}`
        const supportDetailed = parseVoteDirection(vote.reason)
        const voteTime = now - (rawVotes.length - index) * 3600 // Stagger votes by 1 hour
        
        return {
          id: vote.id,
          voterAddress,
          supportDetailed,
          votes: '1', // Each vote represents 1 noun
          weight: 1,
          reason: vote.reason || undefined,
          transactionHash: vote.transactionHash as `0x${string}`,
          blockTimestamp: voteTime.toString(),
          timestamp: voteTime.toString(),
          nouns: [{ id: (index + 1).toString() }],
        }
      })
      
      // Calculate vote counts
      const forVotes = isCandidate ? 0 : votes.filter(v => v.supportDetailed === 1).length
      const againstVotes = isCandidate ? 0 : votes.filter(v => v.supportDetailed === 0).length
      const abstainVotes = isCandidate ? 0 : votes.filter(v => v.supportDetailed === 2).length
      
      return {
        id: proposalId,
        title: isCandidate ? 'Test Candidate Proposal' : 'Sunset Nouns 95',
        proposerAddress: '0xa7C37f79ff5E6F932147fC69724B6ED432CA6Aa7' as `0x${string}`,
        forVotes,
        againstVotes,
        abstainVotes,
        quorumVotes: 10,
        state: 'active',
        creationBlock: 0,
        votingStartBlock: 0,
        votingStartTimestamp: now,
        votingEndBlock: 0,
        votingEndTimestamp: votingEndTimestamp,
        isDummy: true,
        isTestCandidate: isCandidate,
        description,
        transactions: isCandidate ? [] : [
          {
            to: '0xa7C37f79ff5E6F932147fC69724B6ED432CA6Aa7' as `0x${string}`,
            signature: '_setImplementation(address)',
            value: BigInt(0),
            calldata: '0x' as `0x${string}`,
          },
          {
            to: '0xa7C37f79ff5E6F932147fC69724B6ED432CA6Aa7' as `0x${string}`,
            signature: '_setLastMinuteWindowInBlocks(uint32)',
            value: BigInt(0),
            calldata: '0x' as `0x${string}`,
          },
          {
            to: '0xa7C37f79ff5E6F932147fC69724B6ED432CA6Aa7' as `0x${string}`,
            signature: '_setObjectionPeriodDurationInBlocks(uint32)',
            value: BigInt(0),
            calldata: '0x' as `0x${string}`,
          },
          {
            to: '0xa7C37f79ff5E6F932147fC69724B6ED432CA6Aa7' as `0x${string}`,
            signature: '_setProposalUpdatablePeriodInBlocks(uint32)',
            value: BigInt(0),
            calldata: '0x' as `0x${string}`,
          },
        ],
        votes: isCandidate ? [] : votes,
      }
    }
    
    return null
  }

  const dummyProposal = createDummyProposal()
  
  const { data: proposal, isLoading } = useQuery({
    queryKey: ['proposal', proposalId.toString(), isNounsDao ? 'nouns' : 'lilnouns'],
    queryFn: () => getProposal(proposalId.toString(), isNounsDao ? 'nouns' : 'lilnouns'),
    enabled: !dummyProposal,
  })

  const finalProposal = dummyProposal || proposal

  if (isLoading && !dummyProposal) {
    return <LoadingSkeletons count={20} className="h-[200px] w-full" />
  }

  if (!finalProposal) {
    return null
  }

  // Remove title from description if present (description format: "# Title\n\nDescription")
  let description = finalProposal.description
  const title = finalProposal.title
  if (title && description.startsWith(`# ${title}\n\n`)) {
    description = description.substring(`# ${title}\n\n`.length)
  } else if (title && description.startsWith(`# ${title}\n`)) {
    description = description.substring(`# ${title}\n`.length)
  }

  return (
    <MarkdownRenderer className="gap-4">
      {description}
    </MarkdownRenderer>
  )
}

function VotingSummaryWrapper({ proposalId, isNounsDao }: { proposalId: number; isNounsDao: boolean }) {
  const isSepolia = isSepoliaNetwork()
  
  // Create dummy proposal data if it's a test proposal
  const createDummyProposal = (): DetailedProposal | null => {
    if (!isSepolia) return null
    
    if (proposalId === 999999 || proposalId === 999998) {
      const now = Math.floor(Date.now() / 1000)
      const votingEndTimestamp = now + (7 * 24 * 60 * 60)
      const isCandidate = proposalId === 999998
      
      return {
        id: proposalId,
        title: isCandidate ? 'Test Candidate Proposal' : 'Sunset Nouns 95',
        proposerAddress: '0xa7C37f79ff5E6F932147fC69724B6ED432CA6Aa7' as `0x${string}`,
        forVotes: isCandidate ? 0 : 15,
        againstVotes: isCandidate ? 0 : 3,
        abstainVotes: isCandidate ? 0 : 2,
        quorumVotes: 10,
        state: 'active',
        creationBlock: 0,
        votingStartBlock: 0,
        votingStartTimestamp: now,
        votingEndBlock: 0,
        votingEndTimestamp: votingEndTimestamp,
        isDummy: true,
        isTestCandidate: isCandidate,
        description: isCandidate 
          ? 'This is a test candidate proposal for Sepolia testing. Candidates can be updated and signed before being promoted to full proposals.'
          : `This proposal aims to improve the alignment between client incentives and long-term project sustainability. 

The current system sometimes incentivizes quick funding grabs rather than sustainable development. We propose adjusting the incentive structure to reward developers for building their projects, instead of just building something for quick funding and letting it fade away.

When incentives line up with real usage, everyone wins, users get better tools, developers stay engaged, and the DAO doesn\'t end up wasting funds on projects that go quiet after a few months. That\'s what healthy growth looks like.

If client owners feel their current share or incentives from the DAO aren\'t enough, they can always put together a proposal to adjust the program parameters. The system is already there to support them, it just needs to be used the right way.`,
        transactions: isCandidate ? [] : [
          {
            to: '0xa7C37f79ff5E6F932147fC69724B6ED432CA6Aa7' as `0x${string}`,
            signature: '_setImplementation(address)',
            value: BigInt(0),
            calldata: '0x' as `0x${string}`,
          },
          {
            to: '0xa7C37f79ff5E6F932147fC69724B6ED432CA6Aa7' as `0x${string}`,
            signature: '_setLastMinuteWindowInBlocks(uint32)',
            value: BigInt(0),
            calldata: '0x' as `0x${string}`,
          },
          {
            to: '0xa7C37f79ff5E6F932147fC69724B6ED432CA6Aa7' as `0x${string}`,
            signature: '_setObjectionPeriodDurationInBlocks(uint32)',
            value: BigInt(0),
            calldata: '0x' as `0x${string}`,
          },
          {
            to: '0xa7C37f79ff5E6F932147fC69724B6ED432CA6Aa7' as `0x${string}`,
            signature: '_setProposalUpdatablePeriodInBlocks(uint32)',
            value: BigInt(0),
            calldata: '0x' as `0x${string}`,
          },
        ],
        votes: isCandidate ? [] : [
          {
            id: 'vote-1',
            voterAddress: '0x1234567890123456789012345678901234567890' as `0x${string}`,
            supportDetailed: 1,
            votes: '5',
            weight: 5,
            reason: 'Strongly support this. We need better alignment between incentives and actual usage. Too many projects get funded and then disappear.',
            transactionHash: '0x751db7da28c561934d77994a90480a5bc23da69c93287952decc6542cdaea3d0' as `0x${string}`,
            blockTimestamp: (now - 86400).toString(),
            timestamp: (now - 86400).toString(),
            nouns: [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }, { id: '5' }],
          },
          {
            id: 'vote-2',
            voterAddress: '0x2345678901234567890123456789012345678901' as `0x${string}`,
            supportDetailed: 1,
            votes: '7',
            weight: 7,
            reason: 'This makes sense. Long-term thinking benefits everyone.',
            transactionHash: '0x851db7da28c561934d77994a90480a5bc23da69c93287952decc6542cdaea3d1' as `0x${string}`,
            blockTimestamp: (now - 43200).toString(),
            timestamp: (now - 43200).toString(),
            nouns: [{ id: '6' }, { id: '7' }, { id: '8' }, { id: '9' }, { id: '10' }, { id: '11' }, { id: '12' }],
          },
          {
            id: 'vote-3',
            voterAddress: '0x3456789012345678901234567890123456789012' as `0x${string}`,
            supportDetailed: 1,
            votes: '3',
            weight: 3,
            reason: 'Agreed. Building their projects, instead of just building something for quick funding and letting it fade away. When incentives line up with real usage, everyone wins, users get better tools, developers stay engaged, and the DAO doesn\'t end up wasting funds on projects that go quiet after a few months. That\'s what healthy growth looks like.',
            transactionHash: '0x951db7da28c561934d77994a90480a5bc23da69c93287952decc6542cdaea3d2' as `0x${string}`,
            blockTimestamp: (now - 21600).toString(),
            timestamp: (now - 21600).toString(),
            nouns: [{ id: '13' }, { id: '14' }, { id: '15' }],
          },
          {
            id: 'vote-4',
            voterAddress: '0x4567890123456789012345678901234567890123' as `0x${string}`,
            supportDetailed: 0,
            votes: '2',
            weight: 2,
            reason: 'I think the current system works fine. This adds unnecessary complexity.',
            transactionHash: '0xa51db7da28c561934d77994a90480a5bc23da69c93287952decc6542cdaea3d3' as `0x${string}`,
            blockTimestamp: (now - 18000).toString(),
            timestamp: (now - 18000).toString(),
            nouns: [{ id: '16' }, { id: '17' }],
          },
          {
            id: 'vote-5',
            voterAddress: '0x5678901234567890123456789012345678901234' as `0x${string}`,
            supportDetailed: 0,
            votes: '1',
            weight: 1,
            reason: 'Need more details on implementation before supporting.',
            transactionHash: '0xb51db7da28c561934d77994a90480a5bc23da69c93287952decc6542cdaea3d4' as `0x${string}`,
            blockTimestamp: (now - 10800).toString(),
            timestamp: (now - 10800).toString(),
            nouns: [{ id: '18' }],
          },
          {
            id: 'vote-6',
            voterAddress: '0x6789012345678901234567890123456789012345' as `0x${string}`,
            supportDetailed: 2,
            votes: '2',
            weight: 2,
            reason: 'Neutral on this. Will observe how it develops.',
            transactionHash: '0xc51db7da28c561934d77994a90480a5bc23da69c93287952decc6542cdaea3d5' as `0x${string}`,
            blockTimestamp: (now - 7200).toString(),
            timestamp: (now - 7200).toString(),
            nouns: [{ id: '19' }, { id: '20' }],
          },
        ],
      }
    }
    
    return null
  }

  const dummyProposal = createDummyProposal()
  
  const { data: proposal, isLoading } = useQuery({
    queryKey: ['proposal', proposalId.toString(), isNounsDao ? 'nouns' : 'lilnouns'],
    queryFn: () => getProposal(proposalId.toString(), isNounsDao ? 'nouns' : 'lilnouns'),
    enabled: !dummyProposal,
  })

  const finalProposal = dummyProposal || proposal

  if (isLoading && !dummyProposal) {
    return <Skeleton className="h-[112px] w-full" />
  }

  if (!finalProposal) {
    return null
  }

  return (
    <VotingSummary
      forVotes={finalProposal.forVotes}
      againstVotes={finalProposal.againstVotes}
      abstainVotes={finalProposal.abstainVotes}
      quorumVotes={finalProposal.quorumVotes}
      proposal={finalProposal}
      alwaysShowAbstain={true}
      isNounsDao={isNounsDao}
    />
  )
}

function VotesWrapper({ proposalId, isNounsDao }: { proposalId: number; isNounsDao: boolean }) {
  const { filterValue } = useFilterContext();
  const isSepolia = isSepoliaNetwork()
  
  // Create dummy proposal data if it's a test proposal
  const createDummyProposal = (): DetailedProposal | null => {
    if (!isSepolia) return null
    
    if (proposalId === 999999 || proposalId === 999998) {
      const now = Math.floor(Date.now() / 1000)
      const votingEndTimestamp = now + (7 * 24 * 60 * 60)
      const isCandidate = proposalId === 999998
      
      return {
        id: proposalId,
        title: isCandidate ? 'Test Candidate Proposal' : 'Sunset Nouns 95',
        proposerAddress: '0xa7C37f79ff5E6F932147fC69724B6ED432CA6Aa7' as `0x${string}`,
        forVotes: isCandidate ? 0 : 15,
        againstVotes: isCandidate ? 0 : 3,
        abstainVotes: isCandidate ? 0 : 2,
        quorumVotes: 10,
        state: 'active',
        creationBlock: 0,
        votingStartBlock: 0,
        votingStartTimestamp: now,
        votingEndBlock: 0,
        votingEndTimestamp: votingEndTimestamp,
        isDummy: true,
        isTestCandidate: isCandidate,
        description: isCandidate 
          ? 'This is a test candidate proposal for Sepolia testing. Candidates can be updated and signed before being promoted to full proposals.'
          : `This proposal aims to improve the alignment between client incentives and long-term project sustainability. 

The current system sometimes incentivizes quick funding grabs rather than sustainable development. We propose adjusting the incentive structure to reward developers for building their projects, instead of just building something for quick funding and letting it fade away.

When incentives line up with real usage, everyone wins, users get better tools, developers stay engaged, and the DAO doesn\'t end up wasting funds on projects that go quiet after a few months. That\'s what healthy growth looks like.

If client owners feel their current share or incentives from the DAO aren\'t enough, they can always put together a proposal to adjust the program parameters. The system is already there to support them, it just needs to be used the right way.`,
        transactions: isCandidate ? [] : [
          {
            to: '0xa7C37f79ff5E6F932147fC69724B6ED432CA6Aa7' as `0x${string}`,
            signature: '_setImplementation(address)',
            value: BigInt(0),
            calldata: '0x' as `0x${string}`,
          },
          {
            to: '0xa7C37f79ff5E6F932147fC69724B6ED432CA6Aa7' as `0x${string}`,
            signature: '_setLastMinuteWindowInBlocks(uint32)',
            value: BigInt(0),
            calldata: '0x' as `0x${string}`,
          },
          {
            to: '0xa7C37f79ff5E6F932147fC69724B6ED432CA6Aa7' as `0x${string}`,
            signature: '_setObjectionPeriodDurationInBlocks(uint32)',
            value: BigInt(0),
            calldata: '0x' as `0x${string}`,
          },
          {
            to: '0xa7C37f79ff5E6F932147fC69724B6ED432CA6Aa7' as `0x${string}`,
            signature: '_setProposalUpdatablePeriodInBlocks(uint32)',
            value: BigInt(0),
            calldata: '0x' as `0x${string}`,
          },
        ],
        votes: isCandidate ? [] : [
          {
            id: 'vote-1',
            voterAddress: '0x1234567890123456789012345678901234567890' as `0x${string}`,
            supportDetailed: 1,
            votes: '5',
            weight: 5,
            reason: 'Strongly support this. We need better alignment between incentives and actual usage. Too many projects get funded and then disappear.',
            transactionHash: '0x751db7da28c561934d77994a90480a5bc23da69c93287952decc6542cdaea3d0' as `0x${string}`,
            blockTimestamp: (now - 86400).toString(),
            timestamp: (now - 86400).toString(),
            nouns: [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }, { id: '5' }],
          },
          {
            id: 'vote-2',
            voterAddress: '0x2345678901234567890123456789012345678901' as `0x${string}`,
            supportDetailed: 1,
            votes: '7',
            weight: 7,
            reason: 'This makes sense. Long-term thinking benefits everyone.',
            transactionHash: '0x851db7da28c561934d77994a90480a5bc23da69c93287952decc6542cdaea3d1' as `0x${string}`,
            blockTimestamp: (now - 43200).toString(),
            timestamp: (now - 43200).toString(),
            nouns: [{ id: '6' }, { id: '7' }, { id: '8' }, { id: '9' }, { id: '10' }, { id: '11' }, { id: '12' }],
          },
          {
            id: 'vote-3',
            voterAddress: '0x3456789012345678901234567890123456789012' as `0x${string}`,
            supportDetailed: 1,
            votes: '3',
            weight: 3,
            reason: 'Agreed. Building their projects, instead of just building something for quick funding and letting it fade away. When incentives line up with real usage, everyone wins, users get better tools, developers stay engaged, and the DAO doesn\'t end up wasting funds on projects that go quiet after a few months. That\'s what healthy growth looks like.',
            transactionHash: '0x951db7da28c561934d77994a90480a5bc23da69c93287952decc6542cdaea3d2' as `0x${string}`,
            blockTimestamp: (now - 21600).toString(),
            timestamp: (now - 21600).toString(),
            nouns: [{ id: '13' }, { id: '14' }, { id: '15' }],
          },
          {
            id: 'vote-4',
            voterAddress: '0x4567890123456789012345678901234567890123' as `0x${string}`,
            supportDetailed: 0,
            votes: '2',
            weight: 2,
            reason: 'I think the current system works fine. This adds unnecessary complexity.',
            transactionHash: '0xa51db7da28c561934d77994a90480a5bc23da69c93287952decc6542cdaea3d3' as `0x${string}`,
            blockTimestamp: (now - 18000).toString(),
            timestamp: (now - 18000).toString(),
            nouns: [{ id: '16' }, { id: '17' }],
          },
          {
            id: 'vote-5',
            voterAddress: '0x5678901234567890123456789012345678901234' as `0x${string}`,
            supportDetailed: 0,
            votes: '1',
            weight: 1,
            reason: 'Need more details on implementation before supporting.',
            transactionHash: '0xb51db7da28c561934d77994a90480a5bc23da69c93287952decc6542cdaea3d4' as `0x${string}`,
            blockTimestamp: (now - 10800).toString(),
            timestamp: (now - 10800).toString(),
            nouns: [{ id: '18' }],
          },
          {
            id: 'vote-6',
            voterAddress: '0x6789012345678901234567890123456789012345' as `0x${string}`,
            supportDetailed: 2,
            votes: '2',
            weight: 2,
            reason: 'Neutral on this. Will observe how it develops.',
            transactionHash: '0xc51db7da28c561934d77994a90480a5bc23da69c93287952decc6542cdaea3d5' as `0x${string}`,
            blockTimestamp: (now - 7200).toString(),
            timestamp: (now - 7200).toString(),
            nouns: [{ id: '19' }, { id: '20' }],
          },
        ],
      }
    }
    
    return null
  }

  const dummyProposal = createDummyProposal()
  
  const { data: proposal, isLoading } = useQuery({
    queryKey: ['proposal', proposalId.toString(), isNounsDao ? 'nouns' : 'lilnouns'],
    queryFn: () => getProposal(proposalId.toString(), isNounsDao ? 'nouns' : 'lilnouns'),
    enabled: !dummyProposal,
  })
  
  const finalProposal = dummyProposal || proposal

  // Fetch Snapshot proposals for Nouns DAO proposals
  const { data: snapshotProposals = [] } = useQuery({
    queryKey: ['snapshot-proposals'],
    queryFn: () => getSnapshotProposals('leagueoflils.eth'),
    enabled: isNounsDao,
    staleTime: 5 * 60 * 1000,
  })

  const snapshotProposal = isNounsDao && finalProposal
    ? matchSnapshotProposal(finalProposal, snapshotProposals)
    : undefined

  // Fetch Snapshot votes if there's a matching Snapshot proposal
  const { data: snapshotVotes = [], isLoading: isLoadingSnapshotVotes } = useQuery({
    queryKey: ['snapshot-votes', snapshotProposal?.id],
    queryFn: () => getSnapshotVotes(snapshotProposal!.id),
    enabled: !!snapshotProposal,
    staleTime: 5 * 60 * 1000,
  })

  // Fetch delegates to map Snapshot voters to Lil Nouns token IDs
  const { data: delegates = [] } = useQuery({
    queryKey: ['delegates'],
    queryFn: () => getDelegates(),
    enabled: isNounsDao && !!snapshotProposal,
    staleTime: 5 * 60 * 1000,
  })
  
  // Combine votes from both sources
  const combinedVotes = useMemo(() => {
    if (!isNounsDao || !snapshotProposal || !finalProposal) {
      return [];
    }

    const nounsVotes = finalProposal.votes || [];
    const snapshotVotesWithDelegates = snapshotVotes.map(vote => {
      const delegate = delegates.find(d => d.id.toLowerCase() === vote.voter.toLowerCase());
      const nounIds = delegate?.nounsRepresented.map((n: { id: string }) => n.id) || [];
      return { ...vote, nounIds, nounCount: nounIds.length };
    });

    // Group votes by voter address
    const votesByVoter = new Map<string, any[]>();

    // Add Nouns DAO votes
    nounsVotes.forEach(vote => {
      const key = vote.voterAddress.toLowerCase();
      if (!votesByVoter.has(key)) {
        votesByVoter.set(key, []);
      }
      votesByVoter.get(key)!.push({
        type: 'nouns',
        choice: vote.supportDetailed, // 0=Against, 1=For, 2=Abstain
        vp: vote.weight,
        voterAddress: vote.voterAddress,
        reason: vote.reason,
        timestamp: vote.timestamp,
        transactionHash: vote.transactionHash,
      });
    });

    // Add Snapshot votes
    snapshotVotesWithDelegates.forEach(vote => {
      const key = vote.voter.toLowerCase();
      if (!votesByVoter.has(key)) {
        votesByVoter.set(key, []);
      }
      votesByVoter.get(key)!.push({
        type: 'snapshot',
        // Snapshot (leagueoflils.eth): 1 = For, 2 = Against, 3 = Abstain
        // Convert to Nouns format: 0 = Against, 1 = For, 2 = Abstain
        choice: vote.choice === 1 ? 1 : vote.choice === 2 ? 0 : 2,
        vp: vote.vp,
        voter: vote.voter,
        reason: vote.reason,
      });
    });

    // Process combined votes
    const combined: any[] = [];
    
    votesByVoter.forEach((votes, voterAddress) => {
      const nounsVote = votes.find(v => v.type === 'nouns');
      const snapshotVote = votes.find(v => v.type === 'snapshot');

      if (nounsVote && snapshotVote) {
        // Same voter voted in both
        if (nounsVote.choice === snapshotVote.choice) {
          // Same direction - combine
          combined.push({
            voterAddress,
            choice: nounsVote.choice,
            nounsVp: nounsVote.vp,
            snapshotVp: snapshotVote.vp,
            totalVp: nounsVote.vp + snapshotVote.vp,
            nounsVote,
            snapshotVote,
            combined: true
          });
        } else {
          // Different direction - show separately
          combined.push(nounsVote);
          combined.push(snapshotVote);
        }
      } else if (nounsVote) {
        combined.push(nounsVote);
      } else if (snapshotVote) {
        combined.push(snapshotVote);
      }
    });

    return combined;
  }, [finalProposal, snapshotVotes, delegates, isNounsDao, snapshotProposal]);

  // Filter combined votes based on filter selection - MUST be before early returns to maintain hook order
  const filteredCombinedVotes = useMemo(() => {
    if (!combinedVotes) return [];
    if (filterValue === 'all') {
      return combinedVotes;
    } else if (filterValue === 'nouns') {
      // Show Nouns votes + combined votes (because they voted in Nouns)
      return combinedVotes.filter(vote => vote.type === 'nouns' || vote.combined);
    } else if (filterValue === 'lilnouns') {
      // Show Snapshot votes + combined votes (because they voted in Snapshot)
      return combinedVotes.filter(vote => vote.type === 'snapshot' || vote.combined);
    }
    return combinedVotes;
  }, [combinedVotes, filterValue]);

  if (isLoading && !dummyProposal) {
    return <LoadingSkeletons count={30} className="h-[80px] w-full" />
  }

  if (!finalProposal) {
    return null
  }

  // Determine which votes to show based on filter
  const showNounsVotes = filterValue === 'all' || filterValue === 'nouns';
  const showLilNounsVotes = filterValue === 'all' || filterValue === 'lilnouns';

  console.log('🔍 Filter debug:', {
    filterValue,
    combinedVotesCount: combinedVotes.length,
    filteredCount: filteredCombinedVotes.length,
  });

  return (
    <>
      {/* Nouns DAO votes (fallback when no combined votes) */}
      {showNounsVotes && (!isNounsDao || !snapshotProposal || combinedVotes.length === 0) && finalProposal && <FilteredSortedProposalVotes proposal={finalProposal} />}
      
      {/* Combined votes for Nouns DAO proposals */}
      {isNounsDao && snapshotProposal && combinedVotes.length > 0 && (
        <CombinedVotesList combinedVotes={filteredCombinedVotes} />
      )}
      
      {/* Snapshot votes only (fallback) */}
      {showLilNounsVotes && snapshotProposal && snapshotVotes.length > 0 && combinedVotes.length === 0 && !isNounsDao && (
        <SnapshotVotesList 
          snapshotVotes={snapshotVotes}
          delegates={delegates}
        />
      )}
      
      {/* Debug: Show if we have a snapshot proposal but no votes */}
      {isNounsDao && snapshotProposal && snapshotVotes.length === 0 && !isLoadingSnapshotVotes && (
        <div className="flex h-[120px] w-full items-center justify-center rounded-[12px] border bg-gray-100 px-6 py-4 text-center">
          <div className="flex flex-col gap-2">
            <p>No Snapshot votes found for this proposal yet.</p>
          </div>
        </div>
      )}
    </>
  )
}

function CombinedVotesList({ combinedVotes }: { combinedVotes: any[] }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h3 className="heading-6">Votes</h3>
        <span className="text-content-secondary paragraph-sm">({combinedVotes.length} voters)</span>
      </div>
      
      <div className="flex flex-col gap-4">
        {combinedVotes.map((vote, i) => (
          <CombinedVoteRow key={i} vote={vote} />
        ))}
      </div>
    </div>
  );
}

function CombinedVoteRow({ vote }: { vote: any }) {
  if (vote.combined) {
    // Same voter voted in both with same direction
    // Nouns format: 0 = Against, 1 = For, 2 = Abstain
    const choiceLabel = vote.choice === 1 ? 'for' : vote.choice === 0 ? 'against' : 'abstain';
    const choiceColor = vote.choice === 1 ? 'text-semantic-positive' :
                        vote.choice === 0 ? 'text-semantic-negative' :
                        'text-content-secondary';
    
    return (
      <div className="flex gap-4">
        <EnsAvatar
          address={getAddress(vote.voterAddress)}
          size={40}
          className="mt-1"
        />

        <div className="flex w-full min-w-0 flex-col justify-center gap-1 paragraph-sm">
          <div className={clsx("inline whitespace-pre-wrap label-md", choiceColor)}>
            <LinkExternal
              href={`${CHAIN_CONFIG.publicClient.chain?.blockExplorers?.default.url}/address/${vote.voterAddress}`}
              className="inline *:inline hover:underline"
            >
              <EnsName
                address={getAddress(vote.voterAddress)}
                className="inline text-content-primary *:inline"
              />
            </LinkExternal>{" "}
            voted {choiceLabel} ({vote.nounsVp} nouns, {vote.snapshotVp.toFixed(0)} lil nouns)
          </div>

          {(vote.nounsVote.reason || vote.snapshotVote.reason) && (
            <div className="paragraph-sm text-content-secondary">
              {vote.nounsVote.reason || vote.snapshotVote.reason}
            </div>
          )}
        </div>
      </div>
    );
  } else if (vote.type === 'nouns') {
    // Only Nouns DAO vote
    return <ProposalVoteRow vote={vote} isNouns={true} />;
  } else {
    // Only Snapshot vote
    return <ProposalVoteRow vote={vote} isNouns={false} />;
  }
}

function ProposalVoteRow({ vote, isNouns }: { vote: any; isNouns: boolean }) {
  // Nouns format: 0 = Against, 1 = For, 2 = Abstain
  const choiceLabel = vote.choice === 1 ? 'for' : vote.choice === 0 ? 'against' : 'abstain';
  const choiceColor = vote.choice === 1 ? 'text-semantic-positive' :
                      vote.choice === 0 ? 'text-semantic-negative' :
                      'text-content-secondary';
  
  const voterAddress = isNouns ? vote.voterAddress : vote.voter;
  const vp = vote.vp;
  const tokenType = isNouns ? 'nouns' : 'lil nouns';

  return (
    <div className="flex gap-4">
      <EnsAvatar
        address={getAddress(voterAddress)}
        size={40}
        className="mt-1"
      />

      <div className="flex w-full min-w-0 flex-col justify-center gap-1 paragraph-sm">
        <div className={clsx("inline whitespace-pre-wrap label-md", choiceColor)}>
          <LinkExternal
            href={`${CHAIN_CONFIG.publicClient.chain?.blockExplorers?.default.url}/address/${voterAddress}`}
            className="inline *:inline hover:underline"
          >
            <EnsName
              address={getAddress(voterAddress)}
              className="inline text-content-primary *:inline"
            />
          </LinkExternal>{" "}
          voted {choiceLabel} ({vp} {tokenType})
        </div>

        {vote.reason && (
          <div className="paragraph-sm text-content-secondary">
            {vote.reason}
          </div>
        )}
      </div>
    </div>
  );
}

function SnapshotVotesList({  
  snapshotVotes, 
  delegates 
}: { 
  snapshotVotes: SnapshotVoteType[];
  delegates: Delegate[];
}) {
  console.log('📋 SnapshotVotesList rendering:', { votesCount: snapshotVotes.length, delegatesCount: delegates.length });
  
  // Map Snapshot voters to their Lil Nouns token IDs
  const mappedVotes = snapshotVotes.map(vote => {
    const delegate = delegates.find(d => d.id.toLowerCase() === vote.voter.toLowerCase());
    const nounIds = delegate?.nounsRepresented.map((n: { id: string }) => n.id) || [];
    
    return {
      ...vote,
      nounIds,
      nounCount: nounIds.length,
    };
  });

  console.log('📋 Mapped votes:', mappedVotes);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h3 className="heading-6">Lil Nouns Snapshot Votes</h3>
        <span className="text-content-secondary paragraph-sm">({snapshotVotes.length} voters)</span>
      </div>
      
      <div className="flex flex-col gap-4">
        {mappedVotes.map((vote, i) => (
          <SnapshotVoteRow key={i} vote={vote} />
        ))}
      </div>
    </div>
  );
}
function SnapshotVoteRow({ vote }: { vote: SnapshotVoteType & { nounIds: string[]; nounCount: number } }) {
  // Snapshot (leagueoflils.eth): 1 = For, 2 = Against, 3 = Abstain
  const choiceLabel = vote.choice === 1 ? 'for' : vote.choice === 2 ? 'against' : 'abstain';
  const choiceColor = vote.choice === 1 ? 'text-semantic-positive' :
                      vote.choice === 2 ? 'text-semantic-negative' : 'text-content-secondary';

  return (
    <div className="flex gap-4">
      <EnsAvatar
        address={getAddress(vote.voter)}
        size={40}
        className="mt-1"
      />

      <div className="flex w-full min-w-0 flex-col justify-center gap-1 paragraph-sm">
        <div className={clsx("inline whitespace-pre-wrap label-md", choiceColor)}>
          <LinkExternal
            href={`${CHAIN_CONFIG.publicClient.chain?.blockExplorers?.default.url}/address/${vote.voter}`}
            className="inline *:inline hover:underline"
          >
            <EnsName
              address={getAddress(vote.voter)}
              className="inline text-content-primary *:inline"
            />
          </LinkExternal>{" "}
          voted {choiceLabel} ({vote.vp.toFixed(0)} {vote.vp === 1 ? 'lil noun' : 'lil nouns'})
        </div>

        {vote.reason && (
          <div className="paragraph-sm text-content-secondary">
            {vote.reason}
          </div>
        )}
      </div>
    </div>
  );
}

function CreateVoteWrapper({ proposalId }: { proposalId: number }) {
  const isSepolia = isSepoliaNetwork()
  
  // Create dummy proposal data if it's a test proposal (same logic as ProposalTopWrapper)
  const createDummyProposal = (): DetailedProposal | null => {
    if (!isSepolia) return null
    
    if (proposalId === 999999 || proposalId === 999998) {
      const now = Math.floor(Date.now() / 1000)
      const votingEndTimestamp = now + (7 * 24 * 60 * 60)
      const isCandidate = proposalId === 999998
      
      return {
        id: proposalId,
        title: isCandidate ? 'Test Candidate Proposal' : 'Sunset Nouns 95',
        proposerAddress: '0xa7C37f79ff5E6F932147fC69724B6ED432CA6Aa7' as `0x${string}`,
        forVotes: isCandidate ? 0 : 15,
        againstVotes: isCandidate ? 0 : 3,
        abstainVotes: isCandidate ? 0 : 2,
        quorumVotes: 10,
        state: 'active',
        creationBlock: 0,
        votingStartBlock: 0,
        votingStartTimestamp: now,
        votingEndBlock: 0,
        votingEndTimestamp: votingEndTimestamp,
        isDummy: true,
        isTestCandidate: isCandidate,
        description: isCandidate 
          ? 'This is a test candidate proposal for Sepolia testing. Candidates can be updated and signed before being promoted to full proposals.'
          : `This proposal aims to improve the alignment between client incentives and long-term project sustainability. 

The current system sometimes incentivizes quick funding grabs rather than sustainable development. We propose adjusting the incentive structure to reward developers for building their projects, instead of just building something for quick funding and letting it fade away.

When incentives line up with real usage, everyone wins, users get better tools, developers stay engaged, and the DAO doesn\'t end up wasting funds on projects that go quiet after a few months. That\'s what healthy growth looks like.

If client owners feel their current share or incentives from the DAO aren\'t enough, they can always put together a proposal to adjust the program parameters. The system is already there to support them, it just needs to be used the right way.`,
        transactions: isCandidate ? [] : [
          {
            to: '0xa7C37f79ff5E6F932147fC69724B6ED432CA6Aa7' as `0x${string}`,
            signature: '_setImplementation(address)',
            value: BigInt(0),
            calldata: '0x' as `0x${string}`,
          },
          {
            to: '0xa7C37f79ff5E6F932147fC69724B6ED432CA6Aa7' as `0x${string}`,
            signature: '_setLastMinuteWindowInBlocks(uint32)',
            value: BigInt(0),
            calldata: '0x' as `0x${string}`,
          },
          {
            to: '0xa7C37f79ff5E6F932147fC69724B6ED432CA6Aa7' as `0x${string}`,
            signature: '_setObjectionPeriodDurationInBlocks(uint32)',
            value: BigInt(0),
            calldata: '0x' as `0x${string}`,
          },
          {
            to: '0xa7C37f79ff5E6F932147fC69724B6ED432CA6Aa7' as `0x${string}`,
            signature: '_setProposalUpdatablePeriodInBlocks(uint32)',
            value: BigInt(0),
            calldata: '0x' as `0x${string}`,
          },
        ],
        votes: isCandidate ? [] : [
          {
            id: 'vote-1',
            voterAddress: '0x1234567890123456789012345678901234567890' as `0x${string}`,
            supportDetailed: 1,
            votes: '5',
            weight: 5,
            reason: 'Strongly support this. We need better alignment between incentives and actual usage. Too many projects get funded and then disappear.',
            transactionHash: '0x751db7da28c561934d77994a90480a5bc23da69c93287952decc6542cdaea3d0' as `0x${string}`,
            blockTimestamp: (now - 86400).toString(),
            timestamp: (now - 86400).toString(),
            nouns: [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }, { id: '5' }],
          },
          {
            id: 'vote-2',
            voterAddress: '0x2345678901234567890123456789012345678901' as `0x${string}`,
            supportDetailed: 1,
            votes: '7',
            weight: 7,
            reason: 'This makes sense. Long-term thinking benefits everyone.',
            transactionHash: '0x851db7da28c561934d77994a90480a5bc23da69c93287952decc6542cdaea3d1' as `0x${string}`,
            blockTimestamp: (now - 43200).toString(),
            timestamp: (now - 43200).toString(),
            nouns: [{ id: '6' }, { id: '7' }, { id: '8' }, { id: '9' }, { id: '10' }, { id: '11' }, { id: '12' }],
          },
          {
            id: 'vote-3',
            voterAddress: '0x3456789012345678901234567890123456789012' as `0x${string}`,
            supportDetailed: 1,
            votes: '3',
            weight: 3,
            reason: 'Agreed. Building their projects, instead of just building something for quick funding and letting it fade away. When incentives line up with real usage, everyone wins, users get better tools, developers stay engaged, and the DAO doesn\'t end up wasting funds on projects that go quiet after a few months. That\'s what healthy growth looks like.',
            transactionHash: '0x951db7da28c561934d77994a90480a5bc23da69c93287952decc6542cdaea3d2' as `0x${string}`,
            blockTimestamp: (now - 21600).toString(),
            timestamp: (now - 21600).toString(),
            nouns: [{ id: '13' }, { id: '14' }, { id: '15' }],
          },
          {
            id: 'vote-4',
            voterAddress: '0x4567890123456789012345678901234567890123' as `0x${string}`,
            supportDetailed: 0,
            votes: '2',
            weight: 2,
            reason: 'I think the current system works fine. This adds unnecessary complexity.',
            transactionHash: '0xa51db7da28c561934d77994a90480a5bc23da69c93287952decc6542cdaea3d3' as `0x${string}`,
            blockTimestamp: (now - 18000).toString(),
            timestamp: (now - 18000).toString(),
            nouns: [{ id: '16' }, { id: '17' }],
          },
          {
            id: 'vote-5',
            voterAddress: '0x5678901234567890123456789012345678901234' as `0x${string}`,
            supportDetailed: 0,
            votes: '1',
            weight: 1,
            reason: 'Need more details on implementation before supporting.',
            transactionHash: '0xb51db7da28c561934d77994a90480a5bc23da69c93287952decc6542cdaea3d4' as `0x${string}`,
            blockTimestamp: (now - 10800).toString(),
            timestamp: (now - 10800).toString(),
            nouns: [{ id: '18' }],
          },
          {
            id: 'vote-6',
            voterAddress: '0x6789012345678901234567890123456789012345' as `0x${string}`,
            supportDetailed: 2,
            votes: '2',
            weight: 2,
            reason: 'Neutral on this. Will observe how it develops.',
            transactionHash: '0xc51db7da28c561934d77994a90480a5bc23da69c93287952decc6542cdaea3d5' as `0x${string}`,
            blockTimestamp: (now - 7200).toString(),
            timestamp: (now - 7200).toString(),
            nouns: [{ id: '19' }, { id: '20' }],
          },
        ],
      }
    }
    
    return null
  }

  const dummyProposal = createDummyProposal()
  
  const { data: proposal } = useQuery({
    queryKey: ['proposal', proposalId.toString(), 'lilnouns'],
    queryFn: () => getProposal(proposalId.toString(), 'lilnouns'),
    enabled: !dummyProposal,
  })

  const finalProposal = dummyProposal || proposal

  if (!finalProposal || finalProposal.state !== "active") {
    return null
  }

  return <CreateVote proposal={finalProposal} />
}




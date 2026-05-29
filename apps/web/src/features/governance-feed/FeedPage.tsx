import { Helmet } from "react-helmet-async";

import { DarkGovernanceActivityFeed } from "./components";
import { useGovernanceFeedData } from "./useGovernanceFeedData";

export default function FeedPage() {
  const { feedItems, isLoading, error } = useGovernanceFeedData();

  return (
    <>
      <Helmet>
        <title>Governance Feed | Lil Nouns DAO</title>
        <meta
          name="description"
          content="Follow Lil Nouns proposal, candidate, topic, auction, and VRGDA governance activity in one feed."
        />
        <link rel="canonical" href="https://lilnouns.club/feed" />
        <meta property="og:title" content="Governance Feed | Lil Nouns DAO" />
        <meta
          property="og:description"
          content="Follow Lil Nouns governance activity across proposals, candidates, topics, auctions, and VRGDA updates."
        />
      </Helmet>

      <div className="min-h-[calc(100vh-64px)] w-full bg-background-primary text-content-primary">
        <div className="mx-auto flex w-full max-w-[980px] flex-col gap-8 px-5 py-8 pb-24 md:px-10">
          <div className="flex flex-col gap-2">
            <span className="label-sm text-content-secondary">Governance activity</span>
            <h1 className="heading-3 text-content-primary">Feed</h1>
          </div>

          <DarkGovernanceActivityFeed items={feedItems} isLoading={isLoading} error={error} />
        </div>
      </div>
    </>
  );
}

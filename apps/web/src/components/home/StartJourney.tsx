//
import Image from "@/components/OptimizedImage";
import { Button } from "@/components/ui/button";
//
import { Link } from "react-router-dom";
import JoinTwitter from "@/components/JoinTwitter";
import FeatureHighlightCard from "@/components/FeatureHighlightCard";
import JoinDiscordCommunity from "@/components/JoinDiscordCommunity";
import AlreadyOwnANounCard from "./AlreadyOwnANoun/AlreadyOwnANounCard";

export default function StartJourney() {
  return (
    <section className="flex w-full max-w-[1680px] flex-col items-center justify-center gap-8 px-6 md:gap-16 md:px-10">
      <div className="flex flex-col items-center justify-center gap-2 px-6 text-center md:px-10">
        <h2>Your journey starts here</h2>
        <div className="max-w-[660px] paragraph-lg">
          Whether you're an artist, technologist, scientist, athlete, or someone
          with big ideas, there's a place for you in the Lils community. Here are some ways to get started.
        </div>
      </div>

      <div className="flex w-full min-w-0 max-w-[1600px] flex-col gap-6 md:flex-row md:gap-10">

       <FeatureHighlightCard
         href="/"
         iconSrc="/feature/bid/icon.svg"
         buttonLabel="View Current Auction"
         description="Become a Lil Nouner and join the DAO."
         className="bg-background-secondary"
       >
         <Image
           src="/lilauction.png"
           width={400}
           height={332}
           alt="Buy Lil Nouns"
           className="h-[332px] w-full object-cover"
         />
       </FeatureHighlightCard>
       <FeatureHighlightCard
         href="/vote"
         iconSrc="/feature/proposals/icon.svg"
         buttonLabel="Browse Proposals"
         description="See how the DAO spends its treasury funding wild ideas."
         className="bg-background-secondary"
       >
         <Image
           src="lilrome.gif"
           width={400}
           height={332}
           alt="Buy Secondary Nouns"
           className="h-[332px] w-full object-cover"
         />
       </FeatureHighlightCard>
       <FeatureHighlightCard
         href="https://discord.gg/X6gpawuBaX"
         iconSrc="/feature/shop/icon.svg"
         buttonLabel="Join Discord"
         description="Meet 3,600+ Lils building the future together."
         className="bg-background-secondary"
       >
         <Image
           src="/lilstalking.gif"
           width={400}
           height={332}
           alt="Lil nouns Talking"
           className="h-[332px] w-full object-cover"
         />
       </FeatureHighlightCard>
       <FeatureHighlightCard
         href="/candidates"
         iconSrc="/feature/build/icon.svg"
         buttonLabel="Start Building"
         description="Get funded to build your Nounish idea."
         className="bg-background-secondary"
       >
         <Image
           src="/lilbuilders.png"
           width={400}
           height={332}
           alt="Buy Secondary Nouns"
           className="h-[332px] w-full object-cover"
         />
       </FeatureHighlightCard>
      </div>
    </section>
  );
}

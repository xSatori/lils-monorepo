import Image from "@/components/OptimizedImage";
import { LinkExternal } from "./ui/link";
import { Button } from "./ui/button";
import Icon from "./ui/Icon";

export default function JoinDiscordCommunity() {
  return (
    <LinkExternal
      href="https://discord.gg/X6gpawuBaX"
      className="flex w-full flex-1 flex-col items-center justify-start gap-6 overflow-hidden rounded-3xl bg-[#5865F2] p-6 text-center text-white md:p-12"
    >
      <Image
        src="/socials/discord.svg"
        width={48}
        height={48}
        alt="Discord"
      />
      <div className="flex flex-col items-center justify-center gap-4 text-center">
        <h2 className="text-center text-white">Join the Lil Nouns Community</h2>
        <div className="max-w-[640px] text-center text-gray-200 paragraph-lg">
          Join the conversation on Discord, where we host community calls and discussions. 
          Share your ideas, connect with the Lil Nouns community.
        </div>
      </div>
      <Button
        variant="secondary"
        className="flex gap-2.5 rounded-full border-none label-lg"
      >
        <span>Join Lil Nouns on Discord</span>
        <Icon icon="arrowUpRight" size={24} className="fill-content-primary" />
      </Button>
      <div className="flex items-center justify-center gap-1.5">
        <span>3k+ Members</span>
      </div>
    </LinkExternal>
  );
}

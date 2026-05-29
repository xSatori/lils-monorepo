import { IconType } from "@/components/ui/Icon";
import { isDaoVersion5 } from "@/utils/daoVersion";

export interface NavItem {
  name: string;
  icon: IconType;
  href: string;
  new?: boolean;
}

export interface NavProps {
  items: NavItem[];
}

const ALL_DESKTOP_NAV_ITEMS: NavItem[] = [
  { name: "Explore", icon: "layers", href: "/explore" },
  { name: "Vote", icon: "vote", href: "/vote" },
  // { name: "Stats", icon: "stats", href: "/stats" },
  { name: "Ideas", icon: "vote", href: "/candidates" },
  { name: "Topics", icon: "lightning", href: "/topics" },
  { name: "Feed", icon: "clock", href: "/feed" },
  { name: "Learn", icon: "book", href: "/learn" },
];

const ALL_MOBILE_NAV_ITEMS: NavItem[] = [
  { name: "Home", icon: "home", href: "/" },
  { name: "Explore", icon: "layers", href: "/explore" },
  { name: "Vote", icon: "vote", href: "/vote" },
  { name: "Ideas", icon: "lightning", href: "/candidates" },
  { name: "Feed", icon: "clock", href: "/feed" },
  { name: "Learn", icon: "book", href: "/learn" },
  // { name: "Stats", icon: "stats", href: "/stats" },
];

// Filter nav items based on DAO version.
// Hide topics and ideas (candidates) before v5 support exists.
export const DESKTOP_NAV_ITEMS: NavItem[] = isDaoVersion5()
  ? ALL_DESKTOP_NAV_ITEMS
  : ALL_DESKTOP_NAV_ITEMS.filter(
      (item) => item.href !== "/topics" && item.href !== "/candidates"
    );

export const MOBILE_NAV_ITEMS: NavItem[] = isDaoVersion5()
  ? ALL_MOBILE_NAV_ITEMS
  : ALL_MOBILE_NAV_ITEMS.filter(
      (item) => item.href !== "/topics" && item.href !== "/candidates"
    );

import { IconType } from "@/components/ui/Icon";
import { isDaoVersion5 } from "@/utils/daoVersion";

export interface NavItem {
  name: string;
  icon: IconType;
  href: string;
  new?: boolean;
  children?: NavItem[];
}

export interface NavProps {
  items: NavItem[];
}

const ALL_DESKTOP_NAV_ITEMS: NavItem[] = [
  { name: "Explore", icon: "layers", href: "/explore" },
  {
    name: "Play",
    icon: "vote",
    href: "/vote",
    children: [
      { name: "Vote", icon: "vote", href: "/vote" },
      { name: "Ideas", icon: "vote", href: "/candidates" },
      { name: "Topics", icon: "lightning", href: "/topics" },
    ],
  },
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

const hideV5OnlyNavItem = (item: NavItem) =>
  item.href === "/topics" || item.href === "/candidates";

const filterNavItemsForDaoVersion = (items: NavItem[]) =>
  items
    .filter((item) => !hideV5OnlyNavItem(item))
    .map((item) => ({
      ...item,
      children: item.children?.filter((child) => !hideV5OnlyNavItem(child)),
    }));

// Filter nav items based on DAO version.
// Hide topics and ideas (candidates) before v5 support exists.
export const DESKTOP_NAV_ITEMS: NavItem[] = isDaoVersion5()
  ? ALL_DESKTOP_NAV_ITEMS
  : filterNavItemsForDaoVersion(ALL_DESKTOP_NAV_ITEMS);

export const MOBILE_NAV_ITEMS: NavItem[] = isDaoVersion5()
  ? ALL_MOBILE_NAV_ITEMS
  : filterNavItemsForDaoVersion(ALL_MOBILE_NAV_ITEMS);

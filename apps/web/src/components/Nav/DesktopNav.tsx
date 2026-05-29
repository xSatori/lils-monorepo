import { useState } from "react";
import { useLocation } from "react-router-dom";
import { twMerge } from "tailwind-merge";
import { Link } from "react-router-dom";
import Icon from "../ui/Icon";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { DESKTOP_NAV_ITEMS, NavItem } from "./navConfig";

function isNavItemActive(item: NavItem, pathName: string) {
  if (!pathName) {
    return false;
  }

  const matchesItem =
    item.href === "/" ? pathName === item.href : pathName.includes(item.href);
  const matchesChild = item.children?.some((child) =>
    child.href === "/"
      ? pathName === child.href
      : pathName.includes(child.href),
  );

  return matchesItem || Boolean(matchesChild);
}

function navItemClassName(active: boolean) {
  return twMerge(
    "flex items-center gap-2.5 px-[12px] py-1 transition-all",
    active
      ? "text-content-primary"
      : "text-content-secondary hover:text-content-primary",
  );
}

export default function DesktopNav() {
  const location = useLocation();
  const pathName = location.pathname;
  const [openItem, setOpenItem] = useState<string | null>(null);

  return (
    <div className="hidden gap-2 md:flex">
      {DESKTOP_NAV_ITEMS.map((item, i) => {
        const active = isNavItemActive(item, pathName);

        if (item.children?.length) {
          return (
            <Popover
              key={item.name}
              open={openItem === item.name}
              onOpenChange={(open) => setOpenItem(open ? item.name : null)}
            >
              <PopoverTrigger asChild>
                <button type="button" className={navItemClassName(active)}>
                  <span className="text-[12px] font-bold leading-[16px] md:label-md">
                    {item.name}
                  </span>
                  <Icon
                    icon="chevronDown"
                    size={14}
                    className={twMerge(
                      "fill-current transition-transform",
                      openItem === item.name ? "rotate-180" : "",
                    )}
                  />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                sideOffset={10}
                className="w-[180px] rounded-lg border-2 border-gray-200 bg-white p-2 text-gray-900 shadow-lg"
              >
                <div className="flex flex-col gap-1">
                  {item.children.map((child) => {
                    const childActive = isNavItemActive(child, pathName);

                    return (
                      <Link
                        key={child.href}
                        to={child.href}
                        className={twMerge(
                          "rounded-md px-3 py-2 transition-colors label-md",
                          childActive
                            ? "bg-gray-100 text-content-primary"
                            : "text-content-secondary hover:bg-gray-100 hover:text-content-primary",
                        )}
                        onClick={() => setOpenItem(null)}
                      >
                        {child.name}
                      </Link>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
          );
        }

        return (
          <Link to={item.href} className={navItemClassName(active)} key={i}>
            <span className="text-[12px] font-bold leading-[16px] md:label-md">
              {item.name}
            </span>
            {item.new && (
              <div className="rounded-full bg-semantic-accent px-2 py-1 text-white label-sm">
                New
              </div>
            )}
          </Link>
        );
      })}
    </div>
  );
}

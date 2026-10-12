"use client";

import { ChartNoAxesColumn, Contact, FileText, Inbox, Mail, Send, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/dashboard", label: "Overview", icon: ChartNoAxesColumn, exact: true },
  { href: "/dashboard/campaigns", label: "Campaigns", icon: Send },
  { href: "/dashboard/emails", label: "Emails", icon: Mail },
  { href: "/dashboard/replies", label: "Replies", icon: Inbox },
  { href: "/dashboard/templates", label: "Templates", icon: FileText },
  { href: "/dashboard/contacts", label: "Contacts", icon: Contact },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

type Orientation = "vertical" | "horizontal";

/** Counts shown next to items, keyed by href (e.g. unread replies). */
type Badges = Partial<Record<string, number>>;

export function SidebarNav({ orientation = "vertical", badges }: { orientation?: Orientation; badges?: Badges }) {
  return <SidebarNavList orientation={orientation} pathname={usePathname()} badges={badges} />;
}

/** Renders without reading the URL, so it can be a Suspense fallback on dynamic routes. */
export function SidebarNavList({
  orientation = "vertical",
  pathname,
  badges,
}: {
  orientation?: Orientation;
  pathname: string | null;
  badges?: Badges;
}) {
  const horizontal = orientation === "horizontal";

  return (
    <nav aria-label="Dashboard">
      <ul className={cn("flex gap-0.5", horizontal ? "flex-row overflow-x-auto" : "flex-col")}>
        {ITEMS.map(({ href, label, icon: Icon, exact }) => {
          const active = pathname != null && (exact ? pathname === href : pathname.startsWith(href));
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm whitespace-nowrap transition-colors duration-150",
                  active ? "bg-white/[0.06] text-text" : "text-muted hover:bg-white/[0.03] hover:text-text",
                )}
              >
                <Icon className={cn("size-4", active ? "text-glow" : "text-faint")} strokeWidth={1.75} />
                {label}
                {!!badges?.[href] && (
                  <span className="ml-auto min-w-5 rounded-full bg-glow/15 px-1.5 text-center text-[11px] font-semibold text-glow tabular">
                    {badges[href]! > 99 ? "99+" : badges[href]}
                    <span className="sr-only"> unread</span>
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

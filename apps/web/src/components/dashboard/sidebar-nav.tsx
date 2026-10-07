"use client";

import { ChartNoAxesColumn, Contact, Send, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/dashboard", label: "Overview", icon: ChartNoAxesColumn, exact: true },
  { href: "/dashboard/campaigns", label: "Campaigns", icon: Send },
  { href: "/dashboard/contacts", label: "Contacts", icon: Contact },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function SidebarNav({ orientation = "vertical" }: { orientation?: "vertical" | "horizontal" }) {
  const pathname = usePathname();
  const horizontal = orientation === "horizontal";

  return (
    <nav aria-label="Dashboard">
      <ul className={cn("flex gap-0.5", horizontal ? "flex-row overflow-x-auto" : "flex-col")}>
        {ITEMS.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
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
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

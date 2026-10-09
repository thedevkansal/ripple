import { LogOut } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { LogoMark, Logo } from "@/components/brand/logo";
import { SidebarNav, SidebarNavList } from "@/components/dashboard/sidebar-nav";
import { WorkspaceSwitcher } from "@/components/dashboard/workspace-switcher";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { requireWorkspace } from "@/lib/workspace";
import { signOutAction } from "./actions";

export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-6 border-r border-line bg-chrome px-3 py-5 md:flex">
        <Link href="/" className="px-2" aria-label="Ripple home">
          <Logo />
        </Link>
        <Suspense fallback={<div className="h-[42px] rounded-xl border border-line" />}>
          <Workspaces />
        </Suspense>
        <Suspense fallback={<SidebarNavList pathname={null} />}>
          <SidebarNav />
        </Suspense>
        <div className="mt-auto">
          <Suspense fallback={<div className="h-12" />}>
            <UserMenu />
          </Suspense>
        </div>
      </aside>

      <header className="sticky top-0 z-40 flex flex-col gap-3 border-b border-line bg-chrome px-4 pt-3 pb-2 backdrop-blur-xl md:hidden">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" aria-label="Ripple home">
            <LogoMark />
          </Link>
          <div className="min-w-0 flex-1">
            <Suspense fallback={null}>
              <Workspaces />
            </Suspense>
          </div>
          <ThemeToggle />
        </div>
        <Suspense fallback={<SidebarNavList orientation="horizontal" pathname={null} />}>
          <SidebarNav orientation="horizontal" />
        </Suspense>
      </header>

      <main className="min-w-0 flex-1">
        <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
      </main>
    </div>
  );
}

async function Workspaces() {
  const { workspace, memberships } = await requireWorkspace();
  return (
    <WorkspaceSwitcher currentId={workspace.id} workspaces={memberships.map((m) => m.workspace)} />
  );
}

async function UserMenu() {
  const { user } = await requireWorkspace();
  return (
    <div className="flex items-center gap-3 rounded-xl px-2 py-2">
      {user.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.image} alt="" className="size-8 rounded-full" referrerPolicy="no-referrer" />
      ) : (
        <span className="grid size-8 place-items-center rounded-full bg-white/10 text-xs">
          {(user.name ?? user.email ?? "?").charAt(0).toUpperCase()}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{user.name}</p>
        <p className="truncate text-xs text-faint">{user.email}</p>
      </div>
      <ThemeToggle className="size-8 rounded-lg" />
      <form action={signOutAction}>
        <button
          type="submit"
          className="press grid size-8 place-items-center rounded-lg text-faint hover:bg-white/5 hover:text-text"
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut className="size-4" />
        </button>
      </form>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-8">
      <div className="h-8 w-48 animate-pulse rounded-lg bg-white/5" />
      <div className="mt-8 h-40 animate-pulse rounded-2xl bg-white/[0.03]" />
    </div>
  );
}

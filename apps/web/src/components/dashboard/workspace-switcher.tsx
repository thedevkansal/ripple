"use client";

import { Check, ChevronsUpDown, Plus, Settings } from "lucide-react";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { createWorkspace, switchWorkspace } from "@/app/dashboard/actions";
import { inputClass } from "@/components/dashboard/forms";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  currentId: string;
  workspaces: { id: string; name: string }[];
}

const initial = (name: string) => name.charAt(0).toUpperCase();

export function WorkspaceSwitcher({ currentId, workspaces }: Props) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  const current = workspaces.find((w) => w.id === currentId);

  const close = () => {
    setOpen(false);
    setCreating(false);
    setError(null);
  };

  // Close when the page is hidden (Next keeps visited pages alive) so it never reappears open.
  useLayoutEffect(() => () => close(), []);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
        className="press flex w-full items-center gap-2.5 rounded-xl border border-line bg-white/[0.02] px-3 py-2 text-left transition-colors duration-150 hover:border-line-strong"
      >
        <span className="grid size-6 shrink-0 place-items-center rounded-md bg-[linear-gradient(135deg,var(--glow),var(--dusk))] text-[11px] font-semibold text-ink">
          {current && initial(current.name)}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{current?.name}</span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-faint" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute top-[calc(100%+6px)] left-0 z-50 w-full min-w-60 origin-top rounded-xl border border-line-strong bg-ink-raised p-1.5 shadow-[0_20px_50px_-12px_rgb(0_0_0/0.8)] transition-[opacity,transform] duration-150 ease-out starting:scale-[0.97] starting:opacity-0"
        >
          <p className="px-2.5 pt-1.5 pb-1 text-xs text-faint">Workspaces</p>
          {workspaces.map((w) => (
            <button
              key={w.id}
              type="button"
              role="menuitemradio"
              aria-checked={w.id === currentId}
              disabled={pending}
              onClick={() => {
                if (w.id === currentId) return close();
                start(async () => {
                  await switchWorkspace(w.id);
                  close();
                });
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors duration-150 hover:bg-white/[0.05]"
            >
              <span className="grid size-5 shrink-0 place-items-center rounded bg-white/10 text-[10px] font-semibold">
                {initial(w.name)}
              </span>
              <span className="min-w-0 flex-1 truncate">{w.name}</span>
              {w.id === currentId && <Check className="size-3.5 text-glow" />}
            </button>
          ))}

          <div className="my-1.5 border-t border-line" />

          {creating ? (
            <form
              className="flex flex-col gap-2 p-1.5"
              action={(form) =>
                start(async () => {
                  const res = await createWorkspace(null, form);
                  if (res.ok) close();
                  else setError(res.error);
                })
              }
            >
              <input
                name="name"
                autoFocus
                placeholder="E-Summit Sponsorship"
                aria-label="New workspace name"
                className={cn(inputClass, "w-full")}
              />
              {error && <p className="text-xs text-red-300">{error}</p>}
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={pending}>
                  Create
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              role="menuitem"
              onClick={() => setCreating(true)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-muted transition-colors duration-150 hover:bg-white/[0.05] hover:text-text"
            >
              <Plus className="size-4" />
              Create workspace
            </button>
          )}
          <Link
            href="/dashboard/settings#workspace"
            role="menuitem"
            onClick={close}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted transition-colors duration-150 hover:bg-white/[0.05] hover:text-text"
          >
            <Settings className="size-4" />
            Workspace settings
          </Link>
        </div>
      )}
    </div>
  );
}

"use client";

import { ChevronsUpDown } from "lucide-react";
import { useTransition } from "react";
import { switchWorkspace } from "@/app/dashboard/actions";

interface Props {
  currentId: string;
  workspaces: { id: string; name: string }[];
}

export function WorkspaceSwitcher({ currentId, workspaces }: Props) {
  const [pending, startTransition] = useTransition();
  const current = workspaces.find((w) => w.id === currentId);

  return (
    <label className="relative block">
      <span className="sr-only">Workspace</span>
      <div className="flex items-center gap-2.5 rounded-xl border border-line bg-white/[0.02] px-3 py-2 transition-colors duration-150 hover:border-line-strong">
        <span className="grid size-6 shrink-0 place-items-center rounded-md bg-[linear-gradient(135deg,var(--glow),var(--dusk))] text-[11px] font-semibold text-ink">
          {current?.name.charAt(0).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{current?.name}</span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-faint" />
      </div>
      <select
        value={currentId}
        disabled={pending || workspaces.length < 2}
        onChange={(e) => startTransition(() => switchWorkspace(e.target.value))}
        className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-default"
      >
        {workspaces.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>
    </label>
  );
}

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="mt-10 flex flex-col items-center rounded-3xl border border-dashed border-line-strong px-6 py-16 text-center">
      <span className="grid size-12 place-items-center rounded-2xl border border-line-strong bg-ink-raised">
        <Icon className="size-5 text-glow" strokeWidth={1.75} />
      </span>
      <h2 className="mt-5 text-lg font-medium">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">{body}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

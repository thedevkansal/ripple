"use client";

import { Check, Copy } from "lucide-react";
import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionResult } from "@/app/dashboard/actions";
import { Button, type ButtonStyleProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Action = (prev: ActionResult | null, form: FormData) => Promise<ActionResult>;

/** A form bound to a server action that shows the action's result inline. */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (resetOnSuccess && state?.ok) ref.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form ref={ref} action={formAction} className={className}>
      {children}
      {state && (
        <p
          role={state.ok ? "status" : "alert"}
          className={cn("mt-2 basis-full text-sm", state.ok ? "text-glow" : "text-red-300")}
        >
          {state.ok ? state.message : state.error}
        </p>
      )}
    </form>
  );
}

export function SubmitButton({ children, ...props }: ButtonStyleProps & { children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} {...props}>
      {children}
    </Button>
  );
}

export function CopyButton({ value, label = "Copy link" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(id);
  }, [copied]);

  return (
    <Button
      size="sm"
      variant="secondary"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
      }}
    >
      {copied ? <Check className="size-3.5 text-glow" /> : <Copy className="size-3.5" />}
      {copied ? "Copied" : label}
    </Button>
  );
}

export const inputClass =
  "h-9 rounded-xl border border-line-strong bg-ink-sunken/60 px-3 text-sm text-text placeholder:text-faint outline-none transition-colors duration-150 focus:border-glow/50";

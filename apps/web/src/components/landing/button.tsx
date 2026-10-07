import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const VARIANTS = {
  primary:
    "bg-glow text-ink font-semibold shadow-[0_0_0_1px_rgb(124_243_224/0.5),0_8px_30px_-6px_rgb(124_243_224/0.55)] hover:bg-[#a3f7ea]",
  secondary: "border border-line-strong bg-white/[0.03] text-text hover:border-glow/40 hover:bg-white/[0.06]",
  ghost: "text-muted hover:text-text",
} as const;

const SIZES = {
  md: "h-9 px-4 text-sm",
  lg: "h-12 px-6 text-[15px]",
} as const;

type ButtonLinkProps = ComponentProps<typeof Link> & {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
};

export function ButtonLink({ variant = "primary", size = "md", className, ...props }: ButtonLinkProps) {
  return (
    <Link
      className={cn(
        "press inline-flex items-center justify-center gap-2 rounded-full whitespace-nowrap",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
}

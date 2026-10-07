import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const VARIANTS = {
  primary:
    "bg-glow text-ink font-semibold shadow-[0_0_0_1px_rgb(124_243_224/0.5),0_8px_30px_-6px_rgb(124_243_224/0.55)] hover:bg-[#a3f7ea]",
  secondary: "border border-line-strong bg-white/[0.03] text-text hover:border-glow/40 hover:bg-white/[0.06]",
  ghost: "text-muted hover:text-text hover:bg-white/[0.04]",
  danger: "border border-red-400/25 text-red-300 hover:bg-red-400/10",
} as const;

const SIZES = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-9 px-4 text-sm",
  lg: "h-12 px-6 text-[15px]",
} as const;

export interface ButtonStyleProps {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
}

export function buttonClass({ variant = "primary", size = "md" }: ButtonStyleProps, className?: string) {
  return cn(
    "press inline-flex items-center justify-center gap-2 rounded-full whitespace-nowrap disabled:pointer-events-none disabled:opacity-50",
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

export function ButtonLink({
  variant,
  size,
  className,
  ...props
}: ComponentProps<typeof Link> & ButtonStyleProps) {
  return <Link className={buttonClass({ variant, size }, className)} {...props} />;
}

export function Button({
  variant,
  size,
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & ButtonStyleProps) {
  return <button type={type} className={buttonClass({ variant, size }, className)} {...props} />;
}

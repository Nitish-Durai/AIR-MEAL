import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-[var(--radius-pill)] px-2.5 py-0.5 text-xs font-semibold tracking-wide transition-colors",
  {
    variants: {
      variant: {
        neutral: "bg-[var(--color-surface-alt)] text-[var(--color-text-secondary)] border border-[var(--color-border)]",
        primary: "bg-[var(--color-primary)]/15 text-[var(--color-primary-hover)] border border-[var(--color-primary)]/30",
        success: "bg-[var(--color-success)]/15 text-[var(--color-success-light)] border border-[var(--color-success)]/30",
        warning: "bg-[var(--color-warning)]/15 text-[var(--color-warning-light)] border border-[var(--color-warning)]/30",
        danger: "bg-[var(--color-error)]/15 text-[var(--color-error-light)] border border-[var(--color-error)]/30",
        accent: "bg-[var(--color-accent)]/15 text-[var(--color-accent-light)] border border-[var(--color-accent)]/30",
      },
    },
    defaultVariants: { variant: "neutral" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };

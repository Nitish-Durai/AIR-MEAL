import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, error = false, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "flex h-11 w-full rounded-[var(--radius-sm)] border bg-[var(--color-surface)] px-3.5 py-2 text-sm text-[var(--color-text-primary)] transition-all duration-200 placeholder:text-[var(--color-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-bg)] disabled:cursor-not-allowed disabled:opacity-50 hover:-translate-y-px hover:shadow-[0_4px_16px_rgba(30,136,229,0.15)]",
        error
          ? "border-[var(--color-error)] hover:border-[var(--color-error)]"
          : "border-[var(--color-border)] hover:border-[var(--color-primary)]",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";

export { Input };

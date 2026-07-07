"use client";

import * as React from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SearchBarProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
  value: string;
  onValueChange: (value: string) => void;
  containerClassName?: string;
}

const SearchBar = React.forwardRef<HTMLInputElement, SearchBarProps>(
  ({ value, onValueChange, placeholder = "Search…", className, containerClassName, ...props }, ref) => (
    <div className={cn("group relative w-full", containerClassName)}>
      <Search
        className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)] transition-colors group-focus-within:text-[var(--color-primary)]"
        aria-hidden
      />
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "h-11 w-full rounded-[var(--radius-sm)] border border-[var(--color-primary)]/25 bg-[var(--color-surface)] pl-10 pr-10 text-sm text-[var(--color-text)] transition-all duration-200 placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:bg-[var(--color-card)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/25 focus:ring-offset-0",
          className
        )}
        {...props}
      />
      {value && (
        <button
          type="button"
          onClick={() => onValueChange("")}
          aria-label="Clear search"
          className="absolute right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text)] cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
);

SearchBar.displayName = "SearchBar";

export { SearchBar };

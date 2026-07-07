"use client";
import { useState, useRef, useEffect, useMemo } from "react";
import { Search, ChevronDown } from "lucide-react";
import type { Flight } from "../_lib/useCrewFlights";

interface Props {
  flights: Flight[];
  value: string | null;
  onSelect: (id: string) => void;
}

export function FlightSearchSelect({ flights, value, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const selected = flights.find((f) => f.id === value) || null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return flights;
    return flights.filter((f) =>
      `${f.flight_number} ${f.origin} ${f.destination} ${f.status}`.toLowerCase().includes(q)
    );
  }, [flights, query]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const label = selected
    ? `${selected.flight_number} (${selected.origin}→${selected.destination}, ${selected.status})`
    : "-- Select Flight --";

  return (
    <div ref={ref} className="relative" style={{ minWidth: 240 }}>
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); setQuery(""); }}
        className="h-11 w-full px-3.5 flex items-center justify-between gap-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm text-[var(--color-text)] shadow-sm transition-all duration-200 hover:border-[var(--color-primary)] focus:outline-none focus:border-[var(--color-primary)]"
        style={{ minHeight: "44px" }}
      >
        <span className="truncate">{label}</span>
        <ChevronDown className="w-4 h-4 text-[var(--color-text-muted)] flex-shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-[var(--color-card)] border border-[var(--color-border)] rounded-[var(--radius)] shadow-xl overflow-hidden">
          <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
            <Search className="w-4 h-4 text-[var(--color-text-muted)] flex-shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search flight (e.g. SV200)…"
              className="w-full bg-transparent text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none"
            />
          </div>
          <div className="max-h-64 overflow-y-auto">
            <button
              type="button"
              onClick={() => { onSelect(""); setOpen(false); }}
              className="w-full text-left px-3.5 py-2.5 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)] transition-colors"
            >
              -- Select Flight --
            </button>
            {filtered.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => { onSelect(f.id); setOpen(false); }}
                className={`w-full text-left px-3.5 py-2.5 text-sm hover:bg-[var(--color-surface-alt)] transition-colors ${f.id === value ? "text-[var(--color-primary)] font-bold bg-[var(--color-primary)]/8" : "text-[var(--color-text)]"}`}
              >
                {`${f.flight_number} (${f.origin}→${f.destination}, ${f.status})`}
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-3.5 py-3 text-sm text-[var(--color-text-muted)]">No flights match.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

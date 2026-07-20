"use client";
import { useState, useRef, useEffect, useMemo } from "react";
import { ChevronDown } from "lucide-react";
import type { Flight } from "../_lib/useCrewFlights";

interface Props {
  flights: Flight[];
  value: string | null;
  onSelect: (id: string) => void;
}

export function FlightSearchSelect({ flights, value, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = flights.find((f) => f.id === value) || null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return flights;
    return flights.filter((f) =>
      `${f.flight_number} ${f.origin} ${f.destination} ${f.status}`.toLowerCase().includes(q)
    );
  }, [flights, query]);

  // Options include the leading "-- Select Flight --" row at index 0.
  const options = useMemo(
    () => [{ id: "", labelText: "-- Select Flight --" } as { id: string; labelText: string }]
      .concat(
        filtered.map((f) => ({
          id: f.id,
          labelText: `${f.flight_number} (${f.origin}→${f.destination}, ${f.status})`,
        }))
      ),
    [filtered]
  );

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Reset highlight to top whenever the filtered list changes.
  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  // Keep the highlighted row scrolled into view.
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-opt="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  const commit = (idx: number) => {
    const opt = options[idx];
    if (!opt) return;
    onSelect(opt.id);
    setOpen(false);
    setQuery("");
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      setActiveIndex((i) => Math.min(i + 1, options.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      setActiveIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      if (open) {
        e.preventDefault();
        commit(activeIndex);
      }
    }
  };

  const label = selected
    ? `${selected.flight_number} (${selected.origin}→${selected.destination}, ${selected.status})`
    : "-- Select Flight --";

  return (
    <div ref={ref} className="relative" style={{ minWidth: 240 }}>
      <div className="relative">
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls="flight-listbox"
          aria-activedescendant={open ? `flight-opt-${activeIndex}` : undefined}
          value={open ? query : label}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => { setOpen(true); setQuery(""); }}
          onKeyDown={onKeyDown}
          placeholder="Search flight (e.g. SV200)…"
          className="h-11 w-full pl-3.5 pr-9 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] shadow-sm transition-all duration-200 hover:border-[var(--color-primary)] focus:outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/25 cursor-pointer"
          style={{ minHeight: "44px" }}
        />
        <ChevronDown className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)] transition-transform ${open ? "rotate-180" : ""}`} />
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-[var(--color-card)] border border-[var(--color-border)] rounded-[var(--radius)] shadow-xl overflow-hidden">
          <div ref={listRef} id="flight-listbox" role="listbox" className="max-h-64 overflow-y-auto">
            {options.map((opt, idx) => {
              const isActive = idx === activeIndex;
              const isSelected = opt.id === value;
              const base = "w-full text-left px-3.5 py-2.5 text-sm transition-colors cursor-pointer";
              const tone = idx === 0
                ? "text-[var(--color-text-muted)]"
                : isSelected
                ? "text-[var(--color-primary)] font-bold"
                : "text-[var(--color-text)]";
              const bg = isActive
                ? "bg-[var(--color-text)]/10"
                : isSelected
                ? "bg-[var(--color-primary)]/8"
                : "";
              return (
                <div
                  key={opt.id || "none"}
                  id={`flight-opt-${idx}`}
                  data-opt={idx}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => commit(idx)}
                  className={`${base} ${tone} ${bg}`}
                >
                  {opt.labelText}
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div className="px-3.5 py-3 text-sm text-[var(--color-text-muted)]">No flights match.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

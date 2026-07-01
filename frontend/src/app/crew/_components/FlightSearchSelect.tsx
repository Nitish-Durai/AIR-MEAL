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
        className="h-9 w-full px-3 flex items-center justify-between gap-2 bg-[#0A1929] border border-[rgba(30,136,229,0.15)] rounded-lg text-xs text-[#E8F1FA] focus:outline-none focus:border-[#1E88E5]"
        style={{ minHeight: "44px" }}
      >
        <span className="truncate">{label}</span>
        <ChevronDown className="w-4 h-4 text-[#8BAABF] flex-shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-[#0A1929] border border-[rgba(30,136,229,0.25)] rounded-lg shadow-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-[rgba(30,136,229,0.15)]">
            <Search className="w-3.5 h-3.5 text-[#8BAABF]" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search flight (e.g. SV200)…"
              className="w-full bg-transparent text-xs text-[#E8F1FA] placeholder-[#5C7E97] focus:outline-none"
            />
          </div>
          <div className="max-h-64 overflow-y-auto">
            <button
              type="button"
              onClick={() => { onSelect(""); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-xs text-[#8BAABF] hover:bg-[rgba(30,136,229,0.1)]"
            >
              -- Select Flight --
            </button>
            {filtered.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => { onSelect(f.id); setOpen(false); }}
                className={`w-full text-left px-3 py-2 text-xs hover:bg-[rgba(30,136,229,0.1)] ${f.id === value ? "text-[#1E88E5] font-bold" : "text-[#E8F1FA]"}`}
              >
                {`${f.flight_number} (${f.origin}→${f.destination}, ${f.status})`}
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-3 py-3 text-xs text-[#5C7E97]">No flights match.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

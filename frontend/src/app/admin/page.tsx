"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useFlights, Flight } from "./_lib/useFlights";
import { AdminHeader } from "./_components/AdminHeader";
import { api, ApiError } from "@/lib/api";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import {
  Loader2,
  AlertTriangle,
  Plus,
  Plane,
  CheckCircle,
  ArrowRight,
  Search,
  ChevronDown,
  Trash2,
  X
} from "lucide-react";

const AIRPORTS: { code: string; city: string; country: string }[] = [
  { code: "LHR", city: "London", country: "UK" },
  { code: "DXB", city: "Dubai", country: "UAE" },
  { code: "SIN", city: "Singapore", country: "Singapore" },
  { code: "JFK", city: "New York", country: "USA" },
  { code: "CDG", city: "Paris", country: "France" },
  { code: "HND", city: "Tokyo", country: "Japan" },
  { code: "DEL", city: "Delhi", country: "India" },
  { code: "BOM", city: "Mumbai", country: "India" },
  { code: "SYD", city: "Sydney", country: "Australia" },
  { code: "DFW", city: "Dallas", country: "USA" },
  { code: "ORD", city: "Chicago", country: "USA" },
  { code: "FRA", city: "Frankfurt", country: "Germany" },
  { code: "AMS", city: "Amsterdam", country: "Netherlands" },
  { code: "ICN", city: "Seoul", country: "South Korea" },
  { code: "KUL", city: "Kuala Lumpur", country: "Malaysia" },
  { code: "BKK", city: "Bangkok", country: "Thailand" },
  { code: "SFO", city: "San Francisco", country: "USA" },
  { code: "LAX", city: "Los Angeles", country: "USA" },
  { code: "DOH", city: "Doha", country: "Qatar" },
  { code: "AUH", city: "Abu Dhabi", country: "UAE" },
  { code: "IST", city: "Istanbul", country: "Turkey" },
  { code: "ATL", city: "Atlanta", country: "USA" },
  { code: "PEK", city: "Beijing", country: "China" },
  { code: "ZRH", city: "Zurich", country: "Switzerland" },
];

function AirportSelect({
  label,
  value,
  onChange,
  excludeCode,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (code: string) => void;
  excludeCode: string;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const selected = AIRPORTS.find((a) => a.code === value);
  const filtered = AIRPORTS.filter((a) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return `${a.code} ${a.city} ${a.country}`.toLowerCase().includes(q);
  });

  return (
    <div ref={ref} className="relative">
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
        {label} <span className="text-[var(--color-error)]">*</span>
      </label>
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); setQuery(""); }}
        className="flex h-11 w-full items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none"
        style={{ minHeight: "44px" }}
      >
        <span className={selected ? "" : "text-[var(--color-text-secondary)]"}>
          {selected ? `${selected.code} (${selected.city}, ${selected.country})` : placeholder}
        </span>
        <ChevronDown className={`h-4 w-4 flex-shrink-0 text-[var(--color-text-secondary)] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-primary)]/25 bg-[var(--color-surface)] shadow-2xl">
          <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-2">
            <Search className="h-3.5 w-3.5 text-[var(--color-text-secondary)]" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search airport…"
              className="w-full bg-transparent text-sm text-[var(--color-text-primary)] placeholder-[#5C7E97] focus:outline-none"
            />
          </div>
          <div className="max-h-60 overflow-y-auto">
            {filtered.map((a) => {
              const isExcluded = a.code === excludeCode;
              return (
                <button
                  key={a.code}
                  type="button"
                  disabled={isExcluded}
                  onClick={() => { onChange(a.code); setOpen(false); }}
                  className={`w-full px-3 py-2 text-left text-sm ${
                    isExcluded
                      ? "cursor-not-allowed text-[#5C7E97] opacity-50"
                      : "text-[var(--color-text-primary)] hover:bg-[var(--color-primary)]/10 cursor-pointer"
                  }`}
                >
                  {a.code} ({a.city}, {a.country}){isExcluded ? " — in use" : ""}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="px-3 py-3 text-xs text-[#5C7E97]">No airports match.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface AirlineOpt { id: string; name: string; code: string; }

function AirlineSelect({
  value,
  onChange,
  accessToken,
}: {
  value: string;
  onChange: (id: string) => void;
  accessToken: string | null | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [airlines, setAirlines] = useState<AirlineOpt[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    api
      .get<{ data: AirlineOpt[] }>("/api/v1/admin/airlines", accessToken || undefined)
      .then((res) => { if (active) setAirlines(res.data || []); })
      .catch(() => { if (active) setLoadErr("Could not load airlines."); });
    return () => { active = false; };
  }, [accessToken]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const selected = airlines.find((a) => a.id === value);
  const filtered = airlines.filter((a) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return `${a.name} ${a.code}`.toLowerCase().includes(q);
  });

  return (
    <div ref={ref} className="relative">
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
        Airline <span className="text-[var(--color-error)]">*</span>
      </label>
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); setQuery(""); }}
        className="flex h-11 w-full items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none"
        style={{ minHeight: "44px" }}
      >
        <span className={selected ? "" : "text-[var(--color-text-secondary)]"}>
          {selected ? `${selected.name} (${selected.code})` : "Select airline…"}
        </span>
        <ChevronDown className={`h-4 w-4 flex-shrink-0 text-[var(--color-text-secondary)] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-primary)]/25 bg-[var(--color-surface)] shadow-2xl">
          <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-2">
            <Search className="h-3.5 w-3.5 text-[var(--color-text-secondary)]" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search airline…"
              className="w-full bg-transparent text-sm text-[var(--color-text-primary)] placeholder-[#5C7E97] focus:outline-none"
            />
          </div>
          <div className="max-h-60 overflow-y-auto">
            {loadErr && <div className="px-3 py-3 text-xs text-[var(--color-error-light)]">{loadErr}</div>}
            {!loadErr && filtered.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => { onChange(a.id); setOpen(false); }}
                className="w-full cursor-pointer px-3 py-2 text-left text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-primary)]/10"
              >
                {a.name} <span className="text-[var(--color-text-secondary)]">({a.code})</span>
              </button>
            ))}
            {!loadErr && filtered.length === 0 && (
              <div className="px-3 py-3 text-xs text-[#5C7E97]">No airlines match.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


function AdminDashboardContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { accessToken } = useAuth();

  const flightId = searchParams.get("flight_id");
  const { flights, loading, error, refetch } = useFlights(accessToken);

  const PROTECTED_FLIGHT_ID = "b159aea5-2cf0-4e54-a8b2-183078d41915";
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [flightSearch, setFlightSearch] = useState("");

  const FLIGHT_STATUSES = ["all", "scheduled", "boarding", "in_flight", "landed", "delayed", "cancelled"];
  const filteredFlights = flights.filter((f) => {
    const matchesStatus = statusFilter === "all" || f.status.toLowerCase() === statusFilter;
    const q = flightSearch.trim().toLowerCase();
    const matchesSearch =
      q === "" ||
      f.flight_number.toLowerCase().includes(q) ||
      f.origin.toLowerCase().includes(q) ||
      f.destination.toLowerCase().includes(q) ||
      (f.aircraft_type || "").toLowerCase().includes(q);
    return matchesStatus && matchesSearch;
  });
  const [deleteTarget, setDeleteTarget] = useState<Flight | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.delete(`/api/v1/admin/flights/${deleteTarget.id}`, accessToken || undefined);
      setDeleteTarget(null);
      await refetch();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.detail : "Failed to delete flight.");
    } finally {
      setDeleting(false);
    }
  };

  const handleFlightChange = (id: string) => {
    router.push(`/admin?flight_id=${id}`);
  };

  // Form states
  const [flightNumber, setFlightNumber] = useState("");
  const [airlineId, setAirlineId] = useState("");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [depTime, setDepTime] = useState("");
  const [arrTime, setArrTime] = useState("");
  const [depDateObj, setDepDateObj] = useState<Date | null>(null);
  const [arrDateObj, setArrDateObj] = useState<Date | null>(null);
  const [aircraftType, setAircraftType] = useState("");

  useEffect(() => {
    setDepTime(depDateObj ? depDateObj.toISOString() : "");
  }, [depDateObj]);

  useEffect(() => {
    setArrTime(arrDateObj ? arrDateObj.toISOString() : "");
  }, [arrDateObj]);
  const [loadFactor, setLoadFactor] = useState("");
  const [status, setStatus] = useState("scheduled");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<boolean>(false);
  const [showLfInfo, setShowLfInfo] = useState(false);

  const handleCreateFlight = async () => {
    setSubmitting(true);
    setFormError(null);
    setFormSuccess(false);

    try {
      if (!flightNumber || !airlineId || !origin || !destination || !depTime || !arrTime || !aircraftType) {
        throw new Error("Please fill in all required fields.");
      }

      if (origin === destination) {
        throw new Error("Origin and destination cannot be the same airport.");
      }
      if (new Date(arrTime) <= new Date(depTime)) {
        throw new Error("Arrival time must be after departure time.");
      }

      const body: any = {
        flight_number: flightNumber,
        airline_id: airlineId,
        origin,
        destination,
        dep_time: new Date(depTime).toISOString(),
        arr_time: new Date(arrTime).toISOString(),
        status,
      };

      if (aircraftType.trim() !== "") {
        body.aircraft_type = aircraftType.trim();
      }
      if (loadFactor.trim() !== "") {
        const lf = parseFloat(loadFactor);
        if (isNaN(lf) || lf < 0 || lf > 1) {
          throw new Error("Load factor must be a number between 0.0 and 1.0.");
        }
        body.load_factor = lf;
      }

      await api.post<{ data: Flight }>(
        "/api/v1/admin/flights",
        body,
        accessToken || undefined
      );

      // On success, refetch the flight list and clear the form.
      await refetch();

      setFlightNumber("");
      setAirlineId("");
      setOrigin("");
      setDestination("");
      setDepTime("");
      setArrTime("");
      setDepDateObj(null);
      setArrDateObj(null);
      setAircraftType("");
      setLoadFactor("");
      setStatus("scheduled");
      setFormSuccess(true);
      setTimeout(() => setFormSuccess(false), 5000);
    } catch (err) {
      console.error("Failed to create flight:", err);
      if (err instanceof ApiError) {
        setFormError(err.detail || "Failed to create flight");
      } else if (err instanceof Error) {
        setFormError(err.message);
      } else {
        setFormError("Failed to create flight");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen text-[#E8F1FA] font-sans pb-12">
      <style>{`
        .react-datepicker {
          background-color: #0A1929 !important;
          border: 1px solid rgba(30,136,229,0.25) !important;
          font-family: inherit !important;
          color: #E8F1FA !important;
        }
        .react-datepicker__header,
        .react-datepicker__time-container .react-datepicker__time {
          background-color: #050F1E !important;
          border-color: rgba(30,136,229,0.15) !important;
        }
        .react-datepicker__current-month,
        .react-datepicker-time__header,
        .react-datepicker__day-name,
        .react-datepicker__day,
        .react-datepicker__time-list-item {
          color: #E8F1FA !important;
        }
        .react-datepicker__day:hover,
        .react-datepicker__time-list-item:hover {
          background-color: rgba(30,136,229,0.25) !important;
        }
        .react-datepicker__day--selected,
        .react-datepicker__day--keyboard-selected,
        .react-datepicker__time-list-item--selected {
          background-color: #1E88E5 !important;
          color: #fff !important;
        }
        .react-datepicker__day--disabled,
        .react-datepicker__time-list-item--disabled {
          color: #5C7E97 !important;
          opacity: 0.5 !important;
        }
        .react-datepicker__day--today {
          font-weight: bold !important;
          color: #FF6B35 !important;
        }
        .react-datepicker__triangle {
          display: none !important;
        }
        .react-datepicker__navigation-icon::before {
          border-color: #8BAABF !important;
        }
      `}</style>
      <AdminHeader
        activeTab="flights"
        flightId={flightId}
        onFlightChange={handleFlightChange}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 mt-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Flights list */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-[#0A1929] border border-[rgba(30,136,229,0.15)] rounded-xl overflow-hidden shadow-md">
              <div className="p-4 border-b border-[rgba(30,136,229,0.15)] bg-[rgba(30,136,229,0.02)] flex items-center justify-between">
                <h2 className="font-bold text-base flex items-center gap-2">
                  <Plane className="w-4 h-4 text-[#1E88E5]" />
                  <span>Flight List ({filteredFlights.length}{filteredFlights.length !== flights.length ? ` / ${flights.length}` : ""})</span>
                </h2>
              </div>

              <div className="px-4 py-3 border-b border-[rgba(30,136,229,0.1)] space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
                  <input
                    type="text"
                    value={flightSearch}
                    onChange={(e) => setFlightSearch(e.target.value)}
                    placeholder="Search flight number, route, or aircraft…"
                    className="w-full h-10 pl-9 pr-3 rounded-lg text-sm bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[#1E88E5] transition-colors"
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {FLIGHT_STATUSES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStatusFilter(s)}
                      className={`h-8 px-3 rounded-lg text-[11px] font-bold capitalize transition-all cursor-pointer border ${
                        statusFilter === s
                          ? "bg-[#BBDEFB] text-[#0A2F5E] border-transparent"
                          : "bg-transparent text-[var(--color-text-muted)] border-[var(--color-border)] hover:text-[var(--color-text)]"
                      }`}
                    >
                      {s === "all" ? "All" : s.replace("_", " ")}
                    </button>
                  ))}
                </div>
              </div>

              {loading ? (
                <div className="flex flex-col items-center justify-center py-20 text-[#8BAABF]">
                  <Loader2 className="w-10 h-10 text-[#1E88E5] animate-spin mb-4" />
                  <p className="text-sm">Loading flights list...</p>
                </div>
              ) : error ? (
                <div className="p-8 text-center max-w-md mx-auto">
                  <AlertTriangle className="w-12 h-12 text-[#EF5350] mx-auto mb-4" />
                  <h3 className="font-bold text-lg text-[#E8F1FA] mb-2">Error Loading Flights</h3>
                  <p className="text-xs text-[#8BAABF] mb-6 leading-relaxed">{error}</p>
                  <button
                    onClick={refetch}
                    className="h-11 px-6 bg-[#90CAF9] hover:bg-[#64B5F6] text-[#0A2F5E] rounded-lg text-xs font-semibold cursor-pointer"
                    style={{ minHeight: "44px" }}
                  >
                    Reload Page
                  </button>
                </div>
              ) : flights.length === 0 ? (
                <div className="text-center py-16 p-8">
                  <p className="text-sm text-[#8BAABF]">No flights available. Create a flight on the right.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-alt)] text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-semibold">
                        <th className="p-4">Flight Number</th>
                        <th className="p-4">Route</th>
                        <th className="p-4">Aircraft</th>
                        <th className="p-4">Load Factor</th>
                        <th className="p-4">Status</th>
                        <th className="p-4 text-right">Manage</th>
                      </tr>
                    </thead>
                    <tbody className="text-xs text-[#E8F1FA] divide-y divide-[rgba(30,136,229,0.08)]">
                      {filteredFlights.map((flight) => (
                        <tr
                          key={flight.id}
                          className={`hover:bg-[rgba(30,136,229,0.03)] transition-colors ${
                            flight.id === flightId ? "bg-[rgba(30,136,229,0.08)]" : ""
                          }`}
                        >
                          <td className="p-4 font-bold tracking-wide">{flight.flight_number}</td>
                          <td className="p-4">
                            <div className="flex items-center gap-1.5 font-semibold">
                              <span>{flight.origin}</span>
                              <ArrowRight className="w-3.5 h-3.5 text-[#1E88E5]" />
                              <span>{flight.destination}</span>
                            </div>
                            <div className="text-[10px] text-[#8BAABF] mt-0.5">
                              Dep: {new Date(flight.dep_time).toLocaleString()}
                            </div>
                          </td>
                          <td className="p-4 text-[#8BAABF]">{flight.aircraft_type || "—"}</td>
                          <td className="p-4 font-semibold">
                            {flight.load_factor !== null ? `${(flight.load_factor * 100).toFixed(0)}%` : "—"}
                          </td>
                          <td className="p-4">
                            <span className={`inline-flex items-center rounded-[var(--radius-pill)] border px-2 py-0.5 text-[10px] font-bold ${
                              flight.status.toLowerCase() === "scheduled"
                                ? "border-[var(--color-primary)]/30 bg-[var(--color-primary)]/8 text-[#64B5F6]"
                                : flight.status.toLowerCase() === "boarding"
                                ? "border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                                : flight.status.toLowerCase() === "in_flight"
                                ? "border-[var(--color-primary)]/40 bg-[var(--color-primary)]/12 text-[var(--color-primary-hover)]"
                                : flight.status.toLowerCase() === "landed"
                                ? "border-[var(--color-success)]/30 bg-[var(--color-success)]/10 text-[var(--color-success-light)]"
                                : "border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 text-[var(--color-warning-light)]"
                            }`}>
                              {flight.status}
                            </span>
                          </td>
                          <td className="p-4 text-right">
                            {flight.id === PROTECTED_FLIGHT_ID ? (
                              <span
                                title="Demo flight — protected from deletion"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-text-muted)] opacity-40 cursor-not-allowed"
                              >
                                <Trash2 className="w-4 h-4" />
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => { setDeleteError(null); setDeleteTarget(flight); }}
                                title="Delete flight"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#EF5350] hover:bg-[rgba(239,83,80,0.1)] transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {deleteTarget && (
                        <tr>
                          <td colSpan={6}>
                            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[rgba(5,15,30,0.55)] backdrop-blur-[2px]">
                              <div className="w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-xl">
                                <div className="flex items-start justify-between mb-3">
                                  <h3 className="text-base font-bold text-[var(--color-text)]">Delete flight?</h3>
                                  <button type="button" onClick={() => setDeleteTarget(null)} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] cursor-pointer">
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                                <p className="text-sm text-[var(--color-text-muted)] leading-relaxed mb-1">
                                  This permanently deletes <strong className="text-[var(--color-text)]">{deleteTarget.flight_number}</strong> ({deleteTarget.origin} → {deleteTarget.destination}) and all its orders, inventory, tasks, and feedback.
                                </p>
                                <p className="text-xs text-[#EF5350] mb-4">This cannot be undone.</p>
                                {deleteError && (
                                  <div className="mb-3 rounded-lg border border-[rgba(239,83,80,0.3)] bg-[rgba(239,83,80,0.1)] px-3 py-2 text-xs text-[#EF5350]">
                                    {deleteError}
                                  </div>
                                )}
                                <div className="flex justify-end gap-2">
                                  <button type="button" onClick={() => setDeleteTarget(null)} disabled={deleting} className="h-10 px-4 rounded-lg text-xs font-bold bg-[var(--color-surface-alt)] text-[var(--color-text)] hover:opacity-80 transition cursor-pointer">
                                    Cancel
                                  </button>
                                  <button type="button" onClick={confirmDelete} disabled={deleting} className="h-10 px-4 rounded-lg text-xs font-bold bg-[#C62828] text-white hover:bg-[#B71C1C] transition cursor-pointer flex items-center gap-1.5">
                                    {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                    {deleting ? "Deleting..." : "Delete"}
                                  </button>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Create Flight form */}
          <div className="space-y-6">
            <div className="bg-[#0A1929] border border-[rgba(30,136,229,0.15)] rounded-xl p-6 shadow-md">
              <h2 className="font-bold text-base flex items-center gap-2 mb-6 border-b border-[rgba(30,136,229,0.1)] pb-3">
                <Plus className="w-4.5 h-4.5 text-[#1E88E5]" />
                <span>Create New Flight</span>
              </h2>

              {formSuccess && (
                <div className="mb-4 bg-[rgba(46,125,50,0.1)] border border-[rgba(46,125,50,0.3)] rounded-lg p-3 text-xs text-[#4CAF50] flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 flex-shrink-0" />
                  <span>Flight created successfully!</span>
                </div>
              )}

              {formError && (
                <div className="mb-4 bg-[rgba(198,40,40,0.1)] border border-[rgba(198,40,40,0.3)] rounded-lg p-3 text-xs text-[#EF5350] flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-[#8BAABF] uppercase tracking-wider mb-1">
                    Flight Number <span className="text-[#EF5350]">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. AA123"
                    value={flightNumber}
                    onChange={(e) => setFlightNumber(e.target.value)}
                    className="w-full h-11 px-3 bg-[#050F1E] border border-[rgba(30,136,229,0.15)] rounded-lg text-sm text-[#E8F1FA] placeholder-[#8BAABF] focus:outline-none focus:border-[#1E88E5]"
                    style={{ minHeight: "44px" }}
                  />
                </div>

                <AirlineSelect
                  value={airlineId}
                  onChange={setAirlineId}
                  accessToken={accessToken}
                />

                <div className="grid grid-cols-2 gap-4">
                  <AirportSelect
                    label="Origin"
                    value={origin}
                    onChange={setOrigin}
                    excludeCode={destination}
                    placeholder="Select origin…"
                  />
                  <AirportSelect
                    label="Destination"
                    value={destination}
                    onChange={setDestination}
                    excludeCode={origin}
                    placeholder="Select destination…"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#8BAABF] uppercase tracking-wider mb-1">
                    Departure Date &amp; Time <span className="text-[#EF5350]">*</span>
                  </label>
                  <DatePicker
                    selected={depDateObj}
                    onChange={(d: Date | null) => setDepDateObj(d)}
                    showTimeSelect
                    timeIntervals={15}
                    minDate={new Date()}
                    dateFormat="dd MMM yyyy, h:mm aa"
                    placeholderText="Select departure date & time"
                    className="w-full h-11 px-3 bg-[#050F1E] border border-[rgba(30,136,229,0.15)] rounded-lg text-sm text-[#E8F1FA] focus:outline-none focus:border-[#1E88E5]"
                    wrapperClassName="w-full"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#8BAABF] uppercase tracking-wider mb-1">
                    Arrival Date &amp; Time <span className="text-[#EF5350]">*</span>
                  </label>
                  <DatePicker
                    selected={arrDateObj}
                    onChange={(d: Date | null) => setArrDateObj(d)}
                    showTimeSelect
                    timeIntervals={15}
                    minDate={depDateObj || new Date()}
                    dateFormat="dd MMM yyyy, h:mm aa"
                    placeholderText="Select arrival date & time"
                    className="w-full h-11 px-3 bg-[#050F1E] border border-[rgba(30,136,229,0.15)] rounded-lg text-sm text-[#E8F1FA] focus:outline-none focus:border-[#1E88E5]"
                    wrapperClassName="w-full"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#8BAABF] uppercase tracking-wider mb-1">
                    Aircraft Type <span className="text-[#EF5350]">*</span>
                  </label>
                  <select
                    value={aircraftType}
                    onChange={(e) => setAircraftType(e.target.value)}
                    className="w-full h-11 px-3 bg-[#050F1E] border border-[rgba(30,136,229,0.15)] rounded-lg text-sm text-[#E8F1FA] focus:outline-none focus:border-[#1E88E5]"
                    style={{ minHeight: "44px" }}
                  >
                    <option value="">Select aircraft…</option>
                    <option value="B777-300ER">Boeing 777-300ER (wide-body)</option>
                    <option value="A380-800">Airbus A380-800 (double-deck)</option>
                    <option value="A320neo">Airbus A320neo (narrow-body)</option>
                    <option value="B737-800">Boeing 737-800 (narrow-body)</option>
                  </select>
                </div>

                <div>
                  <div className="flex items-center gap-1.5 mb-1 relative">
                    <label className="text-xs font-semibold text-[#8BAABF] uppercase tracking-wider">
                      Load Factor
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowLfInfo((v) => !v)}
                      className="w-4 h-4 rounded-full border border-[#8BAABF] text-[#8BAABF] text-[10px] leading-none flex items-center justify-center hover:text-[#1E88E5] hover:border-[#1E88E5] cursor-pointer"
                      aria-label="What is load factor?"
                    >
                      i
                    </button>
                    {showLfInfo && (
                      <div className="absolute left-0 top-6 z-20 w-64 p-2.5 bg-[#0A1929] border border-[rgba(30,136,229,0.3)] rounded-lg text-[11px] text-[#E8F1FA] leading-relaxed shadow-xl">
                        Load factor is the share of seats occupied on the flight (e.g. 85% = 85% full). Higher load means more passengers, which raises predicted meal demand and affects waste forecasts.
                      </div>
                    )}
                  </div>
                  <select
                    value={loadFactor}
                    onChange={(e) => setLoadFactor(e.target.value)}
                    className="w-full h-11 px-3 bg-[#050F1E] border border-[rgba(30,136,229,0.15)] rounded-lg text-sm text-[#E8F1FA] focus:outline-none focus:border-[#1E88E5]"
                    style={{ minHeight: "44px" }}
                  >
                    <option value="">Select load factor (optional)…</option>
                    <option value="0.50">50% full</option>
                    <option value="0.55">55% full</option>
                    <option value="0.60">60% full</option>
                    <option value="0.65">65% full</option>
                    <option value="0.70">70% full</option>
                    <option value="0.75">75% full</option>
                    <option value="0.80">80% full</option>
                    <option value="0.85">85% full</option>
                    <option value="0.90">90% full</option>
                    <option value="0.95">95% full</option>
                    <option value="1.00">100% full</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#8BAABF] uppercase tracking-wider mb-1">
                    Status <span className="text-[#EF5350]">*</span>
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full h-11 px-3 bg-[#050F1E] border border-[rgba(30,136,229,0.15)] rounded-lg text-sm text-[#E8F1FA] focus:outline-none focus:border-[#1E88E5]"
                    style={{ minHeight: "44px" }}
                  >
                    <option value="scheduled">Scheduled</option>
                    <option value="active">Active</option>
                    <option value="landed">Landed</option>
                    <option value="delayed">Delayed</option>
                  </select>
                </div>

                <button
                  type="button"
                  onClick={handleCreateFlight}
                  disabled={submitting}
                  className="w-full h-11 mt-2 bg-[#90CAF9] hover:bg-[#64B5F6] disabled:bg-[rgba(30,136,229,0.3)] disabled:text-[#8BAABF] text-[#0A2F5E] font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  style={{ minHeight: "44px" }}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Creating...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      <span>Create Flight</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}

export default function AdminDashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-[#8BAABF]">
          <Loader2 className="w-8 h-8 text-[#1E88E5] animate-spin mb-4" />
          <p className="text-sm">Loading admin dashboard...</p>
        </div>
      }
    >
      <AdminDashboardContent />
    </Suspense>
  );
}

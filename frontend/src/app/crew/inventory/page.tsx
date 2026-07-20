"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useCrewFlights } from "../_lib/useCrewFlights";
import { FlightSearchSelect } from "../_components/FlightSearchSelect";
import Link from "next/link";
import { cabinChipStyle } from "@/lib/cabinColors";
import {
  Loader2,
  AlertTriangle,
  RefreshCw,
  TrendingDown,
  Info,
  CheckCircle,
  BarChart4,
  Plane,
  Check,
  RotateCcw
} from "lucide-react";



interface WastePrediction {
  meal_id: string;
  meal_name: string;
  cabin_class: string;
  category: string;
  is_alcohol: boolean;
  initial_qty: number;
  predicted_waste: number;
  waste_pct: number;
  should_intervene: boolean;
  suggestion: string | null;
  method: string;
}

function CrewInventoryContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { accessToken, email, role, logout } = useAuth();
  const { flights } = useCrewFlights(accessToken);

  const flightId = searchParams.get("flight_id");
  const [cabinClassFilter, setCabinClassFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [predictions, setPredictions] = useState<WastePrediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [interventions, setInterventions] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  // Pre-intervention predicted waste, captured the first time a meal is marked,
  // so the card can show a before → after comparison after the forecast recomputes.
  const [baselineWaste, setBaselineWaste] = useState<Record<string, number>>({});
  const [confirmingReset, setConfirmingReset] = useState(false);

  const fetchWasteAnalysis = async () => {
    if (!flightId) return;
    setLoading(true);
    setError(null);
    try {
      const path = `/api/v1/flights/${flightId}/waste-analysis`;
      const response = await api.get<{ data: WastePrediction[] }>(path, accessToken || undefined);
      setPredictions(response.data || []);

      try {
        const intRes = await api.get<{ data: { meal_id: string; cabin_class: string; action: string }[] }>(
          `/api/v1/flights/${flightId}/waste-interventions`,
          accessToken || undefined
        );
        const map: Record<string, string> = {};
        (intRes.data || []).forEach(i => { map[`${i.meal_id}|${i.cabin_class}`] = i.action; });
        setInterventions(map);
      } catch {
        // non-fatal — interventions are optional context
      }
    } catch (err) {
      console.error("Failed to fetch waste analysis:", err);
      if (err instanceof ApiError) {
        setError(err.detail || "Failed to load inventory predictions.");
      } else {
        setError("Failed to load inventory predictions.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (flightId) {
      fetchWasteAnalysis();
    }
  }, [flightId, accessToken]);

  function handleIntervention(mealId: string, cabinClass: string, action: string) {
    const key = `${mealId}|${cabinClass}`;
    const previous = interventions[key];
    // Capture the current (pre-action) predicted waste as the baseline, once.
    if (baselineWaste[key] === undefined) {
      const pred = predictions.find(p => `${p.meal_id}|${p.cabin_class}` === key);
      if (pred) setBaselineWaste(prev => ({ ...prev, [key]: pred.predicted_waste }));
    }
    // Optimistic: update state synchronously so the card marks + moves instantly.
    setInterventions(prev => ({ ...prev, [key]: action }));
    // Fire-and-forget save; roll back only if it fails.
    api.post(
      `/api/v1/flights/${flightId}/waste-interventions`,
      { meal_id: mealId, cabin_class: cabinClass, action },
      accessToken || undefined
    ).then(() => {
      // Re-pull the forecast so the recomputed (lower) predicted waste is shown.
      fetchWasteAnalysis();
    }).catch((err) => {
      console.error("Failed to record intervention", err);
      setInterventions(prev => {
        const next = { ...prev };
        if (previous === undefined) { delete next[key]; } else { next[key] = previous; }
        return next;
      });
    });
  }

  // Revert a single marked intervention (per-card undo).
  function handleRevert(mealId: string, cabinClass: string) {
    const key = `${mealId}|${cabinClass}`;
    const previous = interventions[key];
    // Optimistic: remove the mark immediately.
    setInterventions(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    const params = new URLSearchParams({ meal_id: mealId, cabin_class: cabinClass });
    api.delete(
      `/api/v1/flights/${flightId}/waste-interventions?${params.toString()}`,
      accessToken || undefined
    ).then(() => {
      // Re-pull the forecast so reverting restores the original predicted waste.
      fetchWasteAnalysis();
    }).catch((err) => {
      console.error("Failed to revert intervention", err);
      // Roll back: restore the previous mark if it existed.
      if (previous !== undefined) {
        setInterventions(prev => ({ ...prev, [key]: previous }));
      }
    });
  }

  // Reset ALL marks for this flight (demo clean slate). Gated by confirm in the UI.
  function handleResetAll() {
    const previous = interventions;
    // Optimistic: clear everything immediately.
    setInterventions({});
    api.delete(
      `/api/v1/flights/${flightId}/waste-interventions`,
      accessToken || undefined
    ).then(() => {
      // Re-pull the forecast so all predicted-waste values reset.
      fetchWasteAnalysis();
    }).catch((err) => {
      console.error("Failed to reset interventions", err);
      // Roll back to whatever was marked before.
      setInterventions(previous);
    });
  }

  // Cabins present on this flight, in display order
  const CABIN_ORDER = ["first", "business", "premium_economy", "economy"];
  const CABIN_LABEL: Record<string, string> = {
    first: "First", business: "Business", premium_economy: "Premium Economy", economy: "Economy",
  };
  const availableCabins = CABIN_ORDER.filter(c => predictions.some(p => p.cabin_class === c));

  // Standard category row; "Alcohol" is derived from is_alcohol, not a real category
  const CATEGORY_ORDER = ["Snacks", "Starters", "Main Course", "Beverages", "Alcohol", "Desserts"];
  const availableCategories = CATEGORY_ORDER.filter(cat =>
    cat === "Alcohol"
      ? predictions.some(p => p.is_alcohol)
      : predictions.some(p => p.category === cat)
  );

  // Drill-down: cabin first, then category (Alcohol => is_alcohol)
  const matchesFilters = (p: WastePrediction) => {
    if (cabinClassFilter && p.cabin_class !== cabinClassFilter) return false;
    if (categoryFilter) {
      if (categoryFilter === "Alcohol") { if (!p.is_alcohol) return false; }
      else if (p.category !== categoryFilter) return false;
    }
    return true;
  };

  const filteredPredictions = predictions.filter(matchesFilters);

  // Show a card if it still needs action OR has already been actioned (so the
  // redirected state stays visible in place rather than vanishing).
  const activeInterventions = filteredPredictions
    .filter(p => {
      const key = `${p.meal_id}|${p.cabin_class}`;
      return (p.should_intervene && p.suggestion) || interventions[key];
    })
    .map((p, i) => ({ p, i }))
    .sort((a, b) => {
      const aMarked = interventions[`${a.p.meal_id}|${a.p.cabin_class}`] ? 1 : 0;
      const bMarked = interventions[`${b.p.meal_id}|${b.p.cabin_class}`] ? 1 : 0;
      if (aMarked !== bMarked) return bMarked - aMarked;
      return a.i - b.i;
    })
    .map(x => x.p);

  // Cabin-level waste totals for the summary bar: baseline (pre-action) vs current.
  const wasteSummary = (() => {
    let baseline = 0;
    let current = 0;
    let redirectedCount = 0;
    for (const p of filteredPredictions) {
      const key = `${p.meal_id}|${p.cabin_class}`;
      const marked = !!interventions[key];
      const base = baselineWaste[key] ?? p.predicted_waste;
      baseline += base;
      current += p.predicted_waste;
      if (marked) redirectedCount += 1;
    }
    const reducedPct = baseline > 0 ? ((baseline - current) / baseline) * 100 : 0;
    return {
      baseline: Math.round(baseline * 10) / 10,
      current: Math.round(current * 10) / 10,
      reducedPct: Math.round(reducedPct * 10) / 10,
      redirectedCount,
    };
  })();

  return (
    <div className="min-h-screen text-[#E8F1FA] font-sans pb-12">
      {/* Header */}
      <header className="bg-[#0A1929] border-b border-[rgba(30,136,229,0.15)] px-4 py-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-lg sm:text-xl font-extrabold tracking-tight flex items-center gap-2">
                <Plane className="w-5 h-5 text-[#1E88E5]" />
                <span>Crew Operations Control</span>
              </h1>
              {email && (
                <p className="text-[10px] text-[#8BAABF] mt-0.5">
                  Logged in: <span className="font-semibold text-[var(--color-text)]">{email}</span> ({role})
                </p>
              )}
            </div>

            <button
              onClick={logout}
              className="h-10 px-3 bg-[rgba(239,83,80,0.1)] border border-[rgba(239,83,80,0.2)] text-[#EF5350] hover:bg-[#C62828] hover:text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              style={{ minHeight: "44px" }}
            >
              <span>Sign Out</span>
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-6 border-t border-[rgba(30,136,229,0.1)] pt-4">
            <div className="flex items-center gap-2 text-sm">
              <Link
                href={`/crew?flight_id=${flightId || ""}`}
                className="px-3 py-1.5 font-bold transition-all border-b-2 text-[#8BAABF] border-transparent hover:text-[#E8F1FA]"
              >
                Tasks Dashboard
              </Link>
              <Link
                href={`/crew/route?flight_id=${flightId || ""}`}
                className="px-3 py-1.5 font-bold transition-all border-b-2 text-[#8BAABF] border-transparent hover:text-[#E8F1FA]"
              >
                Route Map
              </Link>
              <Link
                href={`/crew/inventory?flight_id=${flightId || ""}`}
                className="px-3 py-1.5 font-bold transition-all border-b-2 text-[#1E88E5] border-[#1E88E5]"
              >
                Waste Inventory
              </Link>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-[#8BAABF] font-semibold">Flight Context:</span>
              <FlightSearchSelect
                flights={flights}
                value={flightId}
                onSelect={(id) => router.push(`/crew/inventory?flight_id=${id}`)}
              />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 mt-6">
        {!flightId ? (
          <div className="text-center py-20 bg-[#0A1929] border border-[rgba(30,136,229,0.1)] rounded-xl p-8">
            <TrendingDown className="w-12 h-12 text-[#1E88E5] mx-auto mb-3 animate-pulse" />
            <h2 className="text-[#E8F1FA] text-lg font-bold mb-1">No Flight Selected</h2>
            <p className="text-sm text-[#8BAABF] mb-6">Please select a flight context to view predicted meal waste and inventory suggestions.</p>
          </div>
        ) : (
          <div className="space-y-6">
            
            {/* Cabin Filter Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#0A1929] border border-[rgba(30,136,229,0.1)] rounded-xl p-4">
              <div className="flex flex-col gap-2">
                {/* Cabin filter row (dynamic) */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setCabinClassFilter("")}
                    className={`h-10 px-4 rounded-lg text-xs font-bold transition-all cursor-pointer ${cabinClassFilter === "" ? "" : "bg-transparent text-[var(--color-text-muted)] border border-[var(--color-border)] hover:text-[var(--color-text)]"}`}
                    style={cabinChipStyle("all", cabinClassFilter === "")}
                  >
                    All Cabins
                  </button>
                  {availableCabins.map(c => (
                    <button
                      key={c}
                      onClick={() => setCabinClassFilter(c)}
                      className={`h-10 px-4 rounded-lg text-xs font-bold transition-all cursor-pointer ${cabinClassFilter === c ? "" : "bg-transparent text-[var(--color-text-muted)] border border-[var(--color-border)] hover:text-[var(--color-text)]"}`}
                      style={cabinChipStyle(c, cabinClassFilter === c)}
                    >
                      {CABIN_LABEL[c]}
                    </button>
                  ))}
                </div>

                {/* Category filter row (drill-down within cabin) */}
                {availableCategories.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <button
                      onClick={() => setCategoryFilter("")}
                      className={`h-9 px-3 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${categoryFilter === "" ? "bg-[#FEFCE8] text-[#1A1A1A] border border-transparent" : "bg-transparent text-[var(--color-text-muted)] border border-[var(--color-border)] hover:text-[var(--color-text)]"}`}
                    >
                      All
                    </button>
                    {availableCategories.map(cat => (
                      <button
                        key={cat}
                        onClick={() => setCategoryFilter(cat)}
                        className={`h-9 px-3 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${categoryFilter === cat ? "bg-[#FEFCE8] text-[#1A1A1A] border border-transparent" : "bg-transparent text-[var(--color-text-muted)] border-[var(--color-border)] hover:text-[var(--color-text)]"}`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                {confirmingReset ? (
                  <>
                    <button
                      type="button"
                      onClick={() => { handleResetAll(); setConfirmingReset(false); }}
                      className="h-10 px-3 bg-[var(--color-error)]/12 border border-[var(--color-error)]/40 text-[var(--color-error-light)] font-semibold rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      style={{ minHeight: "44px" }}
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Reset all?
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingReset(false)}
                      className="h-10 px-3 bg-transparent border border-[var(--color-border)] text-[var(--color-text-secondary)] font-semibold rounded-lg text-xs transition-colors cursor-pointer"
                      style={{ minHeight: "44px" }}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmingReset(true)}
                    disabled={Object.keys(interventions).length === 0}
                    className="h-10 px-3 bg-transparent hover:bg-[var(--color-error)]/8 border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-error-light)] font-semibold rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ minHeight: "44px" }}
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Reset marks
                  </button>
                )}
                <button
                  onClick={fetchWasteAnalysis}
                  disabled={loading}
                  className="h-10 px-4 bg-transparent hover:bg-[rgba(30,136,229,0.08)] border border-[rgba(30,136,229,0.2)] text-[#1E88E5] font-semibold rounded-lg text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  style={{ minHeight: "44px" }}
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  <span>Refresh Data</span>
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-[rgba(198,40,40,0.1)] border border-[rgba(198,40,40,0.2)] text-[#EF5350] text-xs p-3 rounded-lg flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Active Interventions Warnings */}
            {activeInterventions.length > 0 && (
              <div className="space-y-3">
                <div className="flex flex-col gap-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#FF6B35] flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" />
                    <span>Waste Reduction Interventions</span>
                  </h3>
                  {wasteSummary.redirectedCount > 0 && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-[var(--radius)] border border-[var(--color-success)]/35 bg-[var(--color-success)]/10 px-4 py-3">
                      <span className="text-sm font-semibold text-[var(--color-text-primary)]">
                        Forecast waste this view:
                      </span>
                      <span className="text-sm text-[var(--color-text-muted)] line-through">
                        {wasteSummary.baseline} units
                      </span>
                      <span className="text-lg font-extrabold text-[var(--color-success-light)]">
                        → {wasteSummary.current} units
                      </span>
                      <span className="rounded-full bg-[var(--color-success)]/20 px-2.5 py-1 text-sm font-extrabold text-[var(--color-success-light)]">
                        −{wasteSummary.reducedPct}%
                      </span>
                      <span className="text-xs text-[var(--color-text-muted)]">
                        after {wasteSummary.redirectedCount} intervention{wasteSummary.redirectedCount > 1 ? "s" : ""}
                      </span>
                    </div>
                  )}
                  <p className="text-[10px] italic text-[var(--color-text-muted)]/70">
                    Decision support — logs a disposition and recomputes forecast waste; does not execute a transaction.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {activeInterventions.map(item => (
                    <div
                      key={`${item.meal_id}|${item.cabin_class}`}
                      className="flex flex-col justify-between gap-2 rounded-[var(--radius)] border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/8 p-4 shadow-[var(--shadow-sm)]"
                    >
                      <div>
                        <div className="flex justify-between items-start">
                          <span className="font-bold text-sm text-[#E8F1FA]">{item.meal_name}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-[rgba(255,107,53,0.15)] text-[#FF6B35] font-bold uppercase tracking-wider">
                            {item.cabin_class}
                          </span>
                        </div>
                        {item.suggestion && (
                          <p className="text-xs text-[#C2410C] mt-2 font-medium bg-[rgba(255,107,53,0.08)] p-2.5 rounded border border-[rgba(255,107,53,0.2)]">
                            {item.suggestion}
                          </p>
                        )}
                        {(() => {
                          const key = `${item.meal_id}|${item.cabin_class}`;
                          const current = interventions[key];
                          const isSaving = savingKey === key;
                          return (
                            <div className="mt-2">
                              {current ? (
                                <div className="flex items-center gap-2">
                                  <div className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--color-success)]/18 px-3 py-1.5 text-sm font-bold text-[var(--color-success-light)]">
                                    <Check className="h-4 w-4" /> Redirected: {current === "offer_free" ? "Released to Cabin" : "Allocated to Crew"}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleRevert(item.meal_id, item.cabin_class)}
                                    className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-bold text-[var(--color-text-secondary)] hover:border-[var(--color-error)]/40 hover:text-[var(--color-error-light)] transition-colors cursor-pointer"
                                  >
                                    <RotateCcw className="h-3.5 w-3.5" /> Undo
                                  </button>
                                </div>
                              ) : (
                                <div className="grid grid-cols-2 gap-2">
                                  <button
                                    disabled={isSaving}
                                    onClick={() => handleIntervention(item.meal_id, item.cabin_class, "offer_free")}
                                    className="text-[13px] px-3 py-2 rounded-md bg-[#DCF0DD] border border-[#81C784] text-[#1B5E20] font-bold hover:bg-[#C8E6C9] transition-colors disabled:opacity-50 cursor-pointer text-center"
                                    style={{ minHeight: "40px" }}
                                  >
                                    Release to Cabin
                                  </button>
                                  <button
                                    disabled={isSaving}
                                    onClick={() => handleIntervention(item.meal_id, item.cabin_class, "crew_meal")}
                                    className="text-[13px] px-3 py-2 rounded-md bg-[#FFE8CC] border border-[#FFB74D] text-[#BF360C] font-bold hover:bg-[#FFE0B2] transition-colors disabled:opacity-50 cursor-pointer text-center"
                                    style={{ minHeight: "40px" }}
                                  >
                                    Allocate to Crew
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-[#9A3412] border-t border-[rgba(255,107,53,0.1)] pt-2 mt-1">
                        {(() => {
                          const k = `${item.meal_id}|${item.cabin_class}`;
                          const base = baselineWaste[k];
                          const isMarked = !!interventions[k];
                          if (isMarked && base !== undefined && base > item.predicted_waste) {
                            return (
                              <span className="text-sm">
                                Predicted waste:{" "}
                                <strong className="text-[var(--color-text-muted)] line-through">{base}</strong>{" "}
                                <strong className="text-base text-[var(--color-success-light)]">→ {item.predicted_waste}</strong>{" "}
                                <span className="text-[var(--color-text-muted)]">/ {item.initial_qty}</span>
                              </span>
                            );
                          }
                          return (
                            <span>Predicted waste: <strong className="text-[#FF6B35]">{item.predicted_waste} / {item.initial_qty}</strong> ({item.waste_pct.toFixed(1)}%)</span>
                          );
                        })()}
                        {(item.method === "fallback_estimate" || item.method === "forecast_inflight") && (
                          <span className="bg-[rgba(255,255,255,0.06)] px-1.5 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider">
                            {item.method === "forecast_inflight" ? "forecast" : "estimate"}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Predictions List / Cards */}
            <div className="bg-[#0A1929] border border-[rgba(30,136,229,0.15)] rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-6">
                <BarChart4 className="w-5 h-5 text-[#1E88E5]" />
                <div>
                  <h3 className="font-extrabold text-base tracking-tight text-[var(--color-text)]">
                    Meal Inventory & Predicted Waste Analysis
                  </h3>
                  <p className="text-xs text-[#8BAABF]">
                    Forecasted waste volume metrics dynamically calculated for flight
                  </p>
                </div>
              </div>

              {loading && predictions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-[#8BAABF]">
                  <Loader2 className="w-8 h-8 text-[#1E88E5] animate-spin mb-4" />
                  <p className="text-sm">Fetching waste metrics...</p>
                </div>
              ) : predictions.length === 0 ? (
                <div className="text-center py-16 border border-dashed border-[rgba(30,136,229,0.15)] rounded-xl">
                  <p className="text-sm text-[#8BAABF] font-medium">No inventory or waste predictions returned</p>
                  <p className="text-xs text-[#5C7E97] mt-1">Please verify flight configuration or menu availability.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {[...filteredPredictions].sort((a, b) => b.waste_pct - a.waste_pct).map(item => {
                    const safePct = Math.max(0, 100 - item.waste_pct);
                    return (
                      <div
                        key={`${item.meal_id}|${item.cabin_class}`}
                        className="bg-[#050F1E] border border-[rgba(30,136,229,0.08)] rounded-xl p-4 hover:border-[rgba(30,136,229,0.2)] transition-all"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-bold text-sm text-[var(--color-text)]">{item.meal_name}</h4>
                              <span className="text-[10px] px-2 py-0.5 rounded bg-[#0A1929] border border-[rgba(30,136,229,0.15)] text-[#8BAABF] font-bold uppercase tracking-wider">
                                {item.cabin_class}
                              </span>
                              {(item.method === "fallback_estimate" || item.method === "forecast_inflight") && (
                                <span className="bg-[rgba(255,183,77,0.1)] text-[#FFB74D] border border-[rgba(255,183,77,0.2)] px-1.5 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider">
                                  {item.method === "forecast_inflight" ? "forecast" : "estimate"}
                                </span>
                              )}
                              {!item.should_intervene && !interventions[`${item.meal_id}|${item.cabin_class}`] && item.predicted_waste >= 1 && (
                                <span
                                  className="bg-[rgba(139,170,191,0.12)] text-[#8BAABF] border border-[rgba(139,170,191,0.25)] px-2.5 py-1 rounded text-[11px] uppercase font-bold tracking-wider"
                                  title="Forecast waste, but remaining stock is already reserved or served — no surplus left to redirect."
                                >
                                  committed · not recoverable
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-4 text-xs">
                            <div>
                              <span className="text-[#8BAABF]">Initial Qty:</span>{" "}
                              <strong className="text-[var(--color-text)]">{item.initial_qty}</strong>
                            </div>
                            <div>
                              <span className="text-[#8BAABF]">Est. Waste:</span>{" "}
                              <strong className="text-[#FF6B35]">{item.predicted_waste}</strong>{" "}
                              <span className="text-[#8BAABF] text-[10px]">({item.waste_pct.toFixed(1)}%)</span>
                            </div>
                          </div>
                        </div>

                        {/* Stock / Waste Progress Bar */}
                        <div className="space-y-1">
                          <div className="h-2.5 w-full bg-[rgba(255,255,255,0.06)] rounded-full overflow-hidden flex">
                            {/* Visualizing predicted waste relative to initial quantity */}
                            <div
                              style={{ width: `${item.waste_pct}%` }}
                              className="h-full bg-[#F08A8A] transition-all duration-500"
                              title={`Predicted Waste: ${item.predicted_waste}`}
                            />
                            <div
                              style={{ width: `${safePct}%` }}
                              className="h-full bg-[#90CAF9] transition-all duration-500"
                              title={`Consumption: ${item.initial_qty - item.predicted_waste}`}
                            />
                          </div>
                          
                          <div className="flex justify-between text-[9px] text-[#5C7E97]">
                            <span>{item.waste_pct.toFixed(0)}% Wasted ({item.predicted_waste} units)</span>
                            <span>{safePct.toFixed(0)}% Consumed ({item.initial_qty - item.predicted_waste} units)</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function CrewInventoryPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-[#8BAABF]">
          <Loader2 className="w-8 h-8 text-[#1E88E5] animate-spin mb-4" />
          <p className="text-sm">Loading operations control board...</p>
        </div>
      }
    >
      <CrewInventoryContent />
    </Suspense>
  );
}

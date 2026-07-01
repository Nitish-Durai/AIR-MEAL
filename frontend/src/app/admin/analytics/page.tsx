"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { AdminHeader } from "../_components/AdminHeader";
import { cabinChipStyle } from "@/lib/cabinColors";
import {
  Loader2,
  AlertTriangle,
  TrendingDown,
  BarChart4,
  Briefcase,
  TrendingUp,
  Percent,
  CheckCircle2,
  XCircle,
  Star
} from "lucide-react";

interface FlightSummary {
  flight_id: string;
  flight_number: string;
  load_factor: number;
  total_orders: number;
  delivered_orders: number;
  cancelled_orders: number;
  average_overall_rating: number | null;
  total_initial_qty: number;
  total_served_qty: number;
  total_wasted_qty: number;
  waste_percentage: number;
}

interface DemandForecast {
  meal_id: string;
  meal_name: string;
  cabin_class: string;
  predicted_demand: number;
  current_stock: number;
  method: string;
}

interface WasteAnalysisItem {
  meal_id: string;
  meal_name: string;
  cabin_class: string;
  initial_qty: number;
  predicted_waste: number;
  waste_pct: number;
  should_intervene: boolean;
  suggestion: string | null;
  method: string;
  category: string;
  is_alcohol: boolean;
}

function AdminAnalyticsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { accessToken } = useAuth();

  const flightId = searchParams.get("flight_id");

  const [summary, setSummary] = useState<FlightSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const [forecasts, setForecasts] = useState<DemandForecast[]>([]);
  const [forecastsLoading, setForecastsLoading] = useState(false);
  const [forecastsError, setForecastsError] = useState<string | null>(null);

  const [wasteAnalysis, setWasteAnalysis] = useState<WasteAnalysisItem[]>([]);
  const [wasteLoading, setWasteLoading] = useState(false);
  const [wasteError, setWasteError] = useState<string | null>(null);
  const [demandCabinFilter, setDemandCabinFilter] = useState<string>("");
  const [wasteCabinFilter, setWasteCabinFilter] = useState<string>("");
  const [wasteCatFilter, setWasteCatFilter] = useState<string>("");

  useEffect(() => {
    if (!flightId) {
      setSummary(null);
      setForecasts([]);
      setWasteAnalysis([]);
      return;
    }

    const fetchSummary = async () => {
      setSummaryLoading(true);
      setSummaryError(null);
      try {
        const res = await api.get<{ data: FlightSummary }>(
          `/api/v1/admin/analytics/flights/${flightId}/summary`,
          accessToken || undefined
        );
        setSummary(res.data);
      } catch (err) {
        console.error("Failed to fetch summary metrics:", err);
        if (err instanceof ApiError) {
          setSummaryError(err.detail || "Failed to load summary metrics.");
        } else {
          setSummaryError("Failed to load summary metrics.");
        }
      } finally {
        setSummaryLoading(false);
      }
    };

    const fetchForecasts = async () => {
      setForecastsLoading(true);
      setForecastsError(null);
      try {
        const res = await api.get<{ data: DemandForecast[] }>(
          `/api/v1/analytics/demand-forecast?flight_id=${flightId}`,
          accessToken || undefined
        );
        setForecasts(res.data || []);
      } catch (err) {
        console.error("Failed to fetch demand forecasts:", err);
        if (err instanceof ApiError) {
          setForecastsError(err.detail || "Failed to load demand forecasts.");
        } else {
          setForecastsError("Failed to load demand forecasts.");
        }
      } finally {
        setForecastsLoading(false);
      }
    };

    const fetchWaste = async () => {
      setWasteLoading(true);
      setWasteError(null);
      try {
        const res = await api.get<{ data: WasteAnalysisItem[] }>(
          `/api/v1/flights/${flightId}/waste-analysis/admin`,
          accessToken || undefined
        );
        setWasteAnalysis(res.data || []);
      } catch (err) {
        console.error("Failed to fetch waste analysis:", err);
        if (err instanceof ApiError) {
          setWasteError(err.detail || "Failed to load waste analysis.");
        } else {
          setWasteError("Failed to load waste analysis.");
        }
      } finally {
        setWasteLoading(false);
      }
    };

    fetchSummary();
    fetchForecasts();
    fetchWaste();
  }, [flightId, accessToken]);

  const DF_CABIN_ORDER = ["first", "business", "premium_economy", "economy"];
  const DF_CABIN_LABEL: Record<string, string> = {
    first: "First", business: "Business", premium_economy: "Premium Economy", economy: "Economy",
  };
  const dfAvailableCabins = DF_CABIN_ORDER.filter((c) =>
    forecasts.some((f) => f.cabin_class === c)
  );
  const filteredForecasts = demandCabinFilter
    ? forecasts.filter((f) => f.cabin_class === demandCabinFilter)
    : forecasts;

  const WA_CABIN_ORDER = ["first", "business", "premium_economy", "economy"];
  const WA_CABIN_LABEL: Record<string, string> = {
    first: "First", business: "Business", premium_economy: "Premium Economy", economy: "Economy",
  };
  const waAvailableCabins = WA_CABIN_ORDER.filter((c) =>
    wasteAnalysis.some((w) => w.cabin_class === c)
  );

  const WA_CATEGORY_ORDER = ["Snacks", "Starters", "Main Course", "Beverages", "Alcohol", "Desserts"];
  const waAvailableCategories = WA_CATEGORY_ORDER.filter((cat) =>
    cat === "Alcohol"
      ? wasteAnalysis.some((w) => w.is_alcohol)
      : wasteAnalysis.some((w) => w.category === cat)
  );

  const filteredWaste = wasteAnalysis.filter((w) => {
    if (wasteCabinFilter && w.cabin_class !== wasteCabinFilter) return false;
    if (wasteCatFilter) {
      if (wasteCatFilter === "Alcohol") { if (!w.is_alcohol) return false; }
      else if (w.category !== wasteCatFilter) return false;
    }
    return true;
  });

  return (
    <div className="min-h-screen text-[#E8F1FA] font-sans pb-12">
      <AdminHeader
        activeTab="analytics"
        flightId={flightId}
        onFlightChange={(id) => router.push("/admin/analytics?flight_id=" + id)}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 mt-6">
        {!flightId ? (
          <div className="text-center py-20 bg-[#0A1929] border border-[rgba(30,136,229,0.1)] rounded-xl p-8 max-w-4xl mx-auto">
            <TrendingDown className="w-12 h-12 text-[#1E88E5] mx-auto mb-3 animate-pulse" />
            <h2 className="text-[#E8F1FA] text-lg font-bold mb-1">No Flight Selected</h2>
            <p className="text-sm text-[#8BAABF]">Please select a flight context in the header to view metrics, demand forecasts, and waste predictions.</p>
          </div>
        ) : (
          <div className="space-y-8">
            
            {/* Section A: Summary KPI Cards */}
            <section className="space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-[#8BAABF] flex items-center gap-1.5">
                <Briefcase className="w-4 h-4 text-[#1E88E5]" />
                <span>Flight Summary Metrics</span>
              </h2>

              {summaryLoading ? (
                <div className="flex items-center justify-center py-10 bg-[#0A1929] border border-[rgba(30,136,229,0.15)] rounded-xl">
                  <Loader2 className="w-6 h-6 text-[#1E88E5] animate-spin mr-2" />
                  <span className="text-xs text-[#8BAABF]">Loading summary metrics...</span>
                </div>
              ) : summaryError ? (
                <div className="bg-[rgba(198,40,40,0.1)] border border-[rgba(198,40,40,0.2)] text-[#EF5350] text-xs p-4 rounded-lg flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{summaryError}</span>
                </div>
              ) : summary ? (
                <div className="space-y-4">
                  {/* Small Context Bar */}
                  <div className="text-xs text-[#8BAABF] font-semibold flex items-center gap-4 bg-[#0A1929] border border-[rgba(30,136,229,0.1)] rounded-lg p-3">
                    <span>Flight: <strong className="text-[var(--color-text)]">{summary.flight_number}</strong></span>
                    <span className="text-[#8BAABF]/20">|</span>
                    <span>Load Factor: <strong className="text-[var(--color-text)]">{(summary.load_factor * 100).toFixed(0)}%</strong></span>
                  </div>

                  {/* Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                    {/* KPI 1 */}
                    <div className="bg-[#0A1929] border border-[rgba(30,136,229,0.15)] rounded-xl p-4 shadow-sm flex flex-col justify-start gap-2">
                      <div>
                        <div className="text-[10px] text-[#8BAABF] font-bold uppercase tracking-wider mb-1 flex items-center gap-1">
                          <TrendingUp className="w-3 h-3 text-[#1E88E5]" />
                          <span>Total Orders</span>
                        </div>
                        <div className="text-2xl font-black text-[var(--color-text)]">{summary.total_orders}</div>
                      </div>
                      <div className="text-[10px] text-[#8BAABF] mt-2">
                        Total requested orders
                      </div>
                    </div>

                    {/* KPI 2 */}
                    <div className="bg-[#0A1929] border border-[rgba(30,136,229,0.15)] rounded-xl p-4 shadow-sm flex flex-col justify-start gap-2">
                      <div>
                        <div className="text-[10px] text-[#8BAABF] font-bold uppercase tracking-wider mb-1 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-[#4CAF50]" />
                          <span>Delivered</span>
                        </div>
                        <div className="text-2xl font-black text-[var(--color-text)]">{summary.delivered_orders}</div>
                      </div>
                      <div className="text-[10px] text-[#8BAABF] mt-2">
                        Rate: <span className="text-[var(--color-text)] font-bold">{summary.total_orders > 0 ? `${(summary.delivered_orders / summary.total_orders * 100).toFixed(1)}%` : "—"}</span>
                      </div>
                    </div>

                    {/* KPI 3 */}
                    <div className="bg-[#0A1929] border border-[rgba(30,136,229,0.15)] rounded-xl p-4 shadow-sm flex flex-col justify-start gap-2">
                      <div>
                        <div className="text-[10px] text-[#8BAABF] font-bold uppercase tracking-wider mb-1 flex items-center gap-1">
                          <XCircle className="w-3 h-3 text-[#EF5350]" />
                          <span>Cancelled</span>
                        </div>
                        <div className="text-2xl font-black text-[var(--color-text)]">{summary.cancelled_orders}</div>
                      </div>
                      <div className="text-[10px] text-[#8BAABF] mt-2">
                        Cancelled passenger requests
                      </div>
                    </div>

                    {/* KPI 4 */}
                    <div className="bg-[#0A1929] border border-[rgba(30,136,229,0.15)] rounded-xl p-4 shadow-sm flex flex-col justify-start gap-2">
                      <div>
                        <div className="text-[10px] text-[#8BAABF] font-bold uppercase tracking-wider mb-1 flex items-center gap-1">
                          <Star className="w-3 h-3 text-[#FFB74D]" />
                          <span>Avg Rating</span>
                        </div>
                        <div className="text-2xl font-black text-[var(--color-text)]">
                          {summary.average_overall_rating !== null ? summary.average_overall_rating.toFixed(1) : "—"}
                        </div>
                      </div>
                      <div className="text-[10px] text-[#8BAABF] mt-2">
                        {summary.average_overall_rating !== null ? "Out of 5 stars" : "Not yet evaluated"}
                      </div>
                    </div>

                    {/* KPI 5 */}
                    <div className="bg-[#0A1929] border border-[rgba(30,136,229,0.15)] rounded-xl p-4 shadow-sm flex flex-col justify-start gap-2">
                      <div>
                        <div className="text-[10px] text-[#8BAABF] font-bold uppercase tracking-wider mb-1 flex items-center gap-1">
                          <Percent className="w-3 h-3 text-[#FF6B35]" />
                          <span>Realized Waste</span>
                        </div>
                        <div className="text-2xl font-black text-[#FF6B35]">{summary.waste_percentage.toFixed(1)}%</div>
                      </div>
                      <div className="text-[10px] text-[#8BAABF] mt-2">
                        Wasted: <span className="text-[var(--color-text)] font-bold">{summary.total_wasted_qty}</span> / {summary.total_initial_qty} units
                        <span className="block text-[10px] text-[#5C7E97] mt-0.5">
                          No meals wasted yet — this counts actual waste after landing. Predicted waste for this in-flight flight appears in the Waste Analysis panel.
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </section>

            {/* Split Grid for Section B & Section C */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              
              {/* Section B: Demand Forecast */}
              <section className="space-y-4">
                <h2 className="text-sm font-bold uppercase tracking-wider text-[#8BAABF] flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-[#1E88E5]" />
                  <span>Demand Forecasts</span>
                </h2>

                <div className="bg-[#0A1929] border border-[rgba(30,136,229,0.15)] rounded-xl overflow-hidden shadow-md">
                  <div className="p-4 border-b border-[rgba(30,136,229,0.15)] bg-[rgba(30,136,229,0.02)]">
                    <p className="text-xs text-[#8BAABF]">Forecasts are model outputs computed at runtime.</p>
                    {dfAvailableCabins.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2 mt-3">
                        <button
                          onClick={() => setDemandCabinFilter("")}
                          className={`h-8 px-3 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${demandCabinFilter === "" ? "" : "bg-transparent text-[var(--color-text-muted)] border border-[var(--color-border)] hover:text-[var(--color-text)]"}`}
                          style={cabinChipStyle("all", demandCabinFilter === "")}
                        >
                          All Cabins
                        </button>
                        {dfAvailableCabins.map((c) => (
                          <button
                            key={c}
                            onClick={() => setDemandCabinFilter(c)}
                            className={`h-8 px-3 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${demandCabinFilter === c ? "" : "bg-transparent text-[var(--color-text-muted)] border border-[var(--color-border)] hover:text-[var(--color-text)]"}`}
                            style={cabinChipStyle(c, demandCabinFilter === c)}
                          >
                            {DF_CABIN_LABEL[c]}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {forecastsLoading ? (
                    <div className="flex flex-col items-center justify-center py-16 text-[#8BAABF]">
                      <Loader2 className="w-8 h-8 text-[#1E88E5] animate-spin mb-3" />
                      <p className="text-xs">Loading forecasts...</p>
                    </div>
                  ) : forecastsError ? (
                    <div className="p-4 bg-[rgba(198,40,40,0.1)] text-[#EF5350] text-xs m-4 rounded-lg flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                      <span>{forecastsError}</span>
                    </div>
                  ) : forecasts.length === 0 ? (
                    <div className="text-center py-16 text-sm text-[#8BAABF]">
                      No forecast data returned
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-alt)] text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-semibold">
                            <th className="p-4">Meal</th>
                            <th className="p-4">Cabin</th>
                            <th className="p-4">Predicted Demand</th>
                            <th className="p-4">Current Stock</th>
                            <th className="p-4">Method</th>
                          </tr>
                        </thead>
                        <tbody className="text-xs text-[#E8F1FA] divide-y divide-[rgba(30,136,229,0.08)]">
                          {filteredForecasts.map((f, i) => (
                            <tr key={i} className="hover:bg-[rgba(30,136,229,0.03)] transition-colors">
                              <td className="p-4 font-bold">{f.meal_name}</td>
                              <td className="p-4">
                                <span className="text-[10px] px-2 py-0.5 rounded bg-[#050F1E] border border-[rgba(30,136,229,0.15)] text-[#8BAABF] font-bold uppercase tracking-wider">
                                  {f.cabin_class}
                                </span>
                              </td>
                              <td className="p-4 font-semibold">{f.predicted_demand.toFixed(1)}</td>
                              <td className="p-4">{f.current_stock}</td>
                              <td className="p-4">
                                <span className="bg-[rgba(30,136,229,0.1)] text-[#1E88E5] border border-[rgba(30,136,229,0.2)] px-2 py-0.5 rounded text-[10px] font-semibold">
                                  {f.method}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </section>

              {/* Section C: Waste Analysis */}
              <section className="space-y-4">
                <h2 className="text-sm font-bold uppercase tracking-wider text-[#8BAABF] flex items-center gap-1.5">
                  <BarChart4 className="w-4 h-4 text-[#1E88E5]" />
                  <span>Waste Analysis</span>
                </h2>
                {waAvailableCabins.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <button
                        onClick={() => setWasteCabinFilter("")}
                        className={`h-8 px-3 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${wasteCabinFilter === "" ? "" : "bg-transparent text-[var(--color-text-muted)] border border-[var(--color-border)] hover:text-[var(--color-text)]"}`}
                        style={cabinChipStyle("all", wasteCabinFilter === "")}
                      >
                        All Cabins
                      </button>
                      {waAvailableCabins.map((c) => (
                        <button
                          key={c}
                          onClick={() => setWasteCabinFilter(c)}
                          className={`h-8 px-3 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${wasteCabinFilter === c ? "" : "bg-transparent text-[var(--color-text-muted)] border border-[var(--color-border)] hover:text-[var(--color-text)]"}`}
                          style={cabinChipStyle(c, wasteCabinFilter === c)}
                        >
                          {WA_CABIN_LABEL[c]}
                        </button>
                      ))}
                    </div>
                  )}
                  {waAvailableCategories.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 mt-2 mb-3">
                      <button
                        onClick={() => setWasteCatFilter("")}
                        className={`h-8 px-3 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${wasteCatFilter === "" ? "bg-[#FEFCE8] text-[#1A1A1A] border border-transparent" : "bg-transparent text-[var(--color-text-muted)] border border-[var(--color-border)] hover:text-[var(--color-text)]"}`}
                      >
                        All Items
                      </button>
                      {waAvailableCategories.map((cat) => (
                        <button
                          key={cat}
                          onClick={() => setWasteCatFilter(cat)}
                          className={`h-8 px-3 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${wasteCatFilter === cat ? "bg-[#FEFCE8] text-[#1A1A1A] border border-transparent" : "bg-transparent text-[var(--color-text-muted)] border border-[var(--color-border)] hover:text-[var(--color-text)]"}`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-4 mb-3 text-[10px] text-[#8BAABF]">
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block w-3 h-3 rounded-sm bg-[#F08A8A]"></span>
                      Predicted waste (forecast unused stock)
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block w-3 h-3 rounded-sm bg-[#90CAF9]"></span>
                      Expected consumption
                    </span>
                  </div>

                <div className="bg-[#0A1929] border border-[rgba(30,136,229,0.15)] rounded-xl overflow-hidden shadow-md">
                  {wasteLoading ? (
                    <div className="flex flex-col items-center justify-center py-20 text-[#8BAABF]">
                      <Loader2 className="w-8 h-8 text-[#1E88E5] animate-spin mb-3" />
                      <p className="text-xs">Loading waste analysis...</p>
                    </div>
                  ) : wasteError ? (
                    <div className="p-4 bg-[rgba(198,40,40,0.1)] text-[#EF5350] text-xs m-4 rounded-lg flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                      <span>{wasteError}</span>
                    </div>
                  ) : wasteAnalysis.length === 0 ? (
                    <div className="text-center py-20 text-sm text-[#8BAABF]">
                      No waste predictions returned
                    </div>
                  ) : (
                    <div className="p-4 space-y-4">
                      {filteredWaste.map((item, idx) => {
                        const safePct = Math.max(0, 100 - item.waste_pct);
                        return (
                          <div
                            key={idx}
                            className="bg-[#050F1E] border border-[rgba(30,136,229,0.08)] rounded-xl p-4 hover:border-[rgba(30,136,229,0.2)] transition-all"
                          >
                            {/* Row Header Info */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h4 className="font-bold text-sm text-[var(--color-text)]">{item.meal_name}</h4>
                                  <span className="text-[10px] px-2 py-0.5 rounded bg-[#0A1929] border border-[rgba(30,136,229,0.15)] text-[#8BAABF] font-bold uppercase tracking-wider">
                                    {item.cabin_class}
                                  </span>
                                  {item.method === "fallback_estimate" && (
                                    <span className="bg-[rgba(255,183,77,0.1)] text-[#FFB74D] border border-[rgba(255,183,77,0.2)] px-1.5 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider">
                                      estimate
                                    </span>
                                  )}
                                  <span className="bg-[rgba(30,136,229,0.1)] text-[#1E88E5] border border-[rgba(30,136,229,0.2)] px-1.5 py-0.5 rounded text-[9px] font-semibold">
                                    {item.method}
                                  </span>
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

                            {/* Horizontal progress bar EXACTLY like crew/inventory */}
                            <div className="space-y-1">
                              <div className="h-2.5 w-full bg-[rgba(255,255,255,0.06)] rounded-full overflow-hidden flex">
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

                            {/* Orange Intervention Warning Callout */}
                            {item.should_intervene && item.suggestion && (
                              <div className="mt-3 bg-[rgba(255,107,53,0.08)] border border-[rgba(255,107,53,0.3)] rounded-lg p-3 text-xs text-[#9A3412] flex items-start gap-2">
                                <AlertTriangle className="w-4 h-4 text-[#FF6B35] flex-shrink-0 mt-0.5" />
                                <div>
                                  <span className="font-bold uppercase tracking-wider text-[9px] block text-[#FF6B35] mb-0.5">
                                    Intervention Suggestion
                                  </span>
                                  <span>{item.suggestion}</span>
                                </div>
                              </div>
                            )}

                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </section>

            </div>

          </div>
        )}
      </main>
    </div>
  );
}

export default function AdminAnalyticsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-[#8BAABF]">
          <Loader2 className="w-8 h-8 text-[#1E88E5] animate-spin mb-4" />
          <p className="text-sm">Loading admin analytics...</p>
        </div>
      }
    >
      <AdminAnalyticsContent />
    </Suspense>
  );
}

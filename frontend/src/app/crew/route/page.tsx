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
  Map as MapIcon,
  Compass,
  ArrowLeft,
  Settings,
  Users,
  Plane
} from "lucide-react";



interface RouteTask {
  task_id: string;
  order_id: string;
  seat_number: string;
  route_position: number;
  priority_score: number;
  status: string;
}

// Cabin layout config — order = top-to-bottom on the map.
// cols = number of seat columns; aisleAfter = column index after which the aisle gap sits.
const CABIN_LAYOUT = [
  { prefix: "F", name: "FIRST CABIN",            rows: 4,  cols: 4, aisleAfter: 2, color: "#FFB74D" },
  { prefix: "J", name: "BUSINESS CABIN",         rows: 12, cols: 4, aisleAfter: 2, color: "#1E88E5" },
  { prefix: "W", name: "PREMIUM ECONOMY CABIN",  rows: 10, cols: 5, aisleAfter: 3, color: "#26A69A" },
  { prefix: "Y", name: "ECONOMY CABIN",          rows: 28, cols: 6, aisleAfter: 3, color: "#8BAABF" },
];
const SEAT_W = 34, SEAT_H = 34, COL_GAP = 10, AISLE_GAP = 24, ROW_GAP = 12, CABIN_GAP = 30, TOP_PAD = 20, LEFT_PAD = 40;

// Y offset where each cabin block begins (computed once from the config).
function cabinTop(prefix: string): number {
  let y = TOP_PAD;
  for (const c of CABIN_LAYOUT) {
    if (c.prefix === prefix) return y;
    y += 18 /* label */ + c.rows * (SEAT_H + ROW_GAP) + CABIN_GAP;
  }
  return y;
}

function getSeatCoords(seatId: string) {
  const match = seatId.match(/^([FJWY])(\d+)([A-F])$/);
  if (!match) return null;
  const prefix = match[1];
  const row = parseInt(match[2], 10);
  const colIndex = match[3].charCodeAt(0) - 65; // A=0..F=5
  const cfg = CABIN_LAYOUT.find(c => c.prefix === prefix);
  if (!cfg || colIndex >= cfg.cols || row < 1 || row > cfg.rows) return null;
  let x = LEFT_PAD + colIndex * (SEAT_W + COL_GAP);
  if (colIndex >= cfg.aisleAfter) x += AISLE_GAP - COL_GAP;
  const y = cabinTop(prefix) + 18 + (row - 1) * (SEAT_H + ROW_GAP);
  return { x, y, width: SEAT_W, height: SEAT_H, cabin: cfg.prefix };
}

function CrewRouteContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { accessToken, userId, email, role, logout } = useAuth();
  const { flights } = useCrewFlights(accessToken);

  const flightId = searchParams.get("flight_id");
  const crewIdParam = searchParams.get("crew_id");

  const [route, setRoute] = useState<RouteTask[]>([]);
  const [filterMyRoute, setFilterMyRoute] = useState(true);
  const [selectedCabin, setSelectedCabin] = useState<string>("ALL"); // F/J/W/Y
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRoute = async () => {
    if (!flightId) return;
    setLoading(true);
    setError(null);
    try {
      // Determine crew_id to pass: either from URL query param, or from active toggle
      const activeCrewId = crewIdParam || (filterMyRoute ? userId : "");
      const path = `/api/v1/crew/route/refresh?flight_id=${flightId}${activeCrewId ? `&crew_id=${activeCrewId}` : ""}`;
      
      const response = await api.post<{ data: RouteTask[] }>(path, {}, accessToken || undefined);
      // Sort by route_position to be absolutely sure they are ordered
      const sortedRoute = (response.data || []).sort((a, b) => a.route_position - b.route_position);
      setRoute(sortedRoute);
    } catch (err) {
      console.error("Failed to fetch crew route:", err);
      if (err instanceof ApiError) {
        setError(err.detail || "Failed to fetch delivery route.");
      } else {
        setError("Failed to fetch delivery route.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (flightId) {
      fetchRoute();
    }
  }, [flightId, crewIdParam, filterMyRoute, accessToken]);

  // Generate layout seats — render seats present in the route, across all cabins.
  const seatsToRender: { id: string; x: number; y: number; width: number; height: number; cabin: string; label: string; row: number }[] = [];
  const COLS = ["A", "B", "C", "D", "E", "F"];
  for (const cfg of CABIN_LAYOUT) {
    for (let r = 1; r <= cfg.rows; r++) {
      for (let ci = 0; ci < cfg.cols; ci++) {
        const id = `${cfg.prefix}${r}${COLS[ci]}`;
        const coords = getSeatCoords(id);
        if (coords) {
          seatsToRender.push({ id, ...coords, label: COLS[ci], row: r });
        }
      }
    }
  }

  // Map route tasks for drawing
  const taskMap = new Map<string, RouteTask>();
  route.forEach(t => taskMap.set(t.seat_number, t));

  const seatPrefix = (s: string) => (s || "").charAt(0).toUpperCase();
  const seatsForCabin = selectedCabin === "ALL"
    ? seatsToRender
    : seatsToRender.filter(s => seatPrefix(s.id) === selectedCabin);

  const routePoints = (() => {
    const inCabin = route
      .filter(task => selectedCabin === "ALL" || seatPrefix(task.seat_number) === selectedCabin)
      .slice()
      .sort((a, b) => a.route_position - b.route_position);
    // Collapse multiple tasks at the same seat into one stop (first occurrence wins).
    const seenSeats = new Set<string>();
    const uniqueTasks = inCabin.filter(task => {
      if (seenSeats.has(task.seat_number)) return false;
      seenSeats.add(task.seat_number);
      return true;
    });
    // Keep only placeable seats, then number gap-free.
    return uniqueTasks
      .map(task => {
        const coords = getSeatCoords(task.seat_number);
        return coords ? { task, coords } : null;
      })
      .filter((x): x is { task: RouteTask; coords: NonNullable<ReturnType<typeof getSeatCoords>> } => x !== null)
      .map(({ task, coords }, i) => ({
        x: coords.x + coords.width / 2,
        y: coords.y + coords.height / 2,
        ...task,
        displayPosition: selectedCabin === "ALL" ? task.route_position : i + 1,
      }));
  })();

  const getPriorityColor = (score: number) => {
    if (score >= 8) return "#EF5350"; // critical red
    if (score >= 5) return "#FFB74D"; // high amber
    return "#64B5F6"; // standard blue
  };

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
                  Logged in: <span className="font-semibold text-white">{email}</span> ({role})
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
                className="px-3 py-1.5 font-bold transition-all border-b-2 text-[#1E88E5] border-[#1E88E5]"
              >
                Route Map
              </Link>
              <Link
                href={`/crew/inventory?flight_id=${flightId || ""}`}
                className="px-3 py-1.5 font-bold transition-all border-b-2 text-[#8BAABF] border-transparent hover:text-[#E8F1FA]"
              >
                Waste Inventory
              </Link>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-[#8BAABF] font-semibold">Flight Context:</span>
              <FlightSearchSelect
                flights={flights}
                value={flightId}
                onSelect={(id) => router.push(`/crew/route?flight_id=${id}`)}
              />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 mt-6">
        {!flightId ? (
          <div className="text-center py-20 bg-[#0A1929] border border-[rgba(30,136,229,0.1)] rounded-xl p-8">
            <Compass className="w-12 h-12 text-[#1E88E5] mx-auto mb-3 animate-pulse" />
            <h2 className="text-[#E8F1FA] text-lg font-bold mb-1">No Flight Selected</h2>
            <p className="text-sm text-[#8BAABF] mb-6">Please select a flight context to view the delivery route optimization map.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Toolbar / Options */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#0A1929] border border-[rgba(30,136,229,0.1)] rounded-xl p-4">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setFilterMyRoute(true)}
                  className={`h-10 px-4 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    filterMyRoute
                      ? "bg-[#BBDEFB] text-[#0A2F5E] shadow-sm"
                      : "bg-[#050F1E] border border-[rgba(30,136,229,0.1)] text-[#8BAABF] hover:text-[#E8F1FA]"
                  }`}
                  style={{ minHeight: "44px" }}
                >
                  My Route Only
                </button>
                <button
                  onClick={() => setFilterMyRoute(false)}
                  className={`h-10 px-4 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    !filterMyRoute
                      ? "bg-[#BBDEFB] text-[#0A2F5E] shadow-sm"
                      : "bg-[#050F1E] border border-[rgba(30,136,229,0.1)] text-[#8BAABF] hover:text-[#E8F1FA]"
                  }`}
                  style={{ minHeight: "44px" }}
                >
                  Full Flight Route
                </button>
                <div className="flex items-center gap-1.5 flex-wrap mt-3 w-full">
                  <span className="text-[10px] text-[#8BAABF] font-semibold mr-1">Cabin:</span>
                  <button
                    type="button"
                    onClick={() => setSelectedCabin("ALL")}
                    className={`h-8 px-3 rounded-lg text-[11px] font-bold transition-all cursor-pointer border ${selectedCabin === "ALL" ? "border-transparent" : "bg-transparent text-[var(--color-text-muted)] border-[var(--color-border)] hover:text-[var(--color-text)]"}`}
                    style={cabinChipStyle("all", selectedCabin === "ALL")}
                  >
                    All Cabins
                  </button>
                  {CABIN_LAYOUT.map(c => (
                    <button
                      key={c.prefix}
                      type="button"
                      onClick={() => setSelectedCabin(c.prefix)}
                      className={`h-8 px-3 rounded-lg text-[11px] font-bold transition-all cursor-pointer border ${selectedCabin === c.prefix ? "border-transparent" : "bg-transparent text-[var(--color-text-muted)] border-[var(--color-border)] hover:text-[var(--color-text)]"}`}
                      style={cabinChipStyle({ F: "first", J: "business", W: "premium_economy", Y: "economy" }[c.prefix] || "all", selectedCabin === c.prefix)}
                    >
                      {c.name.replace(" CABIN", "")}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={fetchRoute}
                disabled={loading}
                className="h-10 px-4 bg-transparent hover:bg-[rgba(30,136,229,0.08)] border border-[rgba(30,136,229,0.2)] text-[#1E88E5] font-semibold rounded-lg text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
                style={{ minHeight: "44px" }}
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                <span>Refresh Route</span>
              </button>
            </div>

            {/* Separated controls tab: Priority Legend row (top-left aligned) */}
            <div className="bg-[#0A1929] border border-[rgba(30,136,229,0.1)] rounded-xl p-4 flex flex-col gap-2">
              <span className="text-[11px] text-[var(--color-text-muted)] font-semibold uppercase tracking-wide">Priority Legend</span>
              <div className="flex flex-wrap gap-2">
                <div className="flex items-start gap-2 pl-2 pr-3 py-1.5 rounded-md bg-[rgba(239,83,80,0.08)] border-l-[3px] border-[#EF5350]">
                  <span className="w-2 h-2 rounded-full bg-[#EF5350] mt-1 shrink-0" />
                  <div className="leading-tight text-left">
                    <div className="text-[12px] font-bold text-[#EF5350]">Critical &middot; score &ge;8</div>
                    <div className="text-[10px] text-[var(--color-text-muted)]">Medical or first-class &mdash; serve first</div>
                  </div>
                </div>
                <div className="flex items-start gap-2 pl-2 pr-3 py-1.5 rounded-md bg-[rgba(255,179,0,0.08)] border-l-[3px] border-[#FFB300]">
                  <span className="w-2 h-2 rounded-full bg-[#FFB300] mt-1 shrink-0" />
                  <div className="leading-tight text-left">
                    <div className="text-[12px] font-bold text-[#F57C00]">High &middot; score 5&ndash;7</div>
                    <div className="text-[10px] text-[var(--color-text-muted)]">Infant or connecting flight</div>
                  </div>
                </div>
                <div className="flex items-start gap-2 pl-2 pr-3 py-1.5 rounded-md bg-[rgba(66,165,245,0.08)] border-l-[3px] border-[#42A5F5]">
                  <span className="w-2 h-2 rounded-full bg-[#42A5F5] mt-1 shrink-0" />
                  <div className="leading-tight text-left">
                    <div className="text-[12px] font-bold text-[#1E88E5]">Standard &middot; score &lt;5</div>
                    <div className="text-[10px] text-[var(--color-text-muted)]">Regular service</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-[rgba(198,40,40,0.1)] border border-[rgba(198,40,40,0.2)] text-[#EF5350] text-xs p-3 rounded-lg flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Map Card */}
            <div className="bg-[#0A1929] border border-[rgba(30,136,229,0.15)] rounded-2xl p-6 flex flex-col items-center">
              <div className="w-full flex justify-between items-center mb-6">
                <div>
                  <h3 className="font-extrabold text-base tracking-tight text-[var(--color-text)] flex items-center gap-2">
                    <MapIcon className="w-4 h-4 text-[#1E88E5]" />
                    <span>Cabin Routing Visualization</span>
                  </h3>
                  <p className="text-xs text-[#8BAABF] mt-0.5">
                    ACO-optimized delivery sequence for current flight session
                  </p>
                </div>
              </div>


              {loading && route.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-[#8BAABF]">
                  <Loader2 className="w-8 h-8 text-[#1E88E5] animate-spin mb-4" />
                  <p className="text-sm">Calculating optimal routing path...</p>
                </div>
              ) : route.length === 0 ? (
                <div className="text-center py-20 border border-dashed border-[rgba(30,136,229,0.15)] rounded-xl w-full">
                  <p className="text-sm text-[#8BAABF] font-medium">No active deliveries to route</p>
                  <p className="text-xs text-[#5C7E97] mt-1">Pending orders will generate routing instructions automatically.</p>
                </div>
              ) : (
                /* Scrollable Map Container */
                <div className="w-full overflow-auto max-h-[600px] border border-[rgba(30,136,229,0.08)] rounded-xl bg-[var(--color-surface)] p-4 flex justify-center">
                  <div className="relative">
                    <svg
                      width="340"
                      height={(() => {
                        if (selectedCabin === "ALL") return cabinTop("Y") + 18 + 28 * (SEAT_H + ROW_GAP) + 40;
                        const c = CABIN_LAYOUT.find(x => x.prefix === selectedCabin);
                        const rows = c ? c.rows : 28;
                        return TOP_PAD + 18 + rows * (SEAT_H + ROW_GAP) + 40;
                      })()}
                      className="select-none"
                      style={{ minWidth: "300px" }}
                    >
                      <g transform={`translate(0, -${selectedCabin === "ALL" ? 0 : cabinTop(selectedCabin) - TOP_PAD})`}>
                        {/* Cabin label(s) */}
                        {(selectedCabin === "ALL" ? CABIN_LAYOUT : CABIN_LAYOUT.filter(c => c.prefix === selectedCabin)).map(c => (
                          <text key={c.prefix} x="10" y={cabinTop(c.prefix) + 12} fill={c.color} fontSize="11" fontWeight="bold" letterSpacing="1">
                            {c.name}
                          </text>
                        ))}

                        {/* Render all seats */}
                        {seatsForCabin.map(seat => {
                          const activeTask = taskMap.get(seat.id);
                          const isOccupied = !!activeTask;
                          
                          let fillVal = "var(--color-bg)";
                          let strokeVal = "var(--color-border)";
                          let strokeW = 1;
                          let textFill = "var(--color-text-muted)";

                          if (isOccupied) {
                            fillVal = "rgba(30, 136, 229, 0.12)";
                            strokeVal = "#1E88E5";
                            strokeW = 1.5;
                            textFill = "#1E88E5";
                          }

                          return (
                            <g key={seat.id}>
                              <rect
                                x={seat.x}
                                y={seat.y}
                                width={seat.width}
                                height={seat.height}
                                rx="6"
                                ry="6"
                                fill={fillVal}
                                stroke={strokeVal}
                                strokeWidth={strokeW}
                              />
                              <text
                                x={seat.x + seat.width / 2}
                                y={seat.y + seat.height / 2}
                                textAnchor="middle"
                                dominantBaseline="central"
                                fill={textFill}
                                fontSize="9"
                                fontWeight={isOccupied ? "bold" : "normal"}
                              >
                                {seat.id}
                              </text>
                            </g>
                          );
                        })}

                        {/* Draw ACO route line */}
                        {routePoints.length > 1 && (
                          <path
                            d={routePoints.map((pt, idx) => `${idx === 0 ? "M" : "L"} ${pt.x} ${pt.y}`).join(" ")}
                            fill="none"
                            stroke="#FF6B35"
                            strokeWidth="1.5"
                            strokeDasharray="4,4"
                            strokeOpacity="0.55"
                          />
                        )}

                        {/* Direction arrows at the midpoint of each segment */}
                        {routePoints.slice(0, -1).map((pt, idx) => {
                          const next = routePoints[idx + 1];
                          const mx = (pt.x + next.x) / 2;
                          const my = (pt.y + next.y) / 2;
                          const angle = Math.atan2(next.y - pt.y, next.x - pt.x) * (180 / Math.PI);
                          return (
                            <path
                              key={`arrow-${pt.task_id}`}
                              d="M -4 -3 L 4 0 L -4 3 Z"
                              fill="#FF6B35"
                              transform={`translate(${mx}, ${my}) rotate(${angle})`}
                            />
                          );
                        })}

                        {/* Draw ACO stops — priority ring + corner sequence badge (seat label stays visible) */}
                        {routePoints.map(pt => {
                          const color = getPriorityColor(pt.priority_score);
                          const bx = pt.x - 12; // badge offset toward top-left corner of the node
                          const by = pt.y - 12;
                          return (
                            <g key={pt.task_id}>
                              {/* Priority ring highlights the seat without hiding its label */}
                              <circle
                                cx={pt.x}
                                cy={pt.y}
                                r="15"
                                fill="none"
                                stroke={color}
                                strokeWidth="2.5"
                              />
                              {/* Small sequence badge at the corner */}
                              <circle
                                cx={bx}
                                cy={by}
                                r="8"
                                fill={color}
                                stroke="#050F1E"
                                strokeWidth="1.5"
                              />
                              <text
                                x={bx}
                                y={by}
                                textAnchor="middle"
                                dominantBaseline="central"
                                fill="#050F1E"
                                fontSize="9"
                                fontWeight="bold"
                              >
                                {pt.displayPosition}
                              </text>
                            </g>
                          );
                        })}
                      </g>
                    </svg>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function CrewRoutePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-[#8BAABF]">
          <Loader2 className="w-8 h-8 text-[#1E88E5] animate-spin mb-4" />
          <p className="text-sm">Loading operations control board...</p>
        </div>
      }
    >
      <CrewRouteContent />
    </Suspense>
  );
}

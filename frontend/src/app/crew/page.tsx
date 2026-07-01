"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useOrderSocket } from "@/lib/ws";
import { useCrewFlights } from "./_lib/useCrewFlights";
import { FlightSearchSelect } from "./_components/FlightSearchSelect";
import Link from "next/link";
import {
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  User,
  ShieldAlert,
  LogOut,
  Sliders,
  Check,
  Play,
  Search,
  Plane
} from "lucide-react";



const STAGES = ["received", "confirmed", "preparing", "en_route", "delivered"] as const;
const NEXT_STAGE: Record<string, string | null> = {
  received: "confirmed",
  confirmed: "preparing",
  preparing: "en_route",
  en_route: "delivered",
  delivered: null,
};
const STAGE_LABELS: Record<string, string> = {
  received: "Received",
  confirmed: "Confirmed",
  preparing: "Preparing",
  en_route: "En Route",
  delivered: "Delivered",
};
// Button label = what the NEXT action does
const ADVANCE_LABELS: Record<string, string> = {
  received: "Confirm Order",
  confirmed: "Start Preparing",
  preparing: "Send En Route",
  en_route: "Mark Delivered",
};

interface CrewTask {
  id: string;
  order_id: string;
  crew_id: string | null;
  seat_number: string;
  route_position: number;
  status: string;
  order_status: string;
  priority_score: number;
  allergen_warnings: string[];
  ordered_items: string[];
  priority_factors?: string[];
  created_at: string;
}

function CrewDashboardContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { accessToken, email, role, logout } = useAuth();
  const { flights } = useCrewFlights(accessToken);

  const flightId = searchParams.get("flight_id");

  const [tasks, setTasks] = useState<CrewTask[]>([]);
  const [assignedToMe, setAssignedToMe] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seatSearch, setSeatSearch] = useState("");
  
  // Track action errors individually per task ID
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  const fetchTasks = async () => {
    try {
      const params = new URLSearchParams();
      if (assignedToMe) params.set("assigned_to_me", "true");
      if (flightId) params.set("flight_id", flightId);
      const qs = params.toString();
      const endpoint = `/api/v1/crew/dashboard${qs ? `?${qs}` : ""}`;
      const response = await api.get<{ data: CrewTask[] }>(endpoint, accessToken || undefined);
      setTasks(response.data || []);
      setError(null);
    } catch (err) {
      console.error("Failed to fetch crew tasks:", err);
      if (err instanceof ApiError) {
        setError(err.detail || "Failed to load crew tasks.");
      } else {
        setError("Failed to load crew tasks.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, [assignedToMe, accessToken, flightId]);

  // Live updates via WebSocket
  // Derived simplest flight context: accepts flight_id query parameter from searchParams.
  useOrderSocket(flightId, accessToken, (event) => {
    if (event === "ORDER_STATUS_UPDATE") {
      console.log("Order update event received via WS, refreshing crew tasks.");
      fetchTasks();
    }
  });

  const updateTaskStatus = async (taskId: string, newStatus: string) => {
    setActionLoading(prev => ({ ...prev, [taskId]: true }));
    setActionErrors(prev => ({ ...prev, [taskId]: "" }));
    try {
      await api.put<any>(
        `/api/v1/tasks/${taskId}/status`,
        { status: newStatus },
        accessToken || undefined
      );
      // Refresh list to remove completed task or update state
      await fetchTasks();
    } catch (err) {
      console.error(`Failed to update task status to ${newStatus}:`, err);
      if (err instanceof ApiError) {
        setActionErrors(prev => ({ ...prev, [taskId]: err.detail }));
      } else {
        setActionErrors(prev => ({ ...prev, [taskId]: "Status update failed." }));
      }
    } finally {
      setActionLoading(prev => ({ ...prev, [taskId]: false }));
    }
  };

  const getPriorityInfo = (score: number) => {
    if (score >= 8) {
      return {
        label: "Critical",
        colorClass: "text-[#EF5350] border-[#EF5350] bg-[rgba(239,83,80,0.1)]",
        badgeClass: "bg-[#C62828] text-white"
      };
    } else if (score >= 5) {
      return {
        label: "High",
        colorClass: "text-[#FFB74D] border-[#FFB74D] bg-[rgba(255,183,77,0.1)]",
        badgeClass: "bg-[#F57C00] text-white"
      };
    } else {
      return {
        label: "Standard",
        colorClass: "text-[#64B5F6] border-[#64B5F6] bg-[rgba(100,181,246,0.1)]",
        badgeClass: "bg-[#1E88E5] text-white"
      };
    }
  };

  const hasCriticalTask = tasks.some(t => t.priority_score >= 8);
  const tasksFiltered = tasks
    .filter(t =>
      t.seat_number.toLowerCase().includes(seatSearch.trim().toLowerCase())
    )
    .sort((a, b) => {
      // Priority first (Critical > High > Standard), then delivery sequence within a tier.
      if (b.priority_score !== a.priority_score) return b.priority_score - a.priority_score;
      return (a.route_position ?? 0) - (b.route_position ?? 0);
    });

  return (
    <div className="min-h-screen text-[#E8F1FA] font-sans pb-12">
      
      {/* Top Banner Alert */}
      {hasCriticalTask && (
        <div className="bg-[#C62828] text-white py-2 px-4 text-center text-xs sm:text-sm font-bold flex items-center justify-center gap-2 animate-pulse shadow-md">
          <AlertTriangle className="w-4.5 h-4.5" />
          <span>⚠ CRITICAL PRIORITY TASK PENDING: One or more passengers require immediate service!</span>
        </div>
      )}

      {/* Nav Header */}
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
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-6 border-t border-[rgba(30,136,229,0.1)] pt-4">
            <div className="flex items-center gap-2 text-sm">
              <Link
                href={`/crew?flight_id=${flightId || ""}`}
                className="px-3 py-1.5 font-bold transition-all border-b-2 text-[#1E88E5] border-[#1E88E5]"
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
                onSelect={(id) => router.push(`/crew?flight_id=${id}`)}
              />
            </div>
          </div>
        </div>
      </header>

      {/* Main Dashboard Grid */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 mt-6">
        
        {/* Toggle & Legend Toolbar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 bg-[#0A1929] border border-[rgba(30,136,229,0.1)] rounded-xl p-4">
          
          {/* Toggle Switches */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAssignedToMe(true)}
              className={`h-10 px-4 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                assignedToMe
                  ? "bg-[#BBDEFB] text-[#0A2F5E] shadow-sm"
                  : "bg-[#050F1E] border border-[rgba(30,136,229,0.1)] text-[#8BAABF] hover:text-[#E8F1FA]"
              }`}
              style={{ minHeight: "44px" }}
            >
              My Tasks
            </button>
            <button
              onClick={() => setAssignedToMe(false)}
              className={`h-10 px-4 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                !assignedToMe
                  ? "bg-[#BBDEFB] text-[#0A2F5E] shadow-sm"
                  : "bg-[#050F1E] border border-[rgba(30,136,229,0.1)] text-[#8BAABF] hover:text-[#E8F1FA]"
              }`}
              style={{ minHeight: "44px" }}
            >
              All Tasks
            </button>
          </div>

          {/* Priority Legend */}
          <div className="flex flex-col gap-2">
            <span className="text-[11px] text-[var(--color-text-muted)] font-semibold uppercase tracking-wide">Priority Index</span>
            <div className="flex flex-wrap gap-2">
              <div className="flex items-start gap-2 pl-2 pr-3 py-1.5 rounded-md bg-[rgba(239,83,80,0.08)] border-l-[3px] border-[#EF5350]">
                <span className="w-2 h-2 rounded-full bg-[#EF5350] mt-1 shrink-0" />
                <div className="leading-tight">
                  <div className="text-[12px] font-bold text-[#EF5350]">Critical &middot; score &ge;8</div>
                  <div className="text-[10px] text-[var(--color-text-muted)]">Medical or first-class &mdash; serve first</div>
                </div>
              </div>
              <div className="flex items-start gap-2 pl-2 pr-3 py-1.5 rounded-md bg-[rgba(255,179,0,0.08)] border-l-[3px] border-[#FFB300]">
                <span className="w-2 h-2 rounded-full bg-[#FFB300] mt-1 shrink-0" />
                <div className="leading-tight">
                  <div className="text-[12px] font-bold text-[#F57C00]">High &middot; score 5&ndash;7</div>
                  <div className="text-[10px] text-[var(--color-text-muted)]">Infant or connecting flight</div>
                </div>
              </div>
              <div className="flex items-start gap-2 pl-2 pr-3 py-1.5 rounded-md bg-[rgba(66,165,245,0.08)] border-l-[3px] border-[#42A5F5]">
                <span className="w-2 h-2 rounded-full bg-[#42A5F5] mt-1 shrink-0" />
                <div className="leading-tight">
                  <div className="text-[12px] font-bold text-[#1E88E5]">Standard &middot; score &lt;5</div>
                  <div className="text-[10px] text-[var(--color-text-muted)]">Regular service</div>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* WebSocket warning notice if flight_id is missing */}
        {!flightId && (
          <div className="bg-[rgba(30,136,229,0.05)] border border-[rgba(30,136,229,0.15)] rounded-lg p-3 text-xs text-[#8BAABF] mb-6">
            <span>ℹ Real-time task syncing is restricted (missing URL <code>?flight_id=&lt;id&gt;</code>). You may manually reload to check for new passenger orders.</span>
          </div>
        )}

        {/* Loader */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-[#8BAABF]">
            <Loader2 className="w-10 h-10 text-[#1E88E5] animate-spin mb-4" />
            <p className="text-sm">Fetching operation task board...</p>
          </div>
        ) : error ? (
          <div className="glass-card p-8 text-center max-w-md mx-auto">
            <AlertTriangle className="w-12 h-12 text-[#EF5350] mx-auto mb-4" />
            <h3 className="font-bold text-lg text-[#E8F1FA] mb-2">Error Loading Tasks</h3>
            <p className="text-xs text-[#8BAABF] mb-6 leading-relaxed">{error}</p>
            <button
              onClick={fetchTasks}
              className="h-11 px-6 bg-[#90CAF9] hover:bg-[#64B5F6] text-[#0A2F5E] rounded-lg text-xs font-semibold cursor-pointer"
            >
              Reload Page
            </button>
          </div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-20 bg-[#0A1929] border border-[rgba(30,136,229,0.1)] rounded-xl p-8">
            <CheckCircle2 className="w-12 h-12 text-[#4CAF50] mx-auto mb-3 animate-pulse" />
            <h2 className="text-[#E8F1FA] text-lg font-bold mb-1">Queue Completed</h2>
            <p className="text-sm text-[#8BAABF]">There are currently no active delivery tasks pending in this class.</p>
          </div>
        ) : (
          /* Tablet/Desktop task board grids */
          <>
            <div className="flex items-center gap-2 mb-4 mt-2">
              <div className="flex items-center gap-2 px-3 h-10 bg-[#0A1929] border border-[rgba(30,136,229,0.15)] rounded-lg flex-1 max-w-xs">
                <Search className="w-4 h-4 text-[#8BAABF]" />
                <input
                  value={seatSearch}
                  onChange={e => setSeatSearch(e.target.value)}
                  placeholder="Search seat (e.g. Y11C)…"
                  className="w-full bg-transparent text-sm text-[#E8F1FA] placeholder-[#5C7E97] focus:outline-none"
                />
              </div>
              {seatSearch && (
                <span className="text-xs text-[#8BAABF]">{tasksFiltered.length} match(es)</span>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {tasksFiltered.map(task => {
              const priority = getPriorityInfo(task.priority_score);
              const taskActionError = actionErrors[task.id];
              const taskActionLoading = actionLoading[task.id];

              return (
                <div
                  key={task.id}
                  className={`flex flex-col justify-between overflow-hidden rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-card)] shadow-[var(--shadow-sm)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--color-border-light)] hover:shadow-[var(--shadow-md)]`}
                >
                  <div className={`flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3 ${priority.colorClass}`}>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">Seat</span>
                      <span className="text-2xl font-black leading-none text-[var(--color-text-primary)]">{task.seat_number}</span>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <span className={`rounded-[var(--radius-pill)] px-2 py-0.5 text-[10px] font-bold ${priority.badgeClass}`}>
                        {priority.label} ({task.priority_score.toFixed(1)})
                      </span>
                      <span className="text-[10px] text-[var(--color-text-muted)]">
                        {task.route_position === 99 || task.route_position === null
                          ? "Unrouted"
                          : `Queue: #${task.route_position}`}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-3 p-4">

                    {task.priority_factors && task.priority_factors.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {task.priority_factors.map(f => (
                          <span key={f} className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-full bg-[rgba(239,83,80,0.15)] text-[#EF5350]">
                            {f}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Meal items */}
                    <div className="space-y-1.5 bg-[#050F1E] border border-[rgba(30,136,229,0.08)] rounded-lg p-3">
                      <div className="text-[10px] text-[#8BAABF] font-semibold uppercase tracking-wider">Ordered Menu Items:</div>
                      <ul className="text-xs text-[#E8F1FA] space-y-1.5">
                        {task.ordered_items.map((item, idx) => (
                          <li key={idx} className="flex items-start gap-1">
                            <span className="text-[#1E88E5] font-bold select-none">•</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Allergens warning */}
                    {task.allergen_warnings.length > 0 && (
                      <div className="bg-[rgba(198,40,40,0.12)] border border-[rgba(198,40,40,0.3)] rounded-lg p-2.5 text-xs text-[#EF5350] flex items-start gap-2">
                        <ShieldAlert className="w-4.5 h-4.5 flex-shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold uppercase tracking-wider text-[9px] block mb-0.5">⚠ Safety Conflict</span>
                          <span>Passenger allergic to: {task.allergen_warnings.join(", ")}</span>
                        </div>
                      </div>
                    )}

                    {/* Task Error */}
                    {taskActionError && (
                      <div className="bg-[rgba(198,40,40,0.1)] text-[#EF5350] text-[11px] p-2 rounded-lg flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                        <span>{taskActionError}</span>
                      </div>
                    )}

                  </div>

                  {/* Actions footer */}
                  <div className="p-4 pt-0 mt-2 border-t border-[rgba(30,136,229,0.05)]">
                    <div className="flex justify-between items-center gap-2 mt-3 text-xs text-[#8BAABF]">
                      <div className="flex flex-col gap-0.5">
                        <span>Delivery Task: <strong className="uppercase tracking-wide text-[var(--color-text)] text-[10px]">{task.status}</strong></span>
                        <span>Order Stage: <strong className="uppercase tracking-wide text-[var(--color-text)] text-[10px]">{STAGE_LABELS[task.order_status] || task.order_status}</strong></span>
                      </div>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-[#FF6B35]" />
                        <span>{new Date(task.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </span>
                    </div>

                    {/* 5-dot progress indicator */}
                    <div className="flex items-center gap-1 py-2 mt-1">
                      {STAGES.map((stage, idx) => {
                        const currentStageIndex = STAGES.indexOf(task.order_status as any);
                        const isCompletedOrCurrent = idx <= currentStageIndex;
                        const isDelivered = stage === "delivered";
                        let dotColor = "bg-[rgba(30,136,229,0.15)]";
                        if (isCompletedOrCurrent) {
                          dotColor = isDelivered ? "bg-[#4CAF50]" : "bg-[#1E88E5]";
                        }
                        return (
                          <div
                            key={stage}
                            className={`h-2 flex-1 rounded-full transition-all duration-300 ${dotColor}`}
                            title={STAGE_LABELS[stage]}
                          />
                        );
                      })}
                    </div>

                    <div className="mt-3">
                      {(() => {
                        const next = NEXT_STAGE[task.order_status];
                        if (next !== null) {
                          return (
                            <button
                              onClick={() => updateTaskStatus(task.id, next)}
                              disabled={taskActionLoading}
                              className="w-full h-11 bg-[#90CAF9] hover:bg-[#64B5F6] text-[#0A2F5E] font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                              style={{ minHeight: "44px" }}
                            >
                              {taskActionLoading ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Play className="w-3.5 h-3.5 fill-current" />
                              )}
                              <span>{ADVANCE_LABELS[task.order_status] || "Advance Stage"}</span>
                            </button>
                          );
                        } else {
                          return (
                            <div
                              className="w-full h-11 bg-[rgba(76,175,80,0.1)] border border-[rgba(76,175,80,0.2)] text-[#4CAF50] rounded-lg text-xs font-bold flex items-center justify-center gap-1.5"
                              style={{ minHeight: "44px" }}
                            >
                              <Check className="w-4 h-4" />
                              <span>Delivered</span>
                            </div>
                          );
                        }
                      })()}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          </>
        )}

      </main>

    </div>
  );
}

export default function CrewDashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-[#8BAABF]">
          <Loader2 className="w-8 h-8 text-[#1E88E5] animate-spin mb-4" />
          <p className="text-sm">Loading operations control board...</p>
        </div>
      }
    >
      <CrewDashboardContent />
    </Suspense>
  );
}

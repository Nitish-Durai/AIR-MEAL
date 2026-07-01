"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import Link from "next/link";
import { LogOut, ArrowRight, CheckCircle, RefreshCw, Settings, Search, ChevronDown } from "lucide-react";
import { api } from "@/lib/api";


export default function PassengerPage() {
  const router = useRouter();
  const { email, logout, accessToken } = useAuth();

  const firstName = email
    ? email.split("@")[0].split(/[._-]/)[0].replace(/[0-9]/g, "").replace(/^\w/, c => c.toUpperCase())
    : "Passenger";

  // Active session state
  const [activeFlightId, setActiveFlightId] = useState<string | null>(null);
  const [activeCabinClass, setActiveCabinClass] = useState<string | null>(null);
  const [activeSeatNumber, setActiveSeatNumber] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Form states
  interface FlightOpt { id: string; flight_number: string; origin: string; destination: string; status: string; }
  const [flights, setFlights] = useState<FlightOpt[]>([]);
  const [flightQuery, setFlightQuery] = useState("");
  const [flightOpen, setFlightOpen] = useState(false);
  const [selectedFlight, setSelectedFlight] = useState<FlightOpt | null>(null);
  const [selectedCabinClass, setSelectedCabinClass] = useState("economy");
  const [seatInput, setSeatInput] = useState("");
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setActiveFlightId(localStorage.getItem("airmeal_flight_id"));
      setActiveCabinClass(localStorage.getItem("airmeal_cabin_class"));
      setActiveSeatNumber(localStorage.getItem("airmeal_seat_number"));
    }
  }, []);

  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let W = 0, H = 0;
    const resize = () => {
      W = cvs.width = window.innerWidth;
      H = cvs.height = window.innerHeight;
    };
    resize();
    const nodes = Array.from({ length: 60 }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35,
    }));
    const planes = Array.from({ length: 3 }, () => ({
      x: Math.random() * W, y: 60 + Math.random() * (H - 120), s: 0.4 + Math.random() * 0.5,
    }));
    const nodeColor = "rgba(130,185,255,0.7)";
    const lineBase = "59,157,255";
    const planeColor = "rgba(255,122,69,0.35)";
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      for (const n of nodes) {
        n.x += n.vx; n.y += n.vy;
        if (n.x < 0 || n.x > W) n.vx *= -1;
        if (n.y < 0 || n.y > H) n.vy *= -1;
      }
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 150) {
            ctx.strokeStyle = `rgba(${lineBase},${0.18 * (1 - d / 150)})`;
            ctx.lineWidth = 0.6;
            ctx.beginPath(); ctx.moveTo(nodes[i].x, nodes[i].y); ctx.lineTo(nodes[j].x, nodes[j].y); ctx.stroke();
          }
        }
      }
      for (const n of nodes) { ctx.fillStyle = nodeColor; ctx.beginPath(); ctx.arc(n.x, n.y, 1.4, 0, 7); ctx.fill(); }
      for (const p of planes) {
        p.x += p.s;
        if (p.x > W + 30) { p.x = -30; p.y = 60 + Math.random() * (H - 120); }
        ctx.fillStyle = planeColor;
        ctx.save(); ctx.translate(p.x, p.y);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-10, -3); ctx.lineTo(-7, 0); ctx.lineTo(-10, 3); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    window.addEventListener("resize", resize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);

  useEffect(() => {
    if (!accessToken) return;
    api.get<{ data: FlightOpt[] }>("/api/v1/flights", accessToken)
      .then(res => setFlights(res.data || []))
      .catch(() => setFlights([]));
  }, [accessToken]);

  const handleStartSession = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    const flightId = selectedFlight?.id || "";
    if (!flightId) {
      setFormError("Please search and select your flight.");
      return;
    }
    if (!seatInput.trim()) {
      setFormError("Please enter your seat number (e.g. 12A, 34C).");
      return;
    }

    // Persist details locally
    localStorage.setItem("airmeal_flight_id", flightId);
    localStorage.setItem("airmeal_cabin_class", selectedCabinClass);
    localStorage.setItem("airmeal_seat_number", seatInput.trim());

    // Route to menu page
    router.push(
      `/passenger/menu?flight_id=${flightId}&cabin_class=${selectedCabinClass}&seat_number=${seatInput.trim()}`
    );
  };

  const handleClearSession = () => {
    localStorage.removeItem("airmeal_flight_id");
    localStorage.removeItem("airmeal_cabin_class");
    localStorage.removeItem("airmeal_seat_number");
    setActiveFlightId(null);
    setActiveCabinClass(null);
    setActiveSeatNumber(null);
  };

  const flightFiltered = flights.filter(f => {
    const q = flightQuery.trim().toLowerCase();
    if (!q) return true;
    return `${f.flight_number} ${f.origin} ${f.destination} ${f.status}`.toLowerCase().includes(q);
  });

  return (
    <div className="min-h-screen flex flex-col justify-between py-12 px-4 font-sans text-[var(--color-text)] relative">

      {/* Main container */}
      <div className="w-full max-w-md mx-auto z-10">
        
        {/* Header Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#1E88E5] to-[#0A2F5E] flex items-center justify-center shadow-lg">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="white" stroke="none">
              <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
            </svg>
          </div>
          <span className="text-xl font-extrabold tracking-tight">
            Air<span className="text-[#FF6B35]">Meal</span>
          </span>
        </div>

        {/* Dashboard Card */}
        <div className="glass-card p-6 sm:p-8 mb-6 transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:shadow-[0_20px_50px_rgba(30,136,229,0.15)]">
          <div className="text-center mb-6">
            <div className="text-4xl mb-3">🛫</div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--color-text)]">
              Welcome aboard, {firstName}!
            </h1>
          </div>

          {activeFlightId ? (
            /* Active flight session overview */
            <div className="space-y-4">
              <div className="bg-[var(--color-surface)] border border-[rgba(30,136,229,0.15)] rounded-lg p-4">
                <div className="flex items-center gap-2 text-[#4CAF50] text-xs font-bold uppercase tracking-wider mb-2">
                  <CheckCircle className="w-4 h-4" />
                  <span>Active Session</span>
                </div>
                
                <div className="grid grid-cols-2 gap-3 mt-1 text-sm">
                  <div>
                    <span className="text-[#8BAABF] text-xs uppercase block">Flight ID</span>
                    <span className="font-semibold">{activeFlightId.substring(0, 8).toUpperCase()}…</span>
                  </div>
                  <div>
                    <span className="text-[#8BAABF] text-xs uppercase block">Seat / Cabin</span>
                    <span className="font-semibold capitalize">{activeSeatNumber} ({activeCabinClass})</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <Link
                  href="/passenger/onboarding"
                  className="w-full flex items-center justify-center gap-2 h-11 font-semibold rounded-lg text-sm cursor-pointer select-none"
                  style={{
                    display: "flex",
                    background: "rgba(30,136,229,0.12)",
                    border: "1px solid #1E88E5",
                    color: "#1E88E5",
                    boxShadow: "none",
                    transform: "translateY(0)",
                    transition: "transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease, background 0.2s ease",
                  }}
                  onMouseEnter={(e) => {
                    const el = e.currentTarget as HTMLAnchorElement;
                    el.style.transform = "translateY(-3px)";
                    el.style.boxShadow = "0 8px 28px rgba(30,136,229,0.45)";
                    el.style.borderColor = "#42a5f5";
                    el.style.background = "rgba(30,136,229,0.28)";
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget as HTMLAnchorElement;
                    el.style.transform = "translateY(0)";
                    el.style.boxShadow = "none";
                    el.style.borderColor = "#1E88E5";
                    el.style.background = "rgba(30,136,229,0.12)";
                  }}
                >
                  <Settings className="w-4 h-4" />
                  <span>Edit Dietary Preferences</span>
                </Link>

                <button
                  onClick={handleClearSession}
                  className="w-full flex items-center justify-center gap-2 h-11 font-semibold rounded-lg text-sm cursor-pointer select-none"
                  style={{
                    background: "transparent",
                    border: "1px solid rgba(30,136,229,0.3)",
                    color: "#1E88E5",
                    boxShadow: "none",
                    transform: "translateY(0)",
                    transition: "transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease, background 0.2s ease",
                  }}
                  onMouseEnter={(e) => {
                    const el = e.currentTarget as HTMLButtonElement;
                    el.style.transform = "translateY(-3px)";
                    el.style.boxShadow = "0 8px 28px rgba(30,136,229,0.35)";
                    el.style.borderColor = "#42a5f5";
                    el.style.background = "rgba(30,136,229,0.1)";
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget as HTMLButtonElement;
                    el.style.transform = "translateY(0)";
                    el.style.boxShadow = "none";
                    el.style.borderColor = "rgba(30,136,229,0.3)";
                    el.style.background = "transparent";
                  }}
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Switch Flight / Seat</span>
                </button>

                <Link
                  href={`/passenger/menu?flight_id=${activeFlightId}&cabin_class=${activeCabinClass}&seat_number=${activeSeatNumber}`}
                  className="w-full flex items-center justify-center gap-2 h-11 font-semibold rounded-lg text-sm cursor-pointer select-none"
                  style={{
                    display: "flex",
                    background: "#1E88E5",
                    border: "1px solid #1E88E5",
                    color: "white",
                    boxShadow: "none",
                    transform: "translateY(0)",
                    transition: "transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease, background 0.2s ease",
                  }}
                  onMouseEnter={(e) => {
                    const el = e.currentTarget as HTMLAnchorElement;
                    el.style.transform = "translateY(-3px)";
                    el.style.boxShadow = "0 10px 32px rgba(30,136,229,0.55)";
                    el.style.background = "#1565C0";
                    el.style.borderColor = "#1565C0";
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget as HTMLAnchorElement;
                    el.style.transform = "translateY(0)";
                    el.style.boxShadow = "none";
                    el.style.background = "#1E88E5";
                    el.style.borderColor = "#1E88E5";
                  }}
                >
                  <span>Browse Menu</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          ) : (
            /* Form to select flight and seat details */
            <form onSubmit={handleStartSession} className="space-y-4">
              <div className="relative">
                <label className="text-xs font-semibold text-[#8BAABF] uppercase tracking-wider block mb-1.5">
                  Select Your Flight
                </label>
                <button
                  type="button"
                  onClick={() => { setFlightOpen(o => !o); setFlightQuery(""); }}
                  className="w-full h-11 px-3 flex items-center justify-between gap-2 bg-[var(--color-surface)] border border-[rgba(30,136,229,0.15)] rounded-lg text-sm text-[var(--color-text)] focus:outline-none focus:border-[#1E88E5]"
                >
                  <span className={selectedFlight ? "" : "text-[#8BAABF]"}>
                    {selectedFlight
                      ? `${selectedFlight.flight_number} (${selectedFlight.origin}→${selectedFlight.destination}, ${selectedFlight.status})`
                      : "Search and select your flight"}
                  </span>
                  <ChevronDown className="w-4 h-4 text-[#8BAABF] flex-shrink-0" />
                </button>
                {flightOpen && (
                  <div className="absolute z-50 mt-1 w-full bg-[var(--color-surface)] border border-[rgba(30,136,229,0.25)] rounded-lg shadow-2xl overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 border-b border-[rgba(30,136,229,0.15)]">
                      <Search className="w-3.5 h-3.5 text-[#8BAABF]" />
                      <input
                        autoFocus
                        value={flightQuery}
                        onChange={e => setFlightQuery(e.target.value)}
                        placeholder="Search flight (e.g. SV230)…"
                        className="w-full bg-transparent text-sm text-[var(--color-text)] placeholder-[#5C7E97] focus:outline-none"
                      />
                    </div>
                    <div className="max-h-60 overflow-y-auto">
                      {flightFiltered.map(f => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => { setSelectedFlight(f); setFlightOpen(false); }}
                          className="w-full text-left px-3 py-2 text-sm text-[var(--color-text)] hover:bg-[rgba(30,136,229,0.1)]"
                        >
                          {`${f.flight_number} (${f.origin}→${f.destination}, ${f.status})`}
                        </button>
                      ))}
                      {flightFiltered.length === 0 && (
                        <div className="px-3 py-3 text-xs text-[#5C7E97]">No flights match.</div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-[#8BAABF] uppercase tracking-wider block mb-1.5">
                    Cabin Class
                  </label>
                  <select
                    value={selectedCabinClass}
                    onChange={(e) => setSelectedCabinClass(e.target.value)}
                    className="w-full h-11 px-3 bg-[var(--color-surface)] border border-[rgba(30,136,229,0.15)] rounded-lg text-sm text-[var(--color-text)] focus:outline-none focus:border-[#1E88E5] capitalize"
                  >
                    <option value="economy">Economy</option>
                    <option value="business">Business</option>
                    <option value="first">First Class</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-[#8BAABF] uppercase tracking-wider block mb-1.5">
                    Seat Number
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 12A, 34C"
                    value={seatInput}
                    onChange={(e) => setSeatInput(e.target.value)}
                    className="w-full h-11 px-3 bg-[var(--color-surface)] border border-[rgba(30,136,229,0.15)] rounded-lg text-sm text-[var(--color-text)] placeholder-[#8BAABF] focus:outline-none focus:border-[#1E88E5] uppercase"
                  />
                </div>
              </div>

              {formError && (
                <p className="text-xs text-[#EF5350] bg-[rgba(198,40,40,0.1)] border border-[rgba(198,40,40,0.2)] rounded p-2 text-center font-medium">
                  {formError}
                </p>
              )}

              <div className="flex flex-col gap-2 pt-2">
                <Link
                  href="/passenger/onboarding"
                  className="w-full flex items-center justify-center gap-2 h-11 font-semibold rounded-lg text-sm cursor-pointer select-none"
                  style={{
                    display: "flex",
                    background: "rgba(30,136,229,0.12)",
                    border: "1px solid #1E88E5",
                    color: "#1E88E5",
                    boxShadow: "none",
                    transform: "translateY(0)",
                    transition: "transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease, background 0.2s ease",
                  }}
                  onMouseEnter={(e) => {
                    const el = e.currentTarget as HTMLAnchorElement;
                    el.style.transform = "translateY(-3px)";
                    el.style.boxShadow = "0 8px 28px rgba(30,136,229,0.45)";
                    el.style.borderColor = "#42a5f5";
                    el.style.background = "rgba(30,136,229,0.28)";
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget as HTMLAnchorElement;
                    el.style.transform = "translateY(0)";
                    el.style.boxShadow = "none";
                    el.style.borderColor = "#1E88E5";
                    el.style.background = "rgba(30,136,229,0.12)";
                  }}
                >
                  <Settings className="w-4 h-4" />
                  <span>Edit Dietary Preferences</span>
                </Link>

                <button
                  type="submit"
                  className="w-full flex items-center justify-center gap-2 h-11 font-semibold rounded-lg text-sm cursor-pointer select-none"
                  style={{
                    background: "#1E88E5",
                    border: "1px solid #1E88E5",
                    color: "white",
                    boxShadow: "none",
                    transform: "translateY(0)",
                    transition: "transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease, background 0.2s ease",
                  }}
                  onMouseEnter={(e) => {
                    const el = e.currentTarget as HTMLButtonElement;
                    el.style.transform = "translateY(-3px)";
                    el.style.boxShadow = "0 10px 32px rgba(30,136,229,0.55)";
                    el.style.background = "#1565C0";
                    el.style.borderColor = "#1565C0";
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget as HTMLButtonElement;
                    el.style.transform = "translateY(0)";
                    el.style.boxShadow = "none";
                    el.style.background = "#1E88E5";
                    el.style.borderColor = "#1E88E5";
                  }}
                >
                  <span>Browse Menu</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          )}

          <div className="border-t border-[rgba(30,136,229,0.1)] mt-6 pt-6 flex flex-col items-center">
            <button
              onClick={logout}
              className="w-full flex items-center justify-center gap-2 h-11 font-semibold rounded-lg text-sm cursor-pointer select-none"
              style={{
                background: "rgba(198,40,40,0.1)",
                border: "1px solid rgba(198,40,40,0.35)",
                color: "#f87171",
                boxShadow: "none",
                transform: "translateY(0)",
                transition: "transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease, background 0.2s ease",
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLButtonElement;
                el.style.transform = "translateY(-3px)";
                el.style.boxShadow = "0 8px 28px rgba(198,40,40,0.35)";
                el.style.borderColor = "rgba(198,40,40,0.7)";
                el.style.background = "rgba(198,40,40,0.2)";
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLButtonElement;
                el.style.transform = "translateY(0)";
                el.style.boxShadow = "none";
                el.style.borderColor = "rgba(198,40,40,0.35)";
                el.style.background = "rgba(198,40,40,0.1)";
              }}
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

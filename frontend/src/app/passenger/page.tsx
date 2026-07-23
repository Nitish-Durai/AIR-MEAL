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

  // Board form state (PNR + last name)
  const [pnrInput, setPnrInput] = useState("");
  const [lastNameInput, setLastNameInput] = useState("");
  const [boarding, setBoarding] = useState(false);
  const [formError, setFormError] = useState("");

  // Boarding confirmation: set after a successful claim so the passenger can
  // verify the booking is theirs before continuing to the menu.
  const [boardedInfo, setBoardedInfo] = useState<BoardResp | null>(null);

  // Lockout countdown: seconds remaining after the server returns 429 for
  // too many failed boarding claims. Zero means the form is usable.
  const [lockoutSeconds, setLockoutSeconds] = useState(0);

  useEffect(() => {
    if (typeof window !== "undefined") {
      // Always start a fresh boarding session: clear any stored flight so the
      // PNR + last name board form is shown on every visit to this page.
      localStorage.removeItem("airmeal_flight_id");
      localStorage.removeItem("airmeal_cabin_class");
      localStorage.removeItem("airmeal_seat_number");
      setActiveFlightId(null);
      setActiveCabinClass(null);
      setActiveSeatNumber(null);
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

  interface BoardResp {
    flight_id: string;
    flight_number: string;
    first_name: string;
    origin: string;
    destination: string;
    seat_number: string;
    cabin_class: string;
    status: string;
  }

  const handleBoard = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!pnrInput.trim()) {
      setFormError("Please enter your booking reference (PNR).");
      return;
    }
    if (!lastNameInput.trim()) {
      setFormError("Please enter the last name on the booking.");
      return;
    }
    if (!accessToken) {
      setFormError("Your session expired. Please log in again.");
      return;
    }

    setBoarding(true);
    try {
      const res = await api.post<BoardResp>(
        "/auth/board",
        { pnr: pnrInput.trim(), last_name: lastNameInput.trim() },
        accessToken,
      );
      localStorage.setItem("airmeal_flight_id", res.flight_id);
      localStorage.setItem("airmeal_cabin_class", res.cabin_class);
      localStorage.setItem("airmeal_seat_number", res.seat_number);
      setBoardedInfo(res);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not find that booking.";
      setFormError(msg);
      // Parse the retry window out of the rate-limit message so the form can
      // disable itself until the lockout expires.
      const match = /try again in (\d+) seconds/i.exec(msg);
      if (match) {
        setLockoutSeconds(parseInt(match[1], 10));
        // The button shows the live countdown, so keep the banner static.
        setFormError("Too many failed boarding attempts.");
      }
    } finally {
      setBoarding(false);
    }
  };

  useEffect(() => {
    if (lockoutSeconds <= 0) return;
    const id = setInterval(() => {
      setLockoutSeconds((s) => {
        if (s <= 1) {
          setFormError("");
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [lockoutSeconds > 0]);

  const handleClearSession = () => {
    localStorage.removeItem("airmeal_flight_id");
    localStorage.removeItem("airmeal_cabin_class");
    localStorage.removeItem("airmeal_seat_number");
    setActiveFlightId(null);
    setActiveCabinClass(null);
    setActiveSeatNumber(null);
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-4 py-12 font-sans text-[var(--color-text)]">

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
          {!boardedInfo && (
            <div className="text-center mb-6">
              <div className="text-4xl mb-3">🛫</div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--color-text)]">
                Ready to board, {firstName}?
              </h1>
            </div>
          )}

          {boardedInfo ? (
            /* Boarding confirmation — lets the passenger verify the booking
               resolved to their own seat before continuing to the menu. */
            <div>
              <div className="text-center mb-7">
                <div className="w-14 h-14 rounded-full bg-[rgba(76,175,80,0.10)] border border-[rgba(76,175,80,0.32)] flex items-center justify-center mx-auto mb-5">
                  <CheckCircle className="w-7 h-7 text-[#4CAF50]" />
                </div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--color-text)] mb-2">
                  Welcome aboard, {boardedInfo.first_name}
                </h1>
                <p className="text-sm text-[#8BAABF]">Your booking is confirmed</p>
              </div>

              <div className="border-t border-dashed border-[rgba(30,136,229,0.22)] pt-6 mb-6">
                <div className="flex items-end justify-between mb-7">
                  <div className="min-w-[76px]">
                    <div className="text-3xl font-bold tracking-tight leading-none text-[var(--color-text)]">
                      {boardedInfo.origin}
                    </div>
                  </div>
                  <div className="flex-1 px-4 text-center">
                    <div className="text-[11px] text-[#8BAABF] tracking-widest mb-2">
                      {boardedInfo.flight_number}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-px bg-[rgba(30,136,229,0.28)]" />
                      <ArrowRight className="w-4 h-4 text-[#1E88E5]" />
                      <div className="flex-1 h-px bg-[rgba(30,136,229,0.28)]" />
                    </div>
                  </div>
                  <div className="min-w-[76px] text-right">
                    <div className="text-3xl font-bold tracking-tight leading-none text-[var(--color-text)]">
                      {boardedInfo.destination}
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="flex-1 bg-[rgba(30,136,229,0.07)] rounded-lg p-3">
                    <div className="text-[10px] text-[#8BAABF] tracking-wider mb-1.5">SEAT</div>
                    <div className="text-base font-semibold text-[var(--color-text)]">
                      {boardedInfo.seat_number}
                    </div>
                  </div>
                  <div className="flex-1 bg-[rgba(30,136,229,0.07)] rounded-lg p-3">
                    <div className="text-[10px] text-[#8BAABF] tracking-wider mb-1.5">CABIN</div>
                    <div className="text-base font-semibold capitalize text-[var(--color-text)]">
                      {boardedInfo.cabin_class}
                    </div>
                  </div>
                  <div className="flex-1 bg-[rgba(30,136,229,0.07)] rounded-lg p-3">
                    <div className="text-[10px] text-[#8BAABF] tracking-wider mb-1.5">STATUS</div>
                    <div className="text-base font-semibold text-[#4CAF50] capitalize">
                      {boardedInfo.status.replace(/_/g, " ")}
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-dashed border-[rgba(30,136,229,0.22)] pt-6">
                <button
                  onClick={() => router.push("/passenger/onboarding")}
                  className="w-full flex items-center justify-center gap-2 h-12 font-semibold rounded-lg text-sm cursor-pointer select-none transition-colors"
                  style={{
                    background: "#64B5F6",
                    border: "1px solid #64B5F6",
                    color: "white",
                  }}
                  onMouseEnter={(e) => {
                    const el = e.currentTarget as HTMLButtonElement;
                    el.style.background = "#42A5F5";
                    el.style.borderColor = "#42A5F5";
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget as HTMLButtonElement;
                    el.style.background = "#64B5F6";
                    el.style.borderColor = "#64B5F6";
                  }}
                >
                  <span>Continue to menu</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                <p className="text-[11px] text-[#8BAABF] text-center mt-4">
                  Not your booking?{" "}
                  <button
                    onClick={() => {
                      handleClearSession();
                      setBoardedInfo(null);
                      setPnrInput("");
                      setLastNameInput("");
                    }}
                    className="text-[#1E88E5] hover:underline cursor-pointer"
                  >
                    Return to boarding
                  </button>
                </p>
              </div>
            </div>
          ) : activeFlightId ? (
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
            /* Board form: PNR + last name */
            <form onSubmit={handleBoard} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-[#8BAABF] uppercase tracking-wider block mb-1.5">
                  Booking Reference (PNR)
                </label>
                <input
                  type="text"
                  placeholder="e.g. SV2K9C"
                  value={pnrInput}
                  disabled={lockoutSeconds > 0}
                  onChange={(e) => setPnrInput(e.target.value.toUpperCase())}
                  className="w-full h-11 px-3 bg-[var(--color-surface)] border border-[rgba(30,136,229,0.15)] rounded-lg text-sm text-[var(--color-text)] placeholder-[#8BAABF] focus:outline-none focus:border-[#1E88E5] uppercase tracking-widest"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[#8BAABF] uppercase tracking-wider block mb-1.5">
                  Last Name on Booking
                </label>
                <input
                  type="text"
                  placeholder="e.g. Tang"
                  value={lastNameInput}
                  disabled={lockoutSeconds > 0}
                  onChange={(e) => setLastNameInput(e.target.value)}
                  className="w-full h-11 px-3 bg-[var(--color-surface)] border border-[rgba(30,136,229,0.15)] rounded-lg text-sm text-[var(--color-text)] placeholder-[#8BAABF] focus:outline-none focus:border-[#1E88E5]"
                />
              </div>

              {formError && (
                <p className="text-xs text-[#EF5350] bg-[rgba(198,40,40,0.1)] border border-[rgba(198,40,40,0.2)] rounded p-2 text-center font-medium">
                  {formError}
                </p>
              )}

              <div className="flex flex-col gap-2 pt-2">
                <button
                  type="submit"
                  disabled={boarding || lockoutSeconds > 0}
                  className="w-full flex items-center justify-center gap-2 h-11 font-bold rounded-lg text-sm cursor-pointer select-none disabled:opacity-60 disabled:cursor-not-allowed"
                  style={{
                    background: "#90CAF9",
                    border: "1px solid #64B5F6",
                    color: "#0A2F5E",
                    transition: "transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease",
                  }}
                >
                  <span>
                    {lockoutSeconds > 0
                      ? `Locked \u2014 retry in ${Math.floor(lockoutSeconds / 60)}:${String(lockoutSeconds % 60).padStart(2, "0")}`
                      : boarding
                        ? "Finding your flight\u2026"
                        : "Board Flight"}
                  </span>
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

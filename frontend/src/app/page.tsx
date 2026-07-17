"use client";

import { useEffect, useState, useRef } from "react";
import { api } from "@/lib/api";
import { AppBackground } from "@/components/AppBackground";

type HealthStatus = "checking" | "ok" | "error";
type Theme = "dark" | "light";

const roles = [
  {
    id: "passenger",
    label: "Passenger",
    description: "Browse the menu, get AI recommendations, and order your meal",
    accent: "#1E88E5",
    href: "/login/passenger",
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
      </svg>
    ),
  },
  {
    id: "crew",
    label: "Cabin Crew",
    description: "Manage delivery tasks, route optimisation, and live inventory",
    accent: "#FF6B35",
    href: "/login/crew",
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ),
  },
  {
    id: "admin",
    label: "Airline Admin",
    description: "Analytics, AI model management, flight ops, and reports",
    accent: "#42A5F5",
    href: "/login/admin",
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
      </svg>
    ),
  },
];

export default function HomePage() {
  const [health, setHealth] = useState<HealthStatus>("checking");
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);
  const [stats, setStats] = useState({ orders: 0, flights: 0, models: 0, foodUsed: 0 });
  const [targets, setTargets] = useState<{ orders: number; flights: number; models: number; food_used: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [showIntro, setShowIntro] = useState(true);
  const [introStep, setIntroStep] = useState(0);
  const [fadeIntro, setFadeIntro] = useState(false);

  useEffect(() => {
    const saved = (typeof window !== "undefined" && localStorage.getItem("airmeal-theme")) as Theme | null;
    if (saved === "light" || saved === "dark") setTheme(saved);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("airmeal-theme", theme);
  }, [theme]);

  useEffect(() => {
    const steps = [
      setTimeout(() => setIntroStep(1), 1200),
      setTimeout(() => setIntroStep(2), 2400),
      setTimeout(() => setIntroStep(3), 3600),
      setTimeout(() => setFadeIntro(true), 4200),
      setTimeout(() => setShowIntro(false), 4600),
    ];
    return () => steps.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    api.get<{ status: string }>("/health")
      .then((res) => setHealth(res.status === "ok" ? "ok" : "error"))
      .catch(() => setHealth("error"));
  }, []);

  useEffect(() => {
    api.get<{ data: { orders: number; flights: number; models: number; food_used: number } }>("/api/v1/public/stats")
      .then((res) => {
        if (res && res.data) {
          setTargets(res.data);
        } else {
          setTargets(null);
        }
      })
      .catch(() => setTargets(null));
  }, []);

  useEffect(() => {
    if (!targets || showIntro) return;
    let frame = 0;
    const total = 45;
    const t = setInterval(() => {
      frame++;
      const p = Math.min(frame / total, 1);
      setStats({
        orders: Math.round(targets.orders * p),
        flights: Math.round(targets.flights * p),
        models: Math.round(targets.models * p),
        foodUsed: Math.round((targets.food_used || 0) * p * 10) / 10,
      });
      if (p >= 1) clearInterval(t);
    }, 25);
    return () => clearInterval(t);
  }, [targets, showIntro]);

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
    const nodes = Array.from({ length: 70 }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35,
    }));
    const planes = Array.from({ length: 5 }, () => ({
      x: Math.random() * W, y: 60 + Math.random() * (H - 120), s: 0.4 + Math.random() * 0.5,
    }));
    const dark = theme === "dark";
    const nodeColor = dark ? "rgba(130,185,255,0.8)" : "rgba(30,100,180,0.6)";
    const lineBase = dark ? "59,157,255" : "30,110,200";
    const planeColor = dark ? "rgba(255,122,69,0.4)" : "rgba(220,90,40,0.45)";
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
  }, [theme]);

  const dark = theme === "dark";
  const C = {
    bg: dark ? "#050F1E" : "#F4F8FC",
    bgGlow: dark ? "rgba(30,136,229,0.18)" : "rgba(30,136,229,0.10)",
    cardBg: dark ? "rgba(13,33,55,0.75)" : "rgba(255,255,255,0.85)",
    cardBorder: dark ? "rgba(30,136,229,0.12)" : "rgba(30,136,229,0.18)",
    heading: dark ? "#E8F1FA" : "#0A2540",
    body: dark ? "#8BAABF" : "#5A7184",
    statLine: dark ? "rgba(255,255,255,0.1)" : "rgba(10,37,94,0.12)",
    statLabel: dark ? "#7d93af" : "#7088a0",
  };
  const statusColor = health === "ok" ? "#4CAF50" : health === "error" ? "#EF5350" : "#FFA726";
  const statusLabel = health === "ok" ? "API Connected" : health === "error" ? "API Unreachable" : "Connecting…";

  return (
    <main style={{
      minHeight: "100vh",
      background: `radial-gradient(ellipse 80% 60% at 50% -10%, var(--landing-glow) 0%, transparent 70%), var(--landing-bg)`,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "2rem", gap: "2.5rem", position: "relative", overflow: "hidden",
      transition: "background 0.3s ease",
    }}>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes flyAlongPath {
          0% { offset-distance: 0%; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { offset-distance: 100%; opacity: 0; }
        }
        .fly-plane {
          offset-path: path('M 20 80 Q 120 10 220 80');
          offset-rotate: auto;
          animation: flyAlongPath 1.6s cubic-bezier(0.25, 1, 0.5, 1) infinite;
        }
        @keyframes pulseGlow {
          0%, 100% { transform: scale(1); filter: drop-shadow(0 0 10px rgba(30,136,229,0.4)); }
          50% { transform: scale(1.08); filter: drop-shadow(0 0 25px rgba(30,136,229,0.8)); }
        }
        @keyframes fillCircle {
          from { stroke-dashoffset: 251.2; }
          to { stroke-dashoffset: 15; }
        }
        @keyframes floatCard {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }
        @keyframes lineGlow {
          0% { stroke-dashoffset: 100; }
          100% { stroke-dashoffset: 0; }
        }
      ` }} />

      {showIntro && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9999,
          background: "var(--intro-bg)",
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          opacity: fadeIntro ? 0 : 1, transition: "opacity 0.4s ease-in-out",
          pointerEvents: fadeIntro ? "none" : "auto",
        }}>
          <AppBackground />
          <button
            onClick={() => { setFadeIntro(true); setTimeout(() => setShowIntro(false), 400); }}
            style={{
              position: "absolute", bottom: "2rem", right: "2rem",
              background: "transparent", border: dark ? "1px solid rgba(255,255,255,0.15)" : "1px solid rgba(10,47,94,0.18)",
              color: dark ? "#8BAABF" : "#5C7E97", fontSize: "0.75rem", padding: "0.5rem 1rem",
              borderRadius: 6, cursor: "pointer", transition: "all 0.2s",
              fontFamily: "monospace", letterSpacing: "0.05em", zIndex: 10000
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = dark ? "rgba(255,255,255,0.3)" : "rgba(10,47,94,0.4)"; e.currentTarget.style.color = dark ? "#E8F1FA" : "#0A2F5E"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = dark ? "rgba(255,255,255,0.15)" : "rgba(10,47,94,0.18)"; e.currentTarget.style.color = dark ? "#8BAABF" : "#5C7E97"; }}
          >
            SKIP INTRO
          </button>

          <div style={{ textAlign: "center", maxWidth: 500, padding: "2rem", display: "flex", flexDirection: "column", gap: "2.5rem" }}>
            
            {/* Steps Container */}
            <div style={{ height: 160, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {introStep === 0 && (
                <div style={{ animation: "fadeIn 0.3s ease-in-out forwards" }}>
                  <svg width="240" height="100" viewBox="0 0 240 100" fill="none">
                    <path d="M 20 80 Q 120 10 220 80" stroke="rgba(30,136,229,0.15)" strokeWidth="4" strokeLinecap="round" />
                    <path d="M 20 80 Q 120 10 220 80" stroke="#1E88E5" strokeWidth="2" strokeDasharray="6 4" strokeLinecap="round" />
                    <circle cx="20" cy="80" r="4" fill="#1E88E5" style={{ filter: "drop-shadow(0 0 6px #1E88E5)" }} />
                    <circle cx="220" cy="80" r="4" fill="#FF6B35" style={{ filter: "drop-shadow(0 0 6px #FF6B35)" }} />
                    <g className="fly-plane">
                      <path d="M12,0 L0,-4 L2,0 L0,4 Z" fill={dark ? "#E8F1FA" : "#0A2F5E"} transform="scale(1.5)" />
                    </g>
                  </svg>
                </div>
              )}

              {introStep === 1 && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", position: "relative", animation: "fadeIn 0.3s ease-in-out forwards" }}>
                  <svg width="120" height="120" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="40" stroke="rgba(255,255,255,0.05)" strokeWidth="6" fill="none" />
                    <circle cx="50" cy="50" r="40" stroke="#4CAF50" strokeWidth="6" fill="none"
                            strokeDasharray="251.2" strokeDashoffset="251.2"
                            style={{
                              transform: "rotate(-90deg)",
                              transformOrigin: "50px 50px",
                              animation: "fillCircle 1s cubic-bezier(0.25, 1, 0.5, 1) forwards"
                            }} />
                    <path d="M32 62 h36 a18 18 0 0 0 -36 0 z M28 65 h44 v3 h-44 z" fill={dark ? "#E8F1FA" : "#0A2F5E"} />
                    <circle cx="50" cy="40" r="2.5" fill="#4CAF50" />
                  </svg>
                  <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#4CAF50", marginTop: "0.5rem", fontFamily: "monospace" }}>
                    98.2% FOOD UTILIZATION
                  </div>
                </div>
              )}

              {introStep === 2 && (
                <div style={{ display: "flex", gap: "1rem", alignItems: "center", animation: "fadeIn 0.3s ease-in-out forwards" }}>
                  <div style={{
                    background: "rgba(30,136,229,0.08)", border: "1px solid rgba(30,136,229,0.2)",
                    borderRadius: 10, padding: "0.75rem 1.25rem", fontSize: "0.85rem", color: dark ? "#E8F1FA" : "#0A2F5E",
                    animation: "floatCard 2s ease-in-out infinite", animationDelay: "0s",
                    display: "flex", flexDirection: "column", gap: "0.25rem"
                  }}>
                    <span style={{ fontSize: "1.2rem" }}>🥗</span>
                    <span style={{ fontWeight: 600 }}>Keto Salad</span>
                    <span style={{ fontSize: "0.65rem", color: "#8BAABF", fontWeight: 500 }}>Passenger Preference Match</span>
                  </div>
                  <div style={{
                    background: "rgba(76,175,80,0.08)", border: "1px solid #4CAF50",
                    borderRadius: 10, padding: "0.75rem 1.25rem", fontSize: "0.85rem", color: "#4CAF50",
                    animation: "floatCard 2s ease-in-out infinite", animationDelay: "0.3s",
                    boxShadow: "0 0 16px rgba(76,175,80,0.2)",
                    display: "flex", flexDirection: "column", gap: "0.25rem"
                  }}>
                    <span style={{ fontSize: "1.2rem" }}>🐟</span>
                    <span style={{ fontWeight: 600 }}>Herb Salmon</span>
                    <span style={{ fontSize: "0.65rem", color: "#4CAF50", fontWeight: 600 }}>ALLERGEN SAFE</span>
                  </div>
                </div>
              )}

              {introStep === 3 && (
                <div style={{
                  width: 84, height: 84, borderRadius: 22,
                  background: "linear-gradient(135deg, #1E88E5 0%, #0A2F5E 100%)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: "0 0 36px rgba(30,136,229,0.6)",
                  animation: "pulseGlow 1.5s ease-in-out infinite"
                }}>
                  <svg width="44" height="44" viewBox="0 0 24 24" fill="white"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>
                </div>
              )}
            </div>

            {/* Labels and Titles */}
            <div style={{ minHeight: 90 }}>
              {introStep === 0 && (
                <div style={{ animation: "fadeIn 0.3s ease-in-out" }}>
                  <h2 style={{ fontSize: "1.1rem", fontWeight: 700, letterSpacing: "0.15em", color: dark ? "#E8F1FA" : "#0A2F5E", textTransform: "uppercase", marginBottom: "0.5rem" }}>
                    Route Optimization
                  </h2>
                  <p style={{ fontSize: "0.9rem", color: dark ? "#8BAABF" : "#5C7E97", lineHeight: 1.5 }}>
                    Calculating the most efficient flight paths to minimize delay, manage crew logistics, and sync catering schedules in real-time.
                  </p>
                </div>
              )}
              {introStep === 1 && (
                <div style={{ animation: "fadeIn 0.3s ease-in-out" }}>
                  <h2 style={{ fontSize: "1.1rem", fontWeight: 700, letterSpacing: "0.15em", color: "#4CAF50", textTransform: "uppercase", marginBottom: "0.5rem" }}>
                    Minimizing Food Wastage
                  </h2>
                  <p style={{ fontSize: "0.9rem", color: dark ? "#8BAABF" : "#5C7E97", lineHeight: 1.5 }}>
                    Adjusting inventories dynamically at checkout to align flight load weights with actual passenger demand.
                  </p>
                </div>
              )}
              {introStep === 2 && (
                <div style={{ animation: "fadeIn 0.3s ease-in-out" }}>
                  <h2 style={{ fontSize: "1.1rem", fontWeight: 700, letterSpacing: "0.15em", color: "#1E88E5", textTransform: "uppercase", marginBottom: "0.5rem" }}>
                    AI Recommendations
                  </h2>
                  <p style={{ fontSize: "0.9rem", color: dark ? "#8BAABF" : "#5C7E97", lineHeight: 1.5 }}>
                    Tailored meal recommendations scanning preferences, logs, and allergens to match passenger dietary requirements.
                  </p>
                </div>
              )}
              {introStep === 3 && (
                <div style={{ animation: "fadeIn 0.3s ease-in-out" }}>
                  <h2 style={{ fontSize: "1.2rem", fontWeight: 800, letterSpacing: "0.05em", color: dark ? "#E8F1FA" : "#0A2F5E", marginBottom: "0.5rem" }}>
                    AirMeal Engine Initialized
                  </h2>
                  <p style={{ fontSize: "0.9rem", color: dark ? "#8BAABF" : "#5C7E97", lineHeight: 1.5 }}>
                    Welcome to the next generation of smart, sustainable inflight dining.
                  </p>
                </div>
              )}
            </div>

            {/* Progress indicator */}
            <div style={{ width: "100%", maxWidth: 260, margin: "1rem auto 0" }}>
              <div style={{ height: 2, background: dark ? "rgba(255,255,255,0.08)" : "rgba(10,47,94,0.12)", borderRadius: 2, overflow: "hidden", position: "relative" }}>
                <div style={{
                  position: "absolute", left: 0, top: 0, height: "100%", width: "100%",
                  background: "linear-gradient(90deg, #1E88E5, #FF6B35)",
                  transform: `translateX(-${100 - (introStep + 1) * 25}%)`,
                  transition: "transform 1s cubic-bezier(0.4, 0, 0.2, 1)"
                }} />
              </div>
              <div style={{ fontSize: "0.65rem", color: "#8BAABF", marginTop: "0.5rem", letterSpacing: "0.15em", textTransform: "uppercase", fontFamily: "monospace" }}>
                Initializing models...
              </div>
            </div>

          </div>
        </div>
      )}

      <canvas ref={canvasRef} aria-hidden style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} />

      <button
        onClick={() => setTheme(dark ? "light" : "dark")}
        aria-label="Toggle theme"
        style={{
          position: "absolute", top: "1.25rem", right: "1.25rem", zIndex: 3,
          width: 40, height: 40, borderRadius: 10, cursor: "pointer",
          background: C.cardBg, border: `1px solid ${C.cardBorder}`, color: C.heading,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {dark ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
        )}
      </button>

      <header style={{ textAlign: "center", position: "relative", zIndex: 2 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.5rem" }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: "linear-gradient(135deg, #1E88E5 0%, #0A2F5E 100%)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 24px rgba(30,136,229,0.4)" }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="white" stroke="none"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>
          </div>
          <span style={{ fontSize: "1.75rem", fontWeight: 800, letterSpacing: "-0.02em", color: C.heading }}>
            Air<span style={{ color: "#FF6B35" }}>Meal</span>
          </span>
        </div>

        <h1 style={{ fontSize: "clamp(2rem, 5vw, 3.25rem)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, marginBottom: "1rem", color: C.heading }}>
          AI-Assisted Inflight{" "}
          <span style={{ background: "linear-gradient(135deg, #1E88E5 0%, #42A5F5 60%, #FF6B35 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Dining</span>
        </h1>

        <p style={{ fontSize: "1.125rem", color: C.body, maxWidth: 520, margin: "0 auto 1.5rem", lineHeight: 1.7 }}>
          Personalised meal recommendations, allergen-safe ordering, and intelligent crew routing — all in one framework.
        </p>

        <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", padding: "0.375rem 0.875rem", borderRadius: 999, background: C.cardBg, border: `1px solid ${statusColor}44`, fontSize: "0.8125rem", fontWeight: 500, color: statusColor }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor, boxShadow: `0 0 8px ${statusColor}`, animation: health === "checking" ? "pulse 1s infinite" : "none" }} />
          {statusLabel}
        </div>

        <div style={{ display: "flex", justifyContent: "center", gap: "1.25rem", marginTop: "1.75rem" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "1.6rem", fontWeight: 700, color: C.heading }}>{stats.orders.toLocaleString()}</div>
            <div style={{ fontSize: "0.7rem", color: C.statLabel, letterSpacing: "0.05em" }}>MEALS ORDERED</div>
          </div>
          <div style={{ width: 1, height: 32, background: C.statLine }} />
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "1.6rem", fontWeight: 700, color: C.heading }}>{stats.flights}</div>
            <div style={{ fontSize: "0.7rem", color: C.statLabel, letterSpacing: "0.05em" }}>FLIGHTS TRACKED</div>
          </div>
          <div style={{ width: 1, height: 32, background: C.statLine }} />
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "1.6rem", fontWeight: 700, color: C.heading }}>{stats.models}</div>
            <div style={{ fontSize: "0.7rem", color: C.statLabel, letterSpacing: "0.05em" }}>AI MODELS LIVE</div>
          </div>
          <div style={{ width: 1, height: 32, background: C.statLine }} />
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "1.6rem", fontWeight: 700, color: "#4CAF50" }}>{stats.foodUsed}%</div>
            <div style={{ fontSize: "0.7rem", color: C.statLabel, letterSpacing: "0.05em" }}>FOOD UTILIZATION</div>
          </div>
        </div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1.25rem", width: "100%", maxWidth: 900, position: "relative", zIndex: 2 }}>
        {roles.map((role) => (
          <a key={role.id} id={`role-${role.id}`} href={role.href}
            style={{ display: "flex", flexDirection: "column", gap: "1rem", padding: "1.75rem", borderRadius: 16, background: C.cardBg, border: `1px solid ${C.cardBorder}`, backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", textDecoration: "none", color: "inherit", cursor: "pointer", transition: "transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease" }}
            onMouseEnter={(e) => { const el = e.currentTarget; el.style.transform = "translateY(-4px)"; el.style.borderColor = `${role.accent}55`; el.style.boxShadow = `0 8px 32px ${role.accent}22`; }}
            onMouseLeave={(e) => { const el = e.currentTarget; el.style.transform = "translateY(0)"; el.style.borderColor = C.cardBorder; el.style.boxShadow = "none"; }}
          >
            <div style={{ width: 56, height: 56, borderRadius: 12, background: `${role.accent}18`, border: `1px solid ${role.accent}33`, display: "flex", alignItems: "center", justifyContent: "center", color: role.accent }}>{role.icon}</div>
            <div>
              <h2 style={{ fontSize: "1.125rem", fontWeight: 700, color: C.heading, marginBottom: "0.375rem", letterSpacing: "-0.01em" }}>{role.label}</h2>
              <p style={{ fontSize: "0.875rem", color: C.body, lineHeight: 1.6 }}>{role.description}</p>
            </div>
            <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem", fontWeight: 600, color: role.accent }}>
              Enter portal
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </div>
          </a>
        ))}
      </div>

      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
    </main>
  );
}

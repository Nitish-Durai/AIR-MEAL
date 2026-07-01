"use client";

import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useOrderSocket } from "@/lib/ws";
import Link from "next/link";
import {
  ChevronLeft,
  Clock,
  User,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  MessageSquare,
} from "lucide-react";

interface OrderTrackingData {
  order_id: string;
  status: string;
  updated_at: string;
  eta_minutes: number;
  assigned_crew_name: string | null;
}

const STATUS_STAGES = ["received", "confirmed", "preparing", "en_route", "delivered"];

const STATUS_LABELS: Record<string, { title: string; desc: string }> = {
  received: { title: "Order Received", desc: "Your order has been sent to the kitchen." },
  confirmed: { title: "Order Confirmed", desc: "The crew has accepted and confirmed your order." },
  preparing: { title: "Preparing", desc: "Your meal is being prepared and heated." },
  en_route: { title: "En Route", desc: "A crew member is delivering the meal to your seat." },
  delivered: { title: "Delivered", desc: "Enjoy your inflight dining experience!" },
  cancelled: { title: "Cancelled", desc: "This order has been cancelled." },
};

// Canvas background component — always mounted, fixed to viewport
function ConstellationCanvas() {
  const rafRef = useRef<number>(0);

  const initCanvas = useCallback((cvs: HTMLCanvasElement | null) => {
    if (!cvs) {
      cancelAnimationFrame(rafRef.current);
      return;
    }
    const ctx = cvs.getContext("2d");
    if (!ctx) return;

    let W = 0, H = 0;
    const resize = () => {
      W = cvs.width = window.innerWidth;
      H = cvs.height = window.innerHeight;
    };
    resize();

    const nodes = Array.from({ length: 70 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
    }));

    const planes = Array.from({ length: 4 }, () => ({
      x: Math.random() * W,
      y: 60 + Math.random() * (H - 120),
      s: 0.4 + Math.random() * 0.55,
    }));

    const draw = () => {
      ctx.clearRect(0, 0, W, H);

      // Move nodes
      for (const n of nodes) {
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 0 || n.x > W) n.vx *= -1;
        if (n.y < 0 || n.y > H) n.vy *= -1;
      }

      // Draw connecting lines
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 140) {
            ctx.strokeStyle = `rgba(59,157,255,${0.18 * (1 - d / 140)})`;
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.stroke();
          }
        }
      }

      // Draw nodes
      for (const n of nodes) {
        ctx.fillStyle = "rgba(130,185,255,0.75)";
        ctx.beginPath();
        ctx.arc(n.x, n.y, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw mini planes
      for (const p of planes) {
        p.x += p.s;
        if (p.x > W + 30) {
          p.x = -30;
          p.y = 60 + Math.random() * (H - 120);
        }
        ctx.fillStyle = "rgba(255,122,69,0.38)";
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-10, -3);
        ctx.lineTo(-7, 0);
        ctx.lineTo(-10, 3);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    draw();
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={initCanvas}
      aria-hidden
      className="fixed inset-0 pointer-events-none w-full h-full"
      style={{ zIndex: 0 }}
    />
  );
}

function TrackingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { accessToken } = useAuth();

  const orderId = searchParams.get("order_id");
  const flightId = searchParams.get("flight_id");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tracking, setTracking] = useState<OrderTrackingData | null>(null);

  const fetchTracking = async () => {
    if (!orderId) return;
    try {
      const response = await api.get<{ data: OrderTrackingData }>(
        `/api/v1/orders/${orderId}/tracking`,
        accessToken || undefined
      );
      setTracking(response.data);
    } catch (err) {
      console.error("Failed to load order tracking:", err);
      if (err instanceof ApiError) {
        setError(err.detail || "Failed to load tracking details.");
      } else {
        setError("Failed to load tracking details.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (orderId) {
      fetchTracking();
    }
  }, [orderId, accessToken]);

  // WebSocket Live Updates
  useOrderSocket(flightId, accessToken, (event, data) => {
    if (event === "ORDER_STATUS_UPDATE" && data && data.id === orderId) {
      setTracking((prev) => (prev ? { ...prev, status: data.status } : null));
      fetchTracking();
    }
  });

  const currentStatus = tracking?.status.toLowerCase() ?? "";
  const currentStageIndex = STATUS_STAGES.indexOf(currentStatus);
  const isCancelled = currentStatus === "cancelled";

  return (
    <div className="relative min-h-screen w-full font-sans text-[#E8F1FA]"
      >

      {/* Page content */}
      <div className="relative w-full max-w-lg mx-auto px-4 py-12" style={{ zIndex: 1 }}>

        {/* Header */}
        <div className="flex items-center justify-between mb-6 pt-2">
          <Link
            href="/passenger/menu"
            className="flex items-center gap-1 text-sm text-[#8BAABF] hover:text-[#E8F1FA] transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Menu</span>
          </Link>
          {orderId && (
            <span className="text-[10px] bg-[#0A1929] border border-[rgba(30,136,229,0.2)] rounded-full px-3 py-1 text-[#8BAABF]">
              Order ID: {orderId.slice(0, 8)}...
            </span>
          )}
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-[#1E88E5] animate-spin mb-4" />
            <p className="text-sm text-[#8BAABF]">Connecting to tracking stream...</p>
          </div>
        )}

        {/* Error state */}
        {!loading && (error || !tracking) && (
          <div
            className="rounded-xl p-8 flex flex-col items-center text-center border transition-all duration-300 cursor-default"
            style={{
              background: "var(--color-card)",
              backdropFilter: "blur(12px)",
              borderColor: "rgba(239,83,80,0.25)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLDivElement).style.transform = "translateY(-4px)";
              (e.currentTarget as HTMLDivElement).style.boxShadow = "0 20px 50px rgba(239,83,80,0.15)";
              (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(239,83,80,0.45)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
              (e.currentTarget as HTMLDivElement).style.boxShadow = "0 8px 32px rgba(0,0,0,0.4)";
              (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(239,83,80,0.25)";
            }}
          >
            <AlertTriangle className="w-12 h-12 text-[#EF5350] mb-4" />
            <h1 className="text-xl font-bold text-[#E8F1FA] mb-2">Tracking Failed</h1>
            <p className="text-sm text-[#8BAABF] mb-6 leading-relaxed">
              {error || "Could not retrieve current status for this order."}
            </p>
            <Link
              href="/passenger/menu"
              className="w-full flex items-center justify-center h-11 bg-[#90CAF9] hover:bg-[#64B5F6] text-[#0A2F5E] font-medium rounded-lg transition-colors text-sm"
            >
              Return to Menu
            </Link>
          </div>
        )}

        {/* Main tracking content */}
        {!loading && tracking && (
          <>
            {/* Hero ETA card */}
            <div
              className="rounded-xl p-6 mb-5 text-center border transition-all duration-300 cursor-default"
              style={{
                background: "var(--color-card)",
                backdropFilter: "blur(12px)",
                borderColor: "rgba(30,136,229,0.2)",
                boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.transform = "translateY(-4px)";
                (e.currentTarget as HTMLDivElement).style.boxShadow = "0 20px 50px rgba(30,136,229,0.2)";
                (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(30,136,229,0.45)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
                (e.currentTarget as HTMLDivElement).style.boxShadow = "0 8px 32px rgba(0,0,0,0.4)";
                (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(30,136,229,0.2)";
              }}
            >
              {isCancelled ? (
                <div className="text-[#EF5350] font-bold text-lg mb-2">Order Cancelled</div>
              ) : currentStatus === "delivered" ? (
                <div className="text-[#4CAF50] font-bold text-lg mb-2 flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-5 h-5" />
                  <span>Delivered!</span>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="text-sm text-[#8BAABF]">Estimated Delivery In</div>
                  <div className="text-4xl font-extrabold text-[#1E88E5] tracking-tight flex items-center justify-center gap-2 py-2">
                    <Clock className="w-8 h-8 text-[#FF6B35]" />
                    <span>{tracking.eta_minutes} Min</span>
                  </div>
                </div>
              )}

              <div className="mt-4 border-t border-[rgba(30,136,229,0.12)] pt-4 flex items-center justify-center gap-2 text-xs text-[#8BAABF]">
                <User className="w-4 h-4 text-[#1E88E5]" />
                <span>
                  {tracking.assigned_crew_name
                    ? `Assigned Crew: ${tracking.assigned_crew_name}`
                    : "Assigning cabin crew member..."}
                </span>
              </div>
            </div>

            {/* Delivery Progress Timeline card */}
            <div
              className="rounded-xl p-6 border transition-all duration-300 cursor-default"
              style={{
                background: "var(--color-card)",
                backdropFilter: "blur(12px)",
                borderColor: "rgba(30,136,229,0.2)",
                boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.transform = "translateY(-4px)";
                (e.currentTarget as HTMLDivElement).style.boxShadow = "0 20px 50px rgba(30,136,229,0.2)";
                (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(30,136,229,0.45)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
                (e.currentTarget as HTMLDivElement).style.boxShadow = "0 8px 32px rgba(0,0,0,0.4)";
                (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(30,136,229,0.2)";
              }}
            >
              <h3 className="font-bold text-xs text-[#8BAABF] uppercase tracking-widest mb-5">
                Delivery Progress
              </h3>

              {isCancelled ? (
                <div className="flex gap-4 items-start bg-[rgba(198,40,40,0.1)] border border-[rgba(198,40,40,0.2)] rounded-lg p-4 text-xs text-[#EF5350]">
                  <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                  <div>
                    <p className="font-bold text-sm mb-0.5">Order Cancelled</p>
                    <p>This order has been cancelled and will not be delivered. If this was an error, please place a new order.</p>
                  </div>
                </div>
              ) : (
                <div className="relative pl-6 border-l-2 border-[rgba(30,136,229,0.2)] space-y-7">
                  {STATUS_STAGES.map((stage, idx) => {
                    const isActive = idx <= currentStageIndex;
                    const isCurrent = idx === currentStageIndex;
                    const info = STATUS_LABELS[stage];

                    return (
                      <div key={stage} className="relative">
                        {/* Circle indicator */}
                        <div
                          className={`absolute top-1 flex items-center justify-center rounded-full border-2 transition-all duration-300 ${
                            isCurrent
                              ? "bg-[#1E88E5] border-[#1E88E5] shadow-[0_0_12px_rgba(30,136,229,0.7)]"
                              : isActive
                              ? "bg-[#0A2F5E] border-[#1E88E5]"
                              : "bg-[var(--color-surface)] border-[rgba(30,136,229,0.2)]"
                          }`}
                          style={{ left: "-31px", width: "18px", height: "18px" }}
                        >
                          {isActive && !isCurrent && (
                            <div className="w-2 h-2 rounded-full bg-white" />
                          )}
                        </div>

                        {/* Stage Text */}
                        <h4
                          className={`font-bold text-sm ${
                            isCurrent
                              ? "text-[#1E88E5]"
                              : isActive
                              ? "text-[#E8F1FA]"
                              : "text-[#8BAABF] opacity-60"
                          }`}
                        >
                          {info.title}
                        </h4>
                        <p className="text-xs text-[#8BAABF] mt-0.5 leading-relaxed">
                          {info.desc}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Feedback CTA */}
            {currentStatus === "delivered" && (
              <div className="mt-5">
                <Link
                  href={`/passenger/feedback?order_id=${orderId}`}
                  className="w-full flex items-center justify-center h-12 px-6 bg-[#FF6B35] hover:bg-[#FF8A5E] text-white font-bold rounded-xl transition-all duration-200 shadow-lg text-sm gap-2 cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(255,107,53,0.3)]"
                  style={{ minHeight: "44px" }}
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>Leave Order Feedback</span>
                </Link>
              </div>
            )}

            {/* Return Home Link */}
            <div className="mt-8 text-center">
              <Link
                href="/passenger/menu"
                className="text-xs text-[#8BAABF] hover:text-[#1E88E5] underline underline-offset-4 transition-colors"
              >
                Return to Menu
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function TrackingPage() {
  return (
    <Suspense
      fallback={
        <div
          className="min-h-screen flex flex-col items-center justify-center text-[#E8F1FA]"
          
        >
          <Loader2 className="w-8 h-8 text-[#1E88E5] animate-spin mb-4" />
          <p className="text-sm text-[#8BAABF]">Loading tracking interface...</p>
        </div>
      }
    >
      <TrackingContent />
    </Suspense>
  );
}

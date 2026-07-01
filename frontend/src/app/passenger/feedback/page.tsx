"use client";

import { useEffect, useState, useRef, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import Link from "next/link";
import {
  ChevronLeft,
  Star,
  MessageSquare,
  AlertTriangle,
  Loader2,
  CheckCircle2
} from "lucide-react";

const TAG_OPTIONS = [
  "Tasty", "Cold", "Late", "Great portion", "Delicious",
  "Fresh", "Hot", "Soggy", "Slow service"
];

/* ── Constellation canvas background (matches landing page style) ─────── */
function ConstellationCanvas() {
  const canvasRef = useCallback((cvs: HTMLCanvasElement | null) => {
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
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="fixed inset-0 pointer-events-none w-full h-full"
      style={{ zIndex: 0 }}
    />
  );
}


/* ── Card with hover emboss ───────────────────────────────────────────── */
function GlowCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className={`rounded-xl p-4 ${className}`}
      style={{
        background: "var(--color-card)",
        backdropFilter: "blur(16px)",
        border: hovered ? "1px solid rgba(30,136,229,0.5)" : "1px solid rgba(30,136,229,0.15)",
        boxShadow: hovered
          ? "0 12px 40px rgba(30,136,229,0.22), 0 0 0 1px rgba(30,136,229,0.08) inset"
          : "0 4px 16px rgba(0,0,0,0.3)",
        transform: hovered ? "translateY(-3px)" : "translateY(0)",
        transition: "transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {children}
    </div>
  );
}

/* ── Star rating component ────────────────────────────────────────────── */
function StarRating({
  value,
  onChange,
  label,
  required = false
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
  required?: boolean;
}) {
  const [hoverValue, setHoverValue] = useState<number | null>(null);

  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center text-xs font-semibold">
        <span className="text-[#8BAABF]">
          {label} {required && <span className="text-[#EF5350]">*</span>}
        </span>
        <span className="text-[#1E88E5] font-bold">{value > 0 ? `${value} / 5` : "Unrated"}</span>
      </div>
      <div className="flex gap-2 py-1">
        {[1, 2, 3, 4, 5].map((star) => {
          const isGold = hoverValue !== null ? star <= hoverValue : star <= value;
          return (
            <button
              type="button"
              key={star}
              onClick={() => onChange(star)}
              onMouseEnter={() => setHoverValue(star)}
              onMouseLeave={() => setHoverValue(null)}
              className="focus:outline-none cursor-pointer"
              style={{
                minWidth: "44px",
                minHeight: "44px",
                transition: "transform 0.15s ease",
                transform: hoverValue !== null && star <= hoverValue ? "scale(1.2)" : "scale(1)",
              }}
              aria-label={`Rate ${star} stars`}
            >
              <Star
                className={`w-7 h-7 ${
                  isGold
                    ? "fill-[#FF6B35] text-[#FF6B35]"
                    : "text-[rgba(30,136,229,0.3)]"
                }`}
                style={{
                  filter: isGold ? "drop-shadow(0 0 6px rgba(255,107,53,0.6))" : "none",
                  transition: "filter 0.15s ease",
                }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Main feedback content ────────────────────────────────────────────── */
function FeedbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { accessToken } = useAuth();

  const orderId = searchParams.get("order_id");

  const [overallRating, setOverallRating] = useState<number>(0);
  const [tasteRating, setTasteRating] = useState<number>(0);
  const [tempRating, setTempRating] = useState<number>(0);
  const [portionRating, setPortionRating] = useState<number>(0);
  const [speedRating, setSpeedRating] = useState<number>(0);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [freeText, setFreeText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderId) return;
    if (overallRating === 0) { setError("Overall rating is required."); return; }
    setLoading(true);
    setError(null);
    try {
      await api.post<any>(
        "/api/v1/feedback",
        {
          order_id: orderId,
          overall_rating: overallRating,
          taste_rating: tasteRating > 0 ? tasteRating : undefined,
          temp_rating: tempRating > 0 ? tempRating : undefined,
          portion_rating: portionRating > 0 ? portionRating : undefined,
          speed_rating: speedRating > 0 ? speedRating : undefined,
          tags: selectedTags,
          free_text: freeText || undefined
        },
        accessToken || undefined
      );
      setSuccess(true);
    } catch (err) {
      console.error("Failed to submit feedback:", err);
      if (err instanceof ApiError) setError(err.detail || "Failed to submit feedback.");
      else setError("An unexpected error occurred during submission.");
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = overallRating > 0 && !loading;

  if (!orderId) {
    return (
      <div className="w-full max-w-md mx-auto px-4 py-12">
        <GlowCard className="flex flex-col items-center text-center">
          <AlertTriangle className="w-12 h-12 text-[#FF6B35] mb-4" />
          <h1 className="text-xl font-bold text-[#E8F1FA] mb-2">No Order Selected</h1>
          <p className="text-sm text-[#8BAABF] mb-6 leading-relaxed">
            Please navigate to this screen using a delivered order&apos;s tracking page.
          </p>
          <Link
            href="/passenger/menu"
            className="w-full flex items-center justify-center h-11 text-white font-medium rounded-lg text-sm"
            style={{
              background: "#1E88E5",
              border: "1px solid #1E88E5",
              transition: "transform 0.2s ease, box-shadow 0.2s ease",
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget as HTMLAnchorElement;
              el.style.transform = "translateY(-2px)";
              el.style.boxShadow = "0 8px 24px rgba(30,136,229,0.4)";
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLAnchorElement;
              el.style.transform = "translateY(0)";
              el.style.boxShadow = "none";
            }}
          >
            Go to Menu
          </Link>
        </GlowCard>
      </div>
    );
  }

  if (success) {
    return (
      <div className="w-full max-w-md mx-auto px-4 py-12">
        <GlowCard className="flex flex-col items-center text-center text-[#E8F1FA]">
          <div className="w-16 h-16 rounded-full bg-[rgba(46,125,50,0.1)] border border-[rgba(46,125,50,0.3)] flex items-center justify-center mb-6">
            <CheckCircle2 className="w-10 h-10 text-[#4CAF50] animate-bounce" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Thank You!</h1>
          <p className="text-sm text-[#8BAABF] mb-6 leading-relaxed">
            Your dining feedback has been recorded and will enhance our future AI menu recommendations.
          </p>
          <Link
            href="/passenger/menu"
            className="w-full flex items-center justify-center h-11 text-white font-medium rounded-lg text-sm"
            style={{
              background: "#1E88E5",
              border: "1px solid #1E88E5",
              transition: "transform 0.2s ease, box-shadow 0.2s ease",
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget as HTMLAnchorElement;
              el.style.transform = "translateY(-2px)";
              el.style.boxShadow = "0 8px 24px rgba(30,136,229,0.4)";
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLAnchorElement;
              el.style.transform = "translateY(0)";
              el.style.boxShadow = "none";
            }}
          >
            Return to Menu
          </Link>
        </GlowCard>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto px-4 pb-12 font-sans text-[#E8F1FA]">

      {/* Back button */}
      <div className="mb-6 pt-4">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1 text-sm text-[#8BAABF] hover:text-[#E8F1FA] transition-colors cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Back</span>
        </button>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight mb-2">Order Feedback</h1>
        <p className="text-sm text-[#8BAABF]">Help us improve our inflight dining by rating your experience.</p>
      </div>

      {error && (
        <div className="bg-[rgba(198,40,40,0.15)] border border-[#EF5350] rounded-lg p-4 text-xs text-[#EF5350] mb-6 flex items-start gap-2">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <div>
            <p className="font-bold text-sm mb-0.5">Feedback Error</p>
            <p>{error}</p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Overall rating card */}
        <GlowCard>
          <StarRating value={overallRating} onChange={setOverallRating} label="Overall Experience" required />
        </GlowCard>

        {/* Sub-ratings card */}
        <GlowCard className="space-y-4">
          <h3 className="font-bold text-xs text-[#8BAABF] uppercase tracking-wider mb-2">Category Ratings</h3>
          <StarRating value={tasteRating} onChange={setTasteRating} label="Taste & Flavour" />
          <StarRating value={tempRating} onChange={setTempRating} label="Serving Temperature" />
          <StarRating value={portionRating} onChange={setPortionRating} label="Portion Size" />
          <StarRating value={speedRating} onChange={setSpeedRating} label="Delivery Speed" />
        </GlowCard>

        {/* Tag pills card */}
        <GlowCard className="space-y-3">
          <h3 className="font-bold text-xs text-[#8BAABF] uppercase tracking-wider">What went well or poorly?</h3>
          <div className="flex flex-wrap gap-2">
            {TAG_OPTIONS.map(tag => {
              const isSelected = selectedTags.includes(tag);
              return (
                <button
                  type="button"
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className="h-9 px-3 rounded-full text-xs font-medium cursor-pointer"
                  style={{
                    minHeight: "36px",
                    background: isSelected ? "#FF6B35" : "var(--color-surface)",
                    border: isSelected ? "1px solid #FF6B35" : "1px solid rgba(30,136,229,0.2)",
                    color: isSelected ? "white" : "#8BAABF",
                    boxShadow: isSelected ? "0 4px 14px rgba(255,107,53,0.3)" : "none",
                    transform: "translateY(0)",
                    transition: "transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease, color 0.15s ease, background 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    const el = e.currentTarget as HTMLButtonElement;
                    el.style.transform = "translateY(-2px)";
                    el.style.boxShadow = isSelected
                      ? "0 6px 20px rgba(255,107,53,0.45)"
                      : "0 4px 14px rgba(30,136,229,0.2)";
                    el.style.borderColor = isSelected ? "#FF6B35" : "#42a5f5";
                    el.style.color = "white";
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget as HTMLButtonElement;
                    el.style.transform = "translateY(0)";
                    el.style.boxShadow = isSelected ? "0 4px 14px rgba(255,107,53,0.3)" : "none";
                    el.style.borderColor = isSelected ? "#FF6B35" : "rgba(30,136,229,0.2)";
                    el.style.color = isSelected ? "white" : "#8BAABF";
                  }}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </GlowCard>

        {/* Free text */}
        <div className="space-y-1.5">
          <label htmlFor="comments" className="text-xs font-semibold text-[#8BAABF]">
            Additional Comments
          </label>
          <textarea
            id="comments"
            rows={4}
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            placeholder="Share details of your experience here..."
            className="w-full p-3 rounded-lg text-sm text-[#E8F1FA] placeholder-[#8BAABF] focus:outline-none resize-none"
            style={{
              background: "var(--color-card)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(30,136,229,0.15)",
              transition: "border-color 0.2s ease, box-shadow 0.2s ease",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "#1E88E5";
              e.currentTarget.style.boxShadow = "0 0 0 3px rgba(30,136,229,0.12)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "rgba(30,136,229,0.15)";
              e.currentTarget.style.boxShadow = "none";
            }}
          />
        </div>

        {/* Submit button */}
        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full h-12 rounded-lg text-sm font-bold flex items-center justify-center gap-2 cursor-pointer text-white"
          style={{
            background: canSubmit ? "#1E88E5" : "#0A2F5E",
            border: canSubmit ? "1px solid #1E88E5" : "1px solid rgba(30,136,229,0.2)",
            opacity: canSubmit ? 1 : 0.5,
            cursor: canSubmit ? "pointer" : "not-allowed",
            minHeight: "44px",
            boxShadow: "none",
            transform: "translateY(0)",
            transition: "transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease",
          }}
          onMouseEnter={(e) => {
            if (!canSubmit) return;
            const el = e.currentTarget as HTMLButtonElement;
            el.style.transform = "translateY(-2px)";
            el.style.boxShadow = "0 10px 32px rgba(30,136,229,0.45)";
            el.style.background = "#1565C0";
          }}
          onMouseLeave={(e) => {
            if (!canSubmit) return;
            const el = e.currentTarget as HTMLButtonElement;
            el.style.transform = "translateY(0)";
            el.style.boxShadow = "none";
            el.style.background = "#1E88E5";
          }}
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Submitting Feedback...</span>
            </>
          ) : (
            <>
              <MessageSquare className="w-4 h-4" />
              <span>Submit Feedback</span>
            </>
          )}
        </button>

      </form>
    </div>
  );
}

/* ── Page wrapper ─────────────────────────────────────────────────────── */
export default function FeedbackPage() {
  return (
    <div className="relative min-h-screen font-sans text-[#E8F1FA]">
      <Suspense
        fallback={
          <div className="flex flex-col items-center justify-center p-12 min-h-screen text-[#E8F1FA]">
            <Loader2 className="w-8 h-8 text-[#1E88E5] animate-spin mb-4" />
            <p className="text-sm text-[#8BAABF]">Loading feedback interface...</p>
          </div>
        }
      >
        <FeedbackContent />
      </Suspense>
    </div>
  );
}


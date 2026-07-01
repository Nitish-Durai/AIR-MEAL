"use client";

import { useEffect, useState, useRef, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Plane } from "lucide-react";
import { useAuth, ApiError, type RegisterPayload } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();

  const [pnr, setPnr] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);

    const payload: RegisterPayload = {
      pnr: pnr.trim().toUpperCase(),
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: email.trim().toLowerCase(),
      password,
      dietary_flags: {},
      allergy_flags: {},
    };

    try {
      await register(payload);
      router.push("/login/passenger?registered=1");
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-8" >
      <canvas ref={canvasRef} aria-hidden className="absolute inset-0 pointer-events-none w-full h-full" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(30,136,229,0.18)_0%,transparent_70%)]" />

      <div className="relative flex w-full max-w-[500px] flex-col rounded-[var(--radius-lg)] border border-white/12 bg-white/[0.04] p-8 shadow-[var(--shadow-xl)] backdrop-blur-2xl transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:shadow-[0_20px_50px_rgba(14,165,233,0.15)]">
        <div className="mb-[18px] flex h-[52px] w-[52px] items-center justify-center self-center rounded-full bg-[linear-gradient(135deg,#0ea5e9,#f59e0b)] text-white">
          <Plane className="h-6 w-6" />
        </div>
        <h1 className="mb-1.5 text-center text-[26px] font-bold tracking-tight text-[var(--color-text-primary)]">
          Create your account
        </h1>
        <p className="mb-6 text-center text-[13.5px] text-[var(--color-text-secondary)]">
          Passenger registration &middot; seconds to set up
        </p>

        <form onSubmit={handleSubmit} className="mt-1 flex flex-col gap-4 text-left" noValidate>
          {error && (
            <div
              role="alert"
              className="rounded-[var(--radius-sm)] border border-[var(--color-error)]/35 bg-[var(--color-error)]/15 px-3.5 py-2.5 text-sm text-[var(--color-error-light)]"
            >
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <label htmlFor="reg-first" className="text-[12.5px] font-medium text-[var(--color-text-secondary)]">
                First name
              </label>
              <Input id="reg-first" required value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Alice" />
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <label htmlFor="reg-last" className="text-[12.5px] font-medium text-[var(--color-text-secondary)]">
                Last name
              </label>
              <Input id="reg-last" required value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Wong" />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="reg-pnr" className="text-[12.5px] font-medium text-[var(--color-text-secondary)]">
              Booking reference (PNR)
            </label>
            <Input
              id="reg-pnr"
              required
              value={pnr}
              onChange={(e) => setPnr(e.target.value.toUpperCase())}
              placeholder="ABC123"
              maxLength={20}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="reg-email" className="text-[12.5px] font-medium text-[var(--color-text-secondary)]">
              Email address
            </label>
            <Input id="reg-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="alice@example.com" />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="reg-password" className="text-[12.5px] font-medium text-[var(--color-text-secondary)]">
              Password <span className="text-[var(--color-text-muted)]">(min 8 characters)</span>
            </label>
            <div className="relative">
              <Input
                id="reg-password"
                type={showPwd ? "text" : "password"}
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="********"
                className="pr-11"
              />
              <button
                type="button"
                onClick={() => setShowPwd((v) => !v)}
                aria-label={showPwd ? "Hide password" : "Show password"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              >
                {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <Button id="register-submit" type="submit" variant="primary" size="lg" loading={loading} className="mt-1 w-full">
            {loading ? "Creating account..." : "Create account"}
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-[var(--color-text-secondary)]">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

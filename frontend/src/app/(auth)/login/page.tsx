"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth, ApiError } from "@/lib/auth-context";

const ROLE_HOME: Record<string, string> = {
  passenger: "/passenger",
  crew: "/crew",
  admin: "/admin",
};

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { role } = await login(email, password);
      router.push(ROLE_HOME[role] ?? "/");
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      {/* Background glow */}
      <div style={styles.glow} />

      <div style={styles.card}>
        {/* Logo mark */}
        <div style={styles.logoWrap}>
          <span style={styles.logoIcon}>✈</span>
        </div>
        <h1 style={styles.heading}>Welcome back</h1>
        <p style={styles.sub}>Sign in to your AirMeal account</p>

        <form onSubmit={handleSubmit} style={styles.form} noValidate>
          {error && (
            <div style={styles.errorBanner} role="alert">
              {error}
            </div>
          )}

          {/* Email */}
          <div style={styles.fieldGroup}>
            <label htmlFor="login-email" style={styles.label}>
              Email address
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="alice@example.com"
              style={styles.input}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLInputElement;
                el.style.borderColor = "rgba(14,165,233,0.7)";
                el.style.boxShadow = "0 4px 16px rgba(14,165,233,0.15)";
                el.style.transform = "translateY(-1px)";
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLInputElement;
                el.style.borderColor = "rgba(255,255,255,0.12)";
                el.style.boxShadow = "none";
                el.style.transform = "translateY(0)";
              }}
            />
          </div>

          {/* Password */}
          <div style={styles.fieldGroup}>
            <label htmlFor="login-password" style={styles.label}>
              Password
            </label>
            <div style={styles.pwdWrap}>
              <input
                id="login-password"
                type={showPwd ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{ ...styles.input, paddingRight: 44 }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget as HTMLInputElement;
                  el.style.borderColor = "rgba(14,165,233,0.7)";
                  el.style.boxShadow = "0 4px 16px rgba(14,165,233,0.15)";
                  el.style.transform = "translateY(-1px)";
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget as HTMLInputElement;
                  el.style.borderColor = "rgba(255,255,255,0.12)";
                  el.style.boxShadow = "none";
                  el.style.transform = "translateY(0)";
                }}
              />
              <button
                type="button"
                onClick={() => setShowPwd((v) => !v)}
                style={styles.eyeBtn}
                aria-label={showPwd ? "Hide password" : "Show password"}
              >
                {showPwd ? "🙈" : "👁"}
              </button>
            </div>
          </div>

          <button
            id="login-submit"
            type="submit"
            disabled={loading}
            style={loading ? { ...styles.submitBtn, opacity: 0.7 } : styles.submitBtn}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p style={styles.footerText}>
          Don&apos;t have an account?{" "}
          <Link href="/register" style={styles.link}>
            Register here
          </Link>
        </p>

        {/* Role hint */}
        <div style={styles.roleHint}>
          <span style={styles.roleTag}>🧳 Passenger</span>
          <span style={styles.roleTag}>👨‍✈️ Crew</span>
          <span style={styles.roleTag}>🛡 Admin</span>
        </div>
        <p style={styles.hintText}>Role is detected automatically</p>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "var(--color-surface)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    position: "relative",
    overflow: "hidden",
    padding: "24px 16px",
  },
  glow: {
    position: "absolute",
    inset: 0,
    background: "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(30,136,229,0.18) 0%, transparent 70%)",
    pointerEvents: "none",
    zIndex: 0,
  },
  card: {
    position: "relative",
    background: "rgba(255,255,255,0.04)",
    backdropFilter: "blur(24px)",
    WebkitBackdropFilter: "blur(24px)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 20,
    padding: "40px 36px",
    width: "100%",
    maxWidth: 440,
    boxShadow: "0 32px 80px rgba(0,0,0,0.5)",
    textAlign: "center",
  },
  logoWrap: {
    width: 56,
    height: 56,
    borderRadius: "50%",
    background: "linear-gradient(135deg, #0ea5e9, #f59e0b)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    margin: "0 auto 20px",
    fontSize: 26,
  },
  logoIcon: { display: "block" },
  heading: {
    color: "#f8fafc",
    fontSize: 28,
    fontWeight: 700,
    margin: "0 0 6px",
    letterSpacing: "-0.5px",
  },
  sub: {
    color: "#94a3b8",
    fontSize: 14,
    margin: "0 0 28px",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 18,
    textAlign: "left",
  },
  errorBanner: {
    background: "rgba(239,68,68,0.15)",
    border: "1px solid rgba(239,68,68,0.35)",
    color: "#fca5a5",
    borderRadius: 10,
    padding: "10px 14px",
    fontSize: 13.5,
  },
  fieldGroup: { display: "flex", flexDirection: "column", gap: 6 },
  label: { color: "#cbd5e1", fontSize: 13, fontWeight: 500 },
  input: {
    background: "rgba(255,255,255,0.07)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 10,
    padding: "11px 14px",
    color: "#f1f5f9",
    fontSize: 14.5,
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
    transition: "border-color 0.2s, box-shadow 0.2s, transform 0.2s",
  },
  pwdWrap: { position: "relative" },
  eyeBtn: {
    position: "absolute",
    right: 12,
    top: "50%",
    transform: "translateY(-50%)",
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: 16,
    lineHeight: 1,
    padding: 2,
  },
  submitBtn: {
    marginTop: 6,
    background: "linear-gradient(135deg, #0ea5e9, #0369a1)",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    padding: "13px 0",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
    width: "100%",
    transition: "opacity 0.2s, transform 0.1s",
    letterSpacing: "0.2px",
  },
  footerText: { color: "#94a3b8", fontSize: 13.5, marginTop: 22 },
  link: { color: "#38bdf8", textDecoration: "none", fontWeight: 500 },
  roleHint: { display: "flex", justifyContent: "center", gap: 8, marginTop: 22 },
  roleTag: {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 20,
    padding: "4px 10px",
    fontSize: 11.5,
    color: "#94a3b8",
  },
  hintText: { color: "#475569", fontSize: 11.5, marginTop: 8 },
};

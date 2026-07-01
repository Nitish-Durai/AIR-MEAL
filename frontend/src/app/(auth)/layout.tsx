"use client";

/**
 * (auth) layout — always renders auth pages (login/register).
 * We intentionally do NOT auto-redirect logged-in users away, so a user can
 * switch roles by visiting a different login page. Each login page clears any
 * existing session on mount for a clean slate.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

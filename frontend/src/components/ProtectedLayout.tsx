"use client";

/**
 * ProtectedLayout — client-side route guard.
 *
 * Usage in any role-specific layout.tsx:
 *   <ProtectedLayout allowedRoles={["passenger"]}>{children}</ProtectedLayout>
 */

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth, type Role } from "@/lib/auth-context";
import { ThemeToggle } from "@/components/ThemeToggle";

interface Props {
  allowedRoles: Role[];
  children: ReactNode;
}

export function ProtectedLayout({ allowedRoles, children }: Props) {
  const { isAuthenticated, role, isLoading } = useAuth();
  const router = useRouter();
  const portal = role === "crew" ? "crew" : role === "admin" ? "admin" : "passenger";

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }
    if (role && !allowedRoles.includes(role)) {
      // Authenticated but wrong role → redirect to their own home
      const roleHome: Record<Role, string> = {
        passenger: "/passenger",
        crew: "/crew",
        admin: "/admin",
      };
      router.replace(roleHome[role]);
    }
  }, [isLoading, isAuthenticated, role, allowedRoles, router]);

  if (isLoading || !isAuthenticated || !role || !allowedRoles.includes(role)) {
    return (
      <div style={loadingStyles.page}>
        <div style={loadingStyles.spinner} />
      </div>
    );
  }

  return (
    <div data-portal={portal} style={{ minHeight: "100vh" }}>
      <div
        style={{
          position: "fixed",
          top: 16,
          right: 16,
          zIndex: 50,
        }}
      >
        <ThemeToggle />
      </div>
      {children}
    </div>
  );
}

const loadingStyles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "var(--color-bg)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  spinner: {
    width: 40,
    height: 40,
    border: "3px solid rgba(14,165,233,0.2)",
    borderTopColor: "#0ea5e9",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
};

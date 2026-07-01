"use client";
import { ProtectedLayout } from "@/components/ProtectedLayout";
export default function CrewLayout({ children }: { children: React.ReactNode }) {
  return <ProtectedLayout allowedRoles={["crew","admin"]}>{children}</ProtectedLayout>;
}

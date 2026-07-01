"use client";
import { ProtectedLayout } from "@/components/ProtectedLayout";

export default function PassengerLayout({ children }: { children: React.ReactNode }) {
  return <ProtectedLayout allowedRoles={["passenger"]}>{children}</ProtectedLayout>;
}

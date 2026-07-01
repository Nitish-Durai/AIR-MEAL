"use client";

import { useAuth } from "@/lib/auth-context";
import { useFlights } from "../_lib/useFlights";
import Link from "next/link";
import { LogOut, Shield, Loader2 } from "lucide-react";
import { FlightSearchSelect } from "../../crew/_components/FlightSearchSelect";

interface AdminHeaderProps {
  activeTab: "flights" | "analytics" | "models" | "feedback" | "qr";
  flightId: string | null;
  onFlightChange: (id: string) => void;
}

export function AdminHeader({ activeTab, flightId, onFlightChange }: AdminHeaderProps) {
  const { accessToken, email, role, logout } = useAuth();
  const { flights, loading } = useFlights(accessToken);

  const buildHref = (path: string) => {
    return flightId ? `${path}?flight_id=${flightId}` : path;
  };

  return (
    <header className="bg-[#0A1929] border-b border-[rgba(30,136,229,0.15)] px-4 py-4 sm:px-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg sm:text-xl font-extrabold tracking-tight flex items-center gap-2">
              <Shield className="w-5 h-5 text-[#1E88E5]" />
              <span>Admin Console</span>
            </h1>
            {email && (
              <p className="text-[10px] text-[#8BAABF] mt-0.5">
                Logged in: <span className="font-semibold text-[var(--color-text)]">{email}</span> ({role})
              </p>
            )}
          </div>
          
          <button
            onClick={logout}
            className="h-10 px-3 bg-[rgba(239,83,80,0.1)] border border-[rgba(239,83,80,0.2)] text-[#EF5350] hover:bg-[#C62828] hover:text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            style={{ minHeight: "44px" }}
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>

        {/* Navigation Tabs and Flight Picker */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-6 border-t border-[rgba(30,136,229,0.1)] pt-4">
          <div className="flex items-center gap-2 text-sm">
            <Link
              href={buildHref("/admin")}
              className={`px-3 py-1.5 font-bold transition-all border-b-2 ${
                activeTab === "flights"
                  ? "text-[#1E88E5] border-[#1E88E5]"
                  : "text-[#8BAABF] border-transparent hover:text-[#E8F1FA]"
              }`}
            >
              Flights
            </Link>
            <Link
              href={buildHref("/admin/analytics")}
              className={`px-3 py-1.5 font-bold transition-all border-b-2 ${
                activeTab === "analytics"
                  ? "text-[#1E88E5] border-[#1E88E5]"
                  : "text-[#8BAABF] border-transparent hover:text-[#E8F1FA]"
              }`}
            >
              Analytics
            </Link>
            <Link
              href={buildHref("/admin/models")}
              className={`px-3 py-1.5 font-bold transition-all border-b-2 ${
                activeTab === "models"
                  ? "text-[#1E88E5] border-[#1E88E5]"
                  : "text-[#8BAABF] border-transparent hover:text-[#E8F1FA]"
              }`}
            >
              Models
            </Link>
            <Link
              href={buildHref("/admin/feedback")}
              className={`px-3 py-1.5 font-bold transition-all border-b-2 ${
                activeTab === "feedback"
                  ? "text-[#1E88E5] border-[#1E88E5]"
                  : "text-[#8BAABF] border-transparent hover:text-[#E8F1FA]"
              }`}
            >
              Feedback
            </Link>
            <Link
              href={buildHref("/admin/qr-codes")}
              className={`px-3 py-1.5 font-bold transition-all border-b-2 ${
                activeTab === "qr"
                  ? "text-[#1E88E5] border-[#1E88E5]"
                  : "text-[#8BAABF] border-transparent hover:text-[#E8F1FA]"
              }`}
            >
              QR Codes
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-[#8BAABF] font-semibold">Flight Context:</span>
            {loading ? (
              <Loader2 className="w-4 h-4 text-[#1E88E5] animate-spin" />
            ) : (
              <FlightSearchSelect
                flights={flights}
                value={flightId}
                onSelect={onFlightChange}
              />
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

"use client";

import { useEffect, useState, Suspense, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { AdminHeader } from "../_components/AdminHeader";
import { Loader2, AlertTriangle } from "lucide-react";

interface QRCode {
  seat_number: string;
  cabin_class: string;
  qr_token: string;
  qr_code_url: string;
}

function AdminQRCodesContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { accessToken } = useAuth();

  const flightId = searchParams.get("flight_id");

  const [qrCodes, setQrCodes] = useState<QRCode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cabinFilter, setCabinFilter] = useState("all");
  const [generated, setGenerated] = useState(false);

  useEffect(() => {
    setQrCodes([]);
    setGenerated(false);
    setError(null);
  }, [flightId]);

  const handleFlightChange = (id: string) => {
    if (id) {
      router.push(`/admin/qr-codes?flight_id=${id}`);
    } else {
      router.push("/admin/qr-codes");
    }
  };

  const handleGenerate = async () => {
    if (!flightId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<{ data: QRCode[] }>(
        `/api/v1/admin/flights/${flightId}/qr-codes`,
        {},
        accessToken || undefined
      );
      setQrCodes(res.data || []);
      setGenerated(true);
    } catch (err) {
      console.error("Failed to generate QR Codes:", err);
      if (err instanceof ApiError) {
        setError(err.detail || "Failed to generate QR Codes.");
      } else {
        setError("Failed to generate QR Codes.");
      }
    } finally {
      setLoading(false);
    }
  };

  const cabinOptions = [
    { key: "all", label: "All Cabins" },
    { key: "first", label: "First" },
    { key: "business", label: "Business" },
    { key: "premium_economy", label: "Premium Economy" },
    { key: "economy", label: "Economy" },
  ];

  const CABIN_CHIP: Record<string, { bg: string; text: string }> = {
    all:             { bg: "linear-gradient(135deg,#D1FAE5,#A7F3D0)", text: "#065F46" },
    first:           { bg: "linear-gradient(135deg,#FFF3E0,#FFE0B2)", text: "#7C4A03" },
    business:        { bg: "linear-gradient(135deg,#E3F2FD,#BBDEFB)", text: "#0A2F5E" },
    premium_economy: { bg: "linear-gradient(135deg,#E0F2F1,#B2DFDB)", text: "#0F5E57" },
    economy:         { bg: "linear-gradient(135deg,#F3E5F5,#E1BEE7)", text: "#6A1B7A" },
  };

  const filteredQRs = useMemo(() => {
    if (cabinFilter === "all") return qrCodes;
    return qrCodes.filter(
      (qr) => qr.cabin_class.toLowerCase() === cabinFilter.toLowerCase()
    );
  }, [qrCodes, cabinFilter]);

  const formatCabinName = (cabin: string) => {
    if (cabin === "all") return "All Cabins";
    return cabin
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  };

  return (
    <div className="min-h-screen text-[#E8F1FA] font-sans pb-12">
      <AdminHeader
        activeTab="qr"
        flightId={flightId}
        onFlightChange={handleFlightChange}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 mt-6 pb-12">
        {error && (
          <div className="bg-[rgba(239,83,80,0.1)] border border-[rgba(239,83,80,0.2)] text-[#EF5350] text-sm p-4 rounded-xl flex items-start gap-2.5 mb-6">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold">Error</h4>
              <p className="text-xs text-[#8BAABF] mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* Action Bar */}
        <div className="bg-[#0A1929] border border-[rgba(30,136,229,0.15)] rounded-xl p-4 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="font-extrabold text-sm tracking-tight text-[var(--color-text)]">QR Codes Generator</h2>
            <p className="text-xs text-[#8BAABF] mt-0.5">
              Generate scannable seat QR codes for passenger onboard menus.
            </p>
            <p className="text-[10px] text-[#8BAABF] mt-1 italic">
              QR images load from an external service (requires internet).
            </p>
          </div>
          <div>
            <button
              disabled={!flightId || loading}
              onClick={handleGenerate}
              className="h-10 px-4 bg-[linear-gradient(135deg,#E3F2FD,#BBDEFB)] hover:bg-[linear-gradient(135deg,#BBDEFB,#90CAF9)] text-[#0A2F5E] disabled:bg-[rgba(30,136,229,0.1)] disabled:text-[#8BAABF] disabled:cursor-not-allowed font-semibold rounded-lg text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
              style={{ minHeight: "44px" }}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Generating...</span>
                </>
              ) : (
                <span>Generate QR Codes</span>
              )}
            </button>
          </div>
        </div>

        {!generated && (
          <div className="bg-[rgba(30,136,229,0.05)] border border-[rgba(30,136,229,0.15)] rounded-xl p-6 text-center max-w-xl mx-auto my-12">
            <p className="text-sm text-[#E8F1FA] font-semibold mb-2">
              Select a flight, then generate QR codes.
            </p>
            <p className="text-xs text-[#8BAABF] leading-relaxed">
              Each seat gets a unique scannable code linking to its menu.
            </p>
          </div>
        )}

        {generated && (
          <div className="space-y-6">
            {/* Cabin filter buttons */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#0A1929] border border-[rgba(30,136,229,0.1)] rounded-xl p-4">
              <div className="flex flex-wrap items-center gap-2">
                {cabinOptions.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setCabinFilter(opt.key)}
                    className={`h-10 px-4 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      cabinFilter === opt.key
                        ? "shadow-sm"
                        : "bg-[var(--color-bg)] border border-[rgba(30,136,229,0.1)] text-[#8BAABF] hover:text-[var(--color-text)]"
                    }`}
                    style={
                      cabinFilter === opt.key
                        ? { minHeight: "44px", background: CABIN_CHIP[opt.key]?.bg, color: CABIN_CHIP[opt.key]?.text }
                        : { minHeight: "44px" }
                    }
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="text-right text-xs text-[#8BAABF] font-semibold">
                {qrCodes.length} codes &bull; showing {filteredQRs.length} for{" "}
                {formatCabinName(cabinFilter)}
              </div>
            </div>

            {/* Grid of cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredQRs.map((qr) => (
                <div
                  key={qr.seat_number}
                  className="bg-[#0A1929] border border-[rgba(30,136,229,0.15)] rounded-xl p-3 flex flex-col items-center gap-2"
                >
                  <img
                    src={qr.qr_code_url}
                    alt={qr.seat_number}
                    className="w-32 h-32 bg-white rounded"
                  />
                  <div className="text-center">
                    <div className="font-bold text-sm text-[#E8F1FA]">
                      {qr.seat_number}
                    </div>
                    <div className="text-[10px] text-[#8BAABF] uppercase tracking-wider font-semibold">
                      {qr.cabin_class.replace("_", " ")}
                    </div>
                  </div>
                  <a
                    href={`/seat?code=${encodeURIComponent(qr.qr_token)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-[#1E88E5] hover:underline"
                  >
                    Open seat menu &rarr;
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function AdminQRCodesPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-[#8BAABF]">
          <Loader2 className="w-8 h-8 text-[#1E88E5] animate-spin mb-4" />
          <p className="text-sm">Loading QR Codes dashboard...</p>
        </div>
      }
    >
      <AdminQRCodesContent />
    </Suspense>
  );
}

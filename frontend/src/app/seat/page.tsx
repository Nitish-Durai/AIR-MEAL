"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import Link from "next/link";
import { Armchair, Plane, Loader2, AlertTriangle, CheckCircle } from "lucide-react";

interface QRResolveResponse {
  flight_id: string;
  seat_number: string;
  cabin_class: string;
  token: string;
}

function SeatResolver() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { loginWithToken } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolvedData, setResolvedData] = useState<QRResolveResponse | null>(null);

  const code = searchParams.get("code");

  useEffect(() => {
    if (!code) {
      setError("No QR code detected. Please scan the QR code located at your seat.");
      setLoading(false);
      return;
    }

    const resolveToken = async () => {
      try {
        const response = await api.get<{ data: QRResolveResponse }>(
          `/api/v1/qr/resolve?code=${encodeURIComponent(code)}`
        );
        
        const data = response.data;
        setResolvedData(data);

        // Save session
        loginWithToken(data.token);

        // Redirect after a brief confirmation display
        const timer = setTimeout(() => {
          router.push(
            `/passenger/menu?flight_id=${data.flight_id}&cabin_class=${data.cabin_class}&seat_number=${data.seat_number}`
          );
        }, 2500);

        return () => clearTimeout(timer);
      } catch (err) {
        console.error("QR resolve error:", err);
        if (err instanceof ApiError) {
          setError(err.detail || "This QR code is invalid or has expired.");
        } else {
          setError("This QR code is invalid or has expired.");
        }
        setLoading(false);
      }
    };

    resolveToken();
  }, [code, loginWithToken, router]);

  return (
    <div className="w-full max-w-md p-6">
      <div className="glass-card p-8 text-center flex flex-col items-center">
        {loading && (
          <>
            <div className="w-16 h-16 rounded-full bg-[rgba(30,136,229,0.1)] border border-[rgba(30,136,229,0.2)] flex items-center justify-center mb-6 animate-pulse">
              <Loader2 className="w-8 h-8 text-[#1E88E5] animate-spin" />
            </div>
            <h1 className="text-[#E8F1FA] text-xl font-bold mb-2">Resolving Seat Access</h1>
            <p className="text-[#8BAABF] text-sm leading-relaxed">
              Validating your seat token and preparing your cabin dining menu...
            </p>
          </>
        )}

        {error && (
          <>
            <div className="w-16 h-16 rounded-full bg-[rgba(198,40,40,0.1)] border border-[rgba(198,40,40,0.2)] flex items-center justify-center mb-6">
              <AlertTriangle className="w-8 h-8 text-[#EF5350]" />
            </div>
            <h1 className="text-[#E8F1FA] text-xl font-bold mb-2">Access Denied</h1>
            <p className="text-[#8BAABF] text-sm leading-relaxed mb-6">
              {error}
            </p>
            <Link
              href="/login?role=passenger"
              className="w-full flex items-center justify-center h-11 px-4 bg-[#90CAF9] hover:bg-[#64B5F6] text-[#0A2F5E] font-medium rounded-lg transition-colors text-sm"
            >
              Sign In Manually
            </Link>
          </>
        )}

        {resolvedData && (
          <>
            <div className="w-16 h-16 rounded-full bg-[rgba(46,125,50,0.1)] border border-[rgba(46,125,50,0.2)] flex items-center justify-center mb-6">
              <CheckCircle className="w-8 h-8 text-[#4CAF50]" />
            </div>
            <h1 className="text-[#E8F1FA] text-2xl font-bold mb-1">Welcome Aboard!</h1>
            <p className="text-[#8BAABF] text-sm mb-6">Seat resolution successful</p>
            
            <div className="w-full bg-[#050F1E] border border-[rgba(30,136,229,0.1)] rounded-lg p-4 mb-6 text-left">
              <div className="flex items-center gap-3 mb-2">
                <Armchair className="w-5 h-5 text-[#FF6B35]" />
                <div>
                  <div className="text-xs text-[#8BAABF] uppercase tracking-wider font-semibold">Seat Number</div>
                  <div className="text-[#E8F1FA] font-bold text-lg">{resolvedData.seat_number}</div>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <Plane className="w-5 h-5 text-[#1E88E5]" />
                <div>
                  <div className="text-xs text-[#8BAABF] uppercase tracking-wider font-semibold">Cabin Class</div>
                  <div className="text-[#E8F1FA] font-medium capitalize">{resolvedData.cabin_class}</div>
                </div>
              </div>
            </div>

            <p className="text-xs text-[#8BAABF] mb-6 animate-pulse">
              Redirecting you to the menu browser...
            </p>

            <Link
              href="/login?role=passenger"
              className="text-[#1E88E5] hover:text-[#42A5F5] text-xs font-semibold underline underline-offset-4"
            >
              Log in for personalized recommendations
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

export default function SeatPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      
      <Suspense
        fallback={
          <div className="w-full max-w-md p-6">
            <div className="glass-card p-8 text-center flex flex-col items-center">
              <Loader2 className="w-8 h-8 text-[#1E88E5] animate-spin mb-4" />
              <p className="text-sm text-[#8BAABF]">Loading seat resolver...</p>
            </div>
          </div>
        }
      >
        <SeatResolver />
      </Suspense>
    </main>
  );
}

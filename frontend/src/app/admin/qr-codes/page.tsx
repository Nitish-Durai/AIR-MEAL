"use client";

import { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { AdminHeader } from "../_components/AdminHeader";
import { QrCode, Printer, Info } from "lucide-react";

// The single, permanent boarding QR. Printed once, affixed to every seat, valid
// for every flight forever. Passengers scan it, sign in, then enter their PNR +
// last name to be routed to their specific flight and seat.
const BOARDING_URL = "https://airmeal.vercel.app";
const QR_IMAGE = `https://api.qrserver.com/v1/create-qr-code/?size=340x340&margin=12&data=${encodeURIComponent(BOARDING_URL)}`;

function AdminQRCodesContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const flightId = searchParams.get("flight_id");

  const handleFlightChange = (id: string) => {
    router.push(id ? `/admin/qr-codes?flight_id=${id}` : "/admin/qr-codes");
  };

  return (
    <div data-portal="admin" className="min-h-screen font-sans pb-12">
      <AdminHeader
        activeTab="qr"
        flightId={flightId}
        onFlightChange={handleFlightChange}
      />

      <main className="mx-auto mt-10 max-w-5xl px-4 pb-16 sm:px-6">
        <div className="mb-8">
          <h1 className="flex items-center gap-2.5 text-2xl font-extrabold tracking-tight text-[var(--color-text-primary)]">
            <QrCode className="h-6 w-6 text-[#0F9E78]" />
            <span>Seat Boarding QR</span>
          </h1>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
            One QR code for the entire fleet. Print once, affix to every seat.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-[auto_1fr]">
          {/* The QR itself */}
          <div className="flex flex-col items-center gap-5 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-card)] p-7">
            <div className="rounded-[var(--radius-sm)] bg-white p-4 shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={QR_IMAGE}
                alt="AirMeal boarding QR code"
                width={340}
                height={340}
                className="h-[280px] w-[280px]"
              />
            </div>
            
            <a
              href={QR_IMAGE}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-[#5EEAD4] px-4 text-sm font-bold text-[#065F46] transition-colors hover:bg-[#99F6E4]"
            >
              <Printer className="h-4 w-4" />
              <span>Open / Print QR</span>
            </a>
          </div>

          {/* Explanation panel */}
          <div className="space-y-4">
            <div className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-card)] p-6">
              <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
                How it works
              </h2>
              <ol className="space-y-4 text-sm leading-relaxed text-[var(--color-text-primary)]">
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[#5EEAD4]/25 text-xs font-bold text-[#0F9E78]">1</span>
                  <span>Passenger scans the seat-back QR and lands on AirMeal.</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[#5EEAD4]/25 text-xs font-bold text-[#0F9E78]">2</span>
                  <span>They register once, or sign in to their existing account.</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[#5EEAD4]/25 text-xs font-bold text-[#0F9E78]">3</span>
                  <span>They enter their booking reference (PNR) and surname.</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[#5EEAD4]/25 text-xs font-bold text-[#0F9E78]">4</span>
                  <span>AirMeal resolves their flight, cabin and seat, then loads that flight&apos;s menu.</span>
                </li>
              </ol>
            </div>

            <div className="flex items-start gap-3 rounded-[var(--radius)] border border-[#5EEAD4]/50 bg-[#5EEAD4]/12 p-5">
              <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#0F9E78]" />
              <div className="text-xs leading-relaxed text-[var(--color-text-secondary)]">
                <span className="font-bold text-[var(--color-text-primary)]">Why a single code?</span>{" "}
                Flight context comes from the passenger&apos;s booking reference, not the QR.
                The same sticker stays valid as the aircraft rotates between routes, so there
                is no per-flight reprinting, no wasted paper, and no operational overhead.
              </div>
            </div>

            <div className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
                Encoded destination
              </p>
              <code className="break-all text-xs text-[var(--color-text-primary)]">{BOARDING_URL}</code>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function AdminQRCodesPage() {
  return (
    <Suspense fallback={null}>
      <AdminQRCodesContent />
    </Suspense>
  );
}

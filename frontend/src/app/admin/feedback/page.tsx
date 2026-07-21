"use client";

import { useEffect, useState, Suspense } from "react";
import { cabinChipStyle } from "@/lib/cabinColors";
import { useSearchParams, useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { AdminHeader } from "../_components/AdminHeader";
import { Loader2, Star, AlertTriangle, TrendingDown } from "lucide-react";

interface FeedbackItem {
  feedback_id: string;
  order_id: string;
  flight_number: string;
  origin: string;
  destination: string;
  seat_number: string | null;
  cabin_class: string;
  overall_rating: number;
  taste_rating: number | null;
  temp_rating: number | null;
  portion_rating: number | null;
  speed_rating: number | null;
  tags: string[];
  free_text: string | null;
  sentiment_score: number | null;
  created_at: string | null;
}

function AdminFeedbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { accessToken } = useAuth();

  const flightId = searchParams.get("flight_id");

  const [feedbackList, setFeedbackList] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFeedback = async () => {
    // Gate on flight selection: with no flight chosen we show an empty state
    // rather than dumping every flight's reviews. Skip the fetch entirely.
    if (!flightId) {
      setFeedbackList([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const path = `/api/v1/admin/feedback?flight_id=${flightId}`;
      const res = await api.get<{ data: FeedbackItem[] }>(path, accessToken || undefined);
      setFeedbackList(res.data || []);
    } catch (err) {
      console.error("Failed to fetch passenger feedback:", err);
      if (err instanceof ApiError) {
        setError(err.detail || "Failed to load passenger feedback.");
      } else {
        setError("Failed to load passenger feedback.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeedback();
  }, [flightId, accessToken]);

  const handleFlightChange = (id: string) => {
    if (id) {
      router.push(`/admin/feedback?flight_id=${id}`);
    } else {
      router.push("/admin/feedback");
    }
  };

  const [cabinFilter, setCabinFilter] = useState<string>("");

  const CABIN_ORDER = ["first", "business", "premium_economy", "economy"];
  const CABIN_LABEL: Record<string, string> = {
    first: "First", business: "Business", premium_economy: "Premium Economy", economy: "Economy",
  };

  const availableCabins = CABIN_ORDER.filter((c) =>
    feedbackList.some((f) => f.cabin_class === c)
  );

  const [ratingFilter, setRatingFilter] = useState<number>(0); // 0 = all
  const [sortOrder, setSortOrder] = useState<string>("newest"); // newest | highest | lowest

  const filteredFeedback = feedbackList
    .filter((f) => (cabinFilter ? f.cabin_class === cabinFilter : true))
    .filter((f) => (ratingFilter ? f.overall_rating === ratingFilter : true))
    .slice()
    .sort((a, b) => {
      if (sortOrder === "highest") return b.overall_rating - a.overall_rating;
      if (sortOrder === "lowest") return a.overall_rating - b.overall_rating;
      // newest
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });

  // Average rating on the filtered set
  const avgRating =
    filteredFeedback.length > 0
      ? (filteredFeedback.reduce((acc, curr) => acc + curr.overall_rating, 0) / filteredFeedback.length).toFixed(2)
      : "0.00";

  const formatTimestamp = (isoString: string | null) => {
    if (!isoString) return "";
    try {
      return new Date(isoString).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch (e) {
      return isoString;
    }
  };

  const formatCabinClass = (cabin: string) => {
    if (!cabin) return "";
    return cabin
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  return (
    <div className="min-h-screen text-[#E8F1FA] font-sans pb-12">
      <AdminHeader
        activeTab="feedback"
        flightId={flightId}
        onFlightChange={handleFlightChange}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 mt-6 pb-12">
        {error && (
          <div className="bg-[rgba(239,83,80,0.1)] border border-[rgba(239,83,80,0.2)] text-[#EF5350] text-sm p-4 rounded-xl flex items-start gap-2.5 mb-6">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold">Error Loading Feedback</h4>
              <p className="text-xs text-[#8BAABF] mt-1">{error}</p>
            </div>
          </div>
        )}

        {!flightId ? (
          <div className="bg-[#0A1929] border border-[rgba(30,136,229,0.15)] rounded-xl flex flex-col items-center justify-center text-center py-20 px-6">
            <TrendingDown className="w-10 h-10 text-[#1E88E5] mb-4" />
            <h3 className="font-extrabold text-base tracking-tight text-[var(--color-text)]">No Flight Selected</h3>
            <p className="text-sm text-[#8BAABF] mt-1.5 max-w-md">
              Please select a flight context in the header to view passenger ratings and reviews.
            </p>
          </div>
        ) : loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-[#8BAABF]">
            <Loader2 className="w-10 h-10 text-[#1E88E5] animate-spin mb-4" />
            <p className="text-sm">Loading passenger feedback...</p>
          </div>
        ) : (
          <>
            {/* Summary Bar */}
            <div className="bg-[#0A1929] border border-[rgba(30,136,229,0.15)] rounded-xl p-4 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="font-extrabold text-sm tracking-tight text-[var(--color-text)]">Passenger Feedback</h2>
                <p className="text-xs text-[#8BAABF] mt-0.5">
                  Showing individual ratings and reviews with flight context.
                </p>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <div className="text-[10px] text-[#8BAABF] uppercase tracking-wider font-bold">Total Reviews</div>
                  <div className="text-lg font-black text-[var(--color-text)]">{filteredFeedback.length}</div>
                </div>
                <div className="text-right border-l border-[rgba(30,136,229,0.15)] pl-6 font-mono">
                  <div className="text-[10px] text-[#8BAABF] uppercase tracking-wider font-bold">Avg Rating</div>
                  <div className="text-lg font-black text-[#FFB74D] flex items-center gap-1 justify-end">
                    <span>{avgRating}</span>
                    <Star className="w-4 h-4 text-[#FFB74D] fill-[#FFB74D]" />
                  </div>
                </div>
              </div>
            </div>

            {/* Cabin filter row */}
            {availableCabins.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <button
                  onClick={() => setCabinFilter("")}
                  className={`h-9 px-4 rounded-lg text-xs font-bold transition-all cursor-pointer ${cabinFilter === "" ? "" : "bg-transparent text-[var(--color-text-muted)] border border-[var(--color-border)] hover:text-[var(--color-text)]"}`}
                  style={cabinChipStyle("all", cabinFilter === "")}
                >
                  All Cabins
                </button>
                {availableCabins.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCabinFilter(c)}
                    className={`h-9 px-4 rounded-lg text-xs font-bold transition-all cursor-pointer ${cabinFilter === c ? "" : "bg-transparent text-[var(--color-text-muted)] border border-[var(--color-border)] hover:text-[var(--color-text)]"}`}
                    style={cabinChipStyle(c, cabinFilter === c)}
                  >
                    {CABIN_LABEL[c]}
                  </button>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className="text-[10px] text-[var(--color-text-muted)] font-bold uppercase tracking-wider mr-1">Rating:</span>
              <button
                onClick={() => setRatingFilter(0)}
                className={`h-8 px-3 rounded-lg text-[11px] font-bold transition-all cursor-pointer border ${ratingFilter === 0 ? "bg-[#DBEAFE] text-[#1E3A5F] border-transparent" : "bg-transparent text-[var(--color-text-muted)] border-[var(--color-border)] hover:text-[var(--color-text)]"}`}
              >
                All
              </button>
              {[5, 4, 3, 2, 1].map((r) => (
                <button
                  key={r}
                  onClick={() => setRatingFilter(r)}
                  className={`h-8 px-3 rounded-lg text-[11px] font-bold transition-all cursor-pointer border ${ratingFilter === r ? "bg-[#DBEAFE] text-[#1E3A5F] border-transparent" : "bg-transparent text-[var(--color-text-muted)] border-[var(--color-border)] hover:text-[var(--color-text)]"}`}
                >
                  {r}★
                </button>
              ))}
              <span className="text-[10px] text-[var(--color-text-muted)] font-bold uppercase tracking-wider ml-3 mr-1">Sort:</span>
              {[
                { key: "newest", label: "Newest" },
                { key: "highest", label: "Highest" },
                { key: "lowest", label: "Lowest" },
              ].map((s) => (
                <button
                  key={s.key}
                  onClick={() => setSortOrder(s.key)}
                  className={`h-8 px-3 rounded-lg text-[11px] font-bold transition-all cursor-pointer border ${sortOrder === s.key ? "bg-[#DBEAFE] text-[#1E3A5F] border-transparent" : "bg-transparent text-[var(--color-text-muted)] border-[var(--color-border)] hover:text-[var(--color-text)]"}`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {filteredFeedback.length === 0 ? (
              <div className="text-center py-20 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl">
                <p className="text-sm text-[var(--color-text-muted)]">No feedback matches this selection.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {filteredFeedback.map((item) => {
                  const subRatings = [
                    { label: "Taste", value: item.taste_rating },
                    { label: "Temp", value: item.temp_rating },
                    { label: "Portion", value: item.portion_rating },
                    { label: "Speed", value: item.speed_rating },
                  ].filter((sub) => sub.value !== null && sub.value !== undefined);

                  return (
                    <div
                      key={item.feedback_id}
                      className="bg-[#0A1929] border border-[rgba(30,136,229,0.15)] rounded-xl p-4 flex flex-col justify-between hover:border-[rgba(30,136,229,0.3)] transition-all gap-4"
                    >
                      <div className="space-y-3">
                        {/* Header Row */}
                        <div className="flex justify-between items-start gap-4">
                          <div>
                            <div className="text-sm font-bold text-[var(--color-text)]">
                              Flight {item.flight_number}
                            </div>
                            <div className="text-xs text-[#8BAABF] mt-0.5">
                              Seat {item.seat_number || "N/A"} • {formatCabinClass(item.cabin_class)}
                            </div>
                            <div className="text-[10px] text-[#5C7E97] mt-0.5 font-mono">
                              Order #{item.order_id.slice(0, 8)}
                            </div>
                          </div>
                          <div className="flex gap-0.5">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <Star
                                key={star}
                                className={`w-3.5 h-3.5 ${
                                  star <= item.overall_rating
                                    ? "text-[#FFB74D] fill-[#FFB74D]"
                                    : "text-[rgba(232,241,250,0.15)]"
                                }`}
                              />
                            ))}
                          </div>
                        </div>

                        {/* Sub-ratings row */}
                        {subRatings.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {subRatings.map((sub) => (
                              <span
                                key={sub.label}
                                className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] bg-[#050F1E] border border-[rgba(30,136,229,0.1)] text-[#8BAABF]"
                              >
                                <span className="font-semibold text-[var(--color-text)] mr-1">{sub.label}:</span>
                                <span>{sub.value}/5</span>
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Tags */}
                        {item.tags && item.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {item.tags.map((tag, idx) => (
                              <span
                                key={idx}
                                className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-[rgba(30,136,229,0.1)] text-[#64B5F6]"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Free Text Comment */}
                        <div className="pt-1">
                          {item.free_text && item.free_text.trim() ? (
                            <p className="italic text-[#E8F1FA] leading-relaxed">
                              &ldquo;{item.free_text}&rdquo;
                            </p>
                          ) : (
                            <p className="text-xs text-[#8BAABF] italic">No written comment</p>
                          )}
                        </div>
                      </div>

                      {/* Timestamp & Sentiment Corner */}
                      <div className="flex justify-between items-center mt-2 border-t border-[rgba(30,136,229,0.05)] pt-2">
                        {item.sentiment_score !== null && (
                          <span className={`text-[10px] font-mono font-semibold ${
                            item.sentiment_score >= 0.6
                              ? "text-[#4CAF50]"
                              : item.sentiment_score <= 0.4
                              ? "text-[#EF5350]"
                              : "text-[#FFB74D]"
                          }`}>
                            Sentiment: {(item.sentiment_score * 100).toFixed(0)}%
                          </span>
                        )}
                        <span className="text-[10px] text-[#8BAABF] ml-auto font-mono">
                          {formatTimestamp(item.created_at)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default function AdminFeedbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-[#8BAABF]">
          <Loader2 className="w-8 h-8 text-[#1E88E5] animate-spin mb-4" />
          <p className="text-sm">Loading feedback dashboard...</p>
        </div>
      }
    >
      <AdminFeedbackContent />
    </Suspense>
  );
}

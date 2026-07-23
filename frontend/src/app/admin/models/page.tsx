"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { AdminHeader } from "../_components/AdminHeader";
import {
  Loader2,
  AlertTriangle,
  Cpu,
  RefreshCw,
  Info,
  Clock,
  Activity,
  CheckCircle
} from "lucide-react";

interface AIModel {
  model_name: string;
  version: string;
  status: string;
  metrics: Record<string, number> | string;
  trained_at: string | null;
  created_at: string | null;
}

const MODEL_DISPLAY_NAMES: Record<string, string> = {
  recommender: "Meal Recommender Engine",
  forecaster: "Meal Demand Forecaster",
  crew_router: "Crew Task Router",
  waste_predictor: "Food Waste Predictor"
};

const formatMetricKey = (key: string) => {
  if (key === "ndcg_at_10") return "NDCG @ 10";
  if (key === "recall_at_10") return "Recall @ 10";
  if (key === "precision_at_5") return "Precision @ 5";
  if (key === "mae") return "MAE";
  if (key === "rmse") return "RMSE";
  if (key === "mape") return "MAPE";
  if (key === "n_train_rows") return "Train Rows";
  if (key === "n_test_rows") return "Test Rows";

  return key
    .replace(/_/g, " ")
    .replace(/\bat\b/g, "@")
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const formatMetricValue = (val: any) => {
  if (typeof val === "number") {
    if (Number.isInteger(val)) {
      return val.toLocaleString();
    }
    return Number(val.toPrecision(4)).toString();
  }
  return String(val);
};

function AdminModelsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { accessToken } = useAuth();

  const flightId = searchParams.get("flight_id");

  const [models, setModels] = useState<AIModel[]>([]);
  const [showRetrainInfo, setShowRetrainInfo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Per-model status track
  const [retraining, setRetraining] = useState<Record<string, boolean>>({});
  const [retrainErrors, setRetrainErrors] = useState<Record<string, string | null>>({});
  const [retrainTimeouts, setRetrainTimeouts] = useState<Record<string, boolean>>({});
  const [confirmingModel, setConfirmingModel] = useState<string | null>(null);
  const [retrainSuccess, setRetrainSuccess] = useState<Record<string, boolean>>({});

  const fetchModels = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ data: AIModel[] }>("/api/v1/ai/models", accessToken || undefined);
      setModels(res.data || []);
    } catch (err) {
      console.error("Failed to fetch models registry:", err);
      if (err instanceof ApiError) {
        setError(err.detail || "Failed to load models registry.");
      } else {
        setError("Failed to load models registry.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchModels();
  }, [accessToken]);

  const handleRetrain = async (name: string) => {
    setConfirmingModel(null);
    setRetraining((prev) => ({ ...prev, [name]: true }));
    setRetrainErrors((prev) => ({ ...prev, [name]: null }));
    setRetrainTimeouts((prev) => ({ ...prev, [name]: false }));

    const isSlow = ["crew_router", "waste_predictor"].includes(name);

    try {
      if (isSlow) {
        // Enforce 30-second client-side timeout using Promise.race
        const retrainPromise = api.post<{ data: AIModel }>(
          `/api/v1/ai/models/${name}/retrain`,
          {},
          accessToken || undefined
        );

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("TIMEOUT")), 30000)
        );

        const result = await Promise.race([retrainPromise, timeoutPromise]);
        
        // If it returns successfully under 30s, update that model card and fetch full list
        const updatedModel = result.data;
        setModels((prev) =>
          prev.map((m) => (m.model_name === name ? updatedModel : m))
        );
        await fetchModels();
      } else {
        // Fast models (under 1s)
        const res = await api.post<{ data: AIModel }>(
          `/api/v1/ai/models/${name}/retrain`,
          {},
          accessToken || undefined
        );
        const updatedModel = res.data;
        setModels((prev) =>
          prev.map((m) => (m.model_name === name ? updatedModel : m))
        );
        await fetchModels();
      }
      // Show brief success confirmation, then auto-clear
      setRetrainSuccess((prev) => ({ ...prev, [name]: true }));
      setTimeout(() => {
        setRetrainSuccess((prev) => ({ ...prev, [name]: false }));
      }, 2500);
    } catch (err: any) {
      console.error(`Failed to retrain model ${name}:`, err);
      if (err.message === "TIMEOUT") {
        setRetrainTimeouts((prev) => ({ ...prev, [name]: true }));
      } else if (err instanceof ApiError) {
        setRetrainErrors((prev) => ({ ...prev, [name]: err.detail || "Failed to retrain model" }));
      } else {
        setRetrainErrors((prev) => ({ ...prev, [name]: "Failed to retrain model" }));
      }
    } finally {
      setRetraining((prev) => ({ ...prev, [name]: false }));
    }
  };

  const getStatusBadge = (status: string) => {
    const normalized = status.toLowerCase();
    if (normalized === "ready") {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border bg-[rgba(76,175,80,0.1)] border-[#4CAF50] text-[#4CAF50]">
          Ready
        </span>
      );
    }
    if (normalized === "untrained") {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border bg-[rgba(139,170,191,0.1)] border-[#8BAABF] text-[#8BAABF]">
          Untrained
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border bg-[rgba(255,183,77,0.1)] border-[#FFB74D] text-[#FFB74D]">
        {status}
      </span>
    );
  };

  return (
    <div className="min-h-screen text-[#E8F1FA] font-sans pb-12">
      <AdminHeader
        activeTab="models"
        flightId={flightId}
        onFlightChange={(id) => router.push("/admin/models?flight_id=" + id)}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 mt-6 space-y-6">

        {/* Page title + retrain explainer */}
        <div className="flex items-center gap-2">
          <Cpu className="w-5 h-5 text-[#1E88E5]" />
          <h2 className="text-lg font-extrabold tracking-tight text-[var(--color-text)]">AI Model Registry</h2>
          <div className="relative inline-flex">
            <button
              type="button"
              onMouseEnter={() => setShowRetrainInfo(true)}
              onMouseLeave={() => setShowRetrainInfo(false)}
              onClick={() => setShowRetrainInfo((v) => !v)}
              aria-label="What does retraining do?"
              className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[var(--color-text-muted)] hover:text-[#1E88E5] hover:bg-[rgba(30,136,229,0.1)] transition-colors cursor-pointer"
            >
              <Info className="w-4 h-4" />
            </button>
            {showRetrainInfo && (
              <div className="absolute left-0 top-8 z-30 w-72 p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl text-[11px] leading-relaxed text-[var(--color-text-muted)]">
                <p className="font-bold text-[var(--color-text)] mb-1.5">Retrain Model</p>
                <p className="mb-1.5">Rebuilds a model on the latest flight data and recomputes its accuracy on a held-out test set. The metrics shown update only after a real retrain finishes.</p>
                <p>Use it after data changes or to confirm results are reproducible. It does not alter how the app behaves day-to-day — it refreshes the trained model and its reported scores.</p>
              </div>
            )}
          </div>
        </div>

        {/* Honest note block */}
        <div className="bg-[rgba(30,136,229,0.05)] border border-[rgba(30,136,229,0.15)] rounded-xl p-4 flex items-start gap-2.5">
          <Activity className="w-5 h-5 text-[#1E88E5] flex-shrink-0 mt-0.5" />
          <p className="text-xs text-[#8BAABF] leading-relaxed">
            Metrics are computed at runtime from held-out evaluation. Values shown are real model outputs, never target figures.
          </p>
        </div>

        {loading && models.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-[#8BAABF]">
            <Loader2 className="w-10 h-10 text-[#1E88E5] animate-spin mb-4" />
            <p className="text-sm">Loading model registry...</p>
          </div>
        ) : error ? (
          <div className="bg-[#0A1929] border border-[rgba(30,136,229,0.15)] rounded-xl p-8 text-center max-w-md mx-auto">
            <AlertTriangle className="w-12 h-12 text-[#EF5350] mx-auto mb-4" />
            <h3 className="font-bold text-lg text-[#E8F1FA] mb-2">Error Loading Models</h3>
            <p className="text-xs text-[#8BAABF] mb-6 leading-relaxed">{error}</p>
            <button
              onClick={fetchModels}
              className="h-11 px-6 bg-[#90CAF9] hover:bg-[#64B5F6] text-[#0A2F5E] rounded-lg text-xs font-semibold cursor-pointer"
              style={{ minHeight: "44px" }}
            >
              Reload Registry
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {models.map((model) => {
              const name = model.model_name;
              const displayName = MODEL_DISPLAY_NAMES[name] || name;
              const isRetraining = retraining[name];
              const retrainError = retrainErrors[name];
              const justRetrained = retrainSuccess[name];
              const isTimeout = retrainTimeouts[name];
              const isUntrained = model.status.toLowerCase() === "untrained";
              const isMetricsString = typeof model.metrics === "string";

              const MODEL_ACCENTS: Record<string, { bg: string; border: string; icon: string }> = {
                recommender:    { bg: "rgba(59,130,196,0.14)",  border: "rgba(59,130,196,0.30)",  icon: "#3B82C4" },
                crew_router:    { bg: "rgba(63,160,147,0.14)",  border: "rgba(63,160,147,0.30)",  icon: "#3FA093" },
                forecaster:     { bg: "rgba(200,122,58,0.14)",  border: "rgba(200,122,58,0.32)",  icon: "#C87A3A" },
                waste_predictor:{ bg: "rgba(90,160,93,0.14)",   border: "rgba(90,160,93,0.30)",   icon: "#5AA05D" },
              };
              const accent = MODEL_ACCENTS[name] || { bg: "var(--color-surface-alt)", border: "var(--color-border)", icon: "#1E88E5" };

              return (
                <div
                  key={name}
                  className="flex flex-col justify-between overflow-hidden rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-card)] shadow-[var(--shadow-sm)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--color-border-light)] hover:shadow-[var(--shadow-md)]"
                >
                  <div className="flex items-center justify-between gap-4 border-b border-[var(--color-border)] px-6 py-4 text-[var(--color-text)]" style={{ background: accent.bg }}>
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)]" style={{ backgroundColor: accent.bg, color: accent.icon, border: `1px solid ${accent.border}` }}>
                        <Cpu className="h-4 w-4" />
                      </div>
                      <div>
                        <h3 className="text-base font-extrabold tracking-tight text-[var(--color-text-primary)]">
                          {displayName}
                        </h3>
                        <p className="mt-0.5 font-mono text-[10px] text-[var(--color-text-secondary)]">
                          ID: {name} | Version: {model.version}
                        </p>
                      </div>
                    </div>
                    {getStatusBadge(model.status)}
                  </div>

                  <div className="space-y-4 p-6">

                    {/* Trained details */}
                    <div className="text-[10px] text-[#8BAABF] flex items-center gap-1.5 bg-[#050F1E] border border-[rgba(30,136,229,0.05)] rounded px-2.5 py-1.5">
                      <Clock className="w-3.5 h-3.5 text-[#1E88E5]" />
                      <span>
                        Last Trained:{" "}
                        <strong className="text-[var(--color-text)]">
                          {model.trained_at ? new Date(model.trained_at).toLocaleString() : "Never trained"}
                        </strong>
                      </span>
                    </div>

                    {/* Action alerts */}
                    {retrainError && (
                      <div className="bg-[rgba(198,40,40,0.1)] border border-[rgba(198,40,40,0.2)] text-[#EF5350] text-[11px] p-2.5 rounded-lg flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <span>{retrainError}</span>
                      </div>
                    )}

                    {isTimeout && (
                      <div className="bg-[rgba(255,183,77,0.08)] border border-[rgba(255,183,77,0.25)] text-[#FFB74D] text-[11px] p-3 rounded-lg flex items-start gap-2 leading-relaxed">
                        <AlertTriangle className="w-4.5 h-4.5 flex-shrink-0 mt-0.5 text-[#FFB74D]" />
                        <span>
                          Retraining exceeded 30s and was not awaited. Full retrain of this model is a known limitation of the current demo build. The stored metrics below are unchanged.
                        </span>
                      </div>
                    )}

                    {/* Metrics Section */}
                    <div className="space-y-2">
                      <h4 className="text-[10px] text-[#8BAABF] font-bold uppercase tracking-wider">Evaluation Metrics</h4>
                      
                      {isUntrained || isMetricsString || model.metrics === "Not yet evaluated" ? (
                        <div className="bg-[#050F1E] border border-[rgba(30,136,229,0.08)] rounded-lg p-4 text-center text-xs text-[#8BAABF] italic">
                          Not yet evaluated
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-3">
                          {Object.entries(model.metrics as Record<string, number>).map(([mKey, mVal]) => (
                            <div
                              key={mKey}
                              className="bg-[#050F1E] border border-[rgba(30,136,229,0.08)] rounded-lg p-3"
                            >
                              <div className="text-[9px] text-[#8BAABF] font-medium uppercase tracking-wider mb-0.5">
                                {formatMetricKey(mKey)}
                              </div>
                              <div className="text-sm font-black text-[var(--color-text)]">
                                {formatMetricValue(mVal)}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions footer */}
                  <div className="mt-6">
                    {isRetraining ? (
                      <button
                        type="button"
                        disabled
                        className="w-full h-11 bg-[rgba(30,136,229,0.04)] border border-[rgba(30,136,229,0.25)] text-[#1E88E5] font-bold rounded-lg text-xs flex items-center justify-center gap-1.5"
                        style={{ minHeight: "44px" }}
                      >
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Retraining Model...</span>
                      </button>
                    ) : justRetrained ? (
                      <div
                        className="w-full h-11 bg-[var(--color-success)]/12 border border-[var(--color-success)]/30 text-[var(--color-success-light)] font-bold rounded-lg text-xs flex items-center justify-center gap-1.5"
                        style={{ minHeight: "44px" }}
                      >
                        <CheckCircle className="w-4 h-4" />
                        <span>Retrained successfully</span>
                      </div>
                    ) : confirmingModel === name ? (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleRetrain(name)}
                          className="flex-1 h-11 bg-transparent hover:bg-[rgba(46,125,50,0.08)] border border-[rgba(46,125,50,0.30)] text-[#2E7D32] font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                          style={{ minHeight: "44px" }}
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Confirm Retrain</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingModel(null)}
                          className="flex-1 h-11 bg-transparent hover:bg-[rgba(239,83,80,0.08)] border border-[rgba(239,83,80,0.25)] text-[#EF5350] font-bold rounded-lg text-xs flex items-center justify-center transition-colors cursor-pointer"
                          style={{ minHeight: "44px" }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmingModel(name)}
                        className="w-full h-12 bg-transparent hover:bg-[rgba(30,136,229,0.08)] border border-[rgba(30,136,229,0.25)] text-[#1E88E5] font-bold rounded-lg text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
                        style={{ minHeight: "48px" }}
                      >
                        <RefreshCw className="w-4 h-4" />
                        <span>Retrain Model</span>
                      </button>
                    )}
                  </div>

                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

export default function AdminModelsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-[#8BAABF]">
          <Loader2 className="w-8 h-8 text-[#1E88E5] animate-spin mb-4" />
          <p className="text-sm">Loading model manager...</p>
        </div>
      }
    >
      <AdminModelsContent />
    </Suspense>
  );
}

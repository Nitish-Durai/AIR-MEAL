"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import Link from "next/link";
import {
  Loader2,
  ChevronLeft,
  ChevronRight,
  Check,
  ShieldAlert,
  Sparkles,
  Heart,
  Scale
} from "lucide-react";

const DIETARY_OPTIONS = [
  { key: "vegetarian", label: "Vegetarian", desc: "No meat, poultry, or fish" },
  { key: "non_vegetarian", label: "Non-vegetarian", desc: "Includes meat, poultry, or fish" },
  { key: "halal", label: "Halal", desc: "Halal certified food" },
  { key: "gluten_free", label: "Gluten Free", desc: "No wheat, barley, or rye grains" },
  { key: "low_calorie", label: "Low Calorie", desc: "Lower calorie options" },
  { key: "jain", label: "Jain", desc: "Vegetarian, no onion or garlic" }
];

const ALLERGEN_OPTIONS = [
  { key: "nuts", label: "Peanuts & Tree Nuts" },
  { key: "gluten", label: "Gluten / Wheat" },
  { key: "dairy", label: "Dairy / Milk" },
  { key: "eggs", label: "Eggs" },
  { key: "soy", label: "Soybeans" },
  { key: "shellfish", label: "Shellfish" },
  { key: "sesame", label: "Sesame Seeds" },
  { key: "fish", label: "Fin Fish" }
];

const CUISINES = [
  { key: "american", label: "American", desc: "Burgers, comfort classics & grills" },
  { key: "indian", label: "Indian", desc: "Aromatic spices, curry & flatbreads" },
  { key: "continental", label: "Continental", desc: "European-style mains & sides" },
  { key: "mediterranean", label: "Mediterranean", desc: "Olive oil, salads & feta" },
  { key: "thai", label: "Thai", desc: "Lemongrass, coconut & chili" },
  { key: "japanese", label: "Japanese", desc: "Fresh sushi, ramen & teriyaki" },
  { key: "chinese", label: "Chinese", desc: "Stir-fries, noodles & dumplings" },
  { key: "middle_eastern", label: "Middle Eastern", desc: "Hummus, grills & spiced rice" }
];

const PORTIONS = [
  { key: "small", label: "Light Portion", desc: "Under 300 kcal (e.g. soups, fruits)" },
  { key: "medium", label: "Regular Portion", desc: "Standard portion sizes" },
  { key: "large", label: "Generous Portion", desc: "Filling, hearty servings" }
];

const PRICES = [
  { key: "budget", label: "Budget / Low", desc: "Value and core items" },
  { key: "mid", label: "Standard / Mid", desc: "Premium quality selection" },
  { key: "premium", label: "Premium / High", desc: "Exclusive luxury options" }
];

export default function OnboardingPage() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let W = 0, H = 0;
    const resize = () => {
      W = cvs.width = window.innerWidth;
      H = cvs.height = window.innerHeight;
    };
    resize();
    const nodes = Array.from({ length: 60 }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35,
    }));
    const planes = Array.from({ length: 3 }, () => ({
      x: Math.random() * W, y: 60 + Math.random() * (H - 120), s: 0.4 + Math.random() * 0.5,
    }));
    const nodeColor = "rgba(130,185,255,0.7)";
    const lineBase = "59,157,255";
    const planeColor = "rgba(255,122,69,0.35)";
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      for (const n of nodes) {
        n.x += n.vx; n.y += n.vy;
        if (n.x < 0 || n.x > W) n.vx *= -1;
        if (n.y < 0 || n.y > H) n.vy *= -1;
      }
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 150) {
            ctx.strokeStyle = `rgba(${lineBase},${0.18 * (1 - d / 150)})`;
            ctx.lineWidth = 0.6;
            ctx.beginPath(); ctx.moveTo(nodes[i].x, nodes[i].y); ctx.lineTo(nodes[j].x, nodes[j].y); ctx.stroke();
          }
        }
      }
      for (const n of nodes) { ctx.fillStyle = nodeColor; ctx.beginPath(); ctx.arc(n.x, n.y, 1.4, 0, 7); ctx.fill(); }
      for (const p of planes) {
        p.x += p.s;
        if (p.x > W + 30) { p.x = -30; p.y = 60 + Math.random() * (H - 120); }
        ctx.fillStyle = planeColor;
        ctx.save(); ctx.translate(p.x, p.y);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-10, -3); ctx.lineTo(-7, 0); ctx.lineTo(-10, 3); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    window.addEventListener("resize", resize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Profile preferences state
  const [dietaryFlags, setDietaryFlags] = useState<Record<string, boolean>>({
    vegetarian: false,
    halal: false,
    gluten_free: false,
    low_calorie: false,
    jain: false
  });

  const [allergyFlags, setAllergyFlags] = useState<Record<string, boolean>>({
    nuts: false,
    gluten: false,
    dairy: false,
    eggs: false,
    soy: false,
    shellfish: false,
    sesame: false,
    fish: false
  });

  const [cuisinePrefs, setCuisinePrefs] = useState<Record<string, number>>({
    american: 0.5,
    indian: 0.5,
    continental: 0.5,
    mediterranean: 0.5,
    thai: 0.5,
    japanese: 0.5,
    chinese: 0.5,
    middle_eastern: 0.5
  });

  const [portionPref, setPortionPref] = useState<string>("medium");
  const [priceSensitivity, setPriceSensitivity] = useState<string>("mid");

  const toggleDiet = (key: string) => {
    setDietaryFlags(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleAllergy = (key: string) => {
    setAllergyFlags(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleCuisineChange = (key: string, val: number) => {
    setCuisinePrefs(prev => ({ ...prev, [key]: val }));
  };

  const handleNext = () => {
    if (step < 4) {
      setStep(prev => prev + 1);
    } else {
      submitPreferences();
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(prev => prev - 1);
    }
  };

  const submitPreferences = async () => {
    setLoading(true);
    setError(null);

    try {
      await api.put<any>(
        "/api/v1/passengers/profile",
        {
          dietary_flags: dietaryFlags,
          allergy_flags: allergyFlags,
          cuisine_prefs: cuisinePrefs,
          portion_pref: portionPref,
          price_sensitivity: priceSensitivity
        },
        accessToken || undefined
      );

      // Successfully onboarded, route back to passenger home dashboard
      router.push("/passenger");
    } catch (err) {
      console.error("Failed to update preferences profile:", err);
      if (err instanceof ApiError) {
        setError(err.detail || "Failed to update onboarding preferences.");
      } else {
        setError("Failed to update onboarding preferences. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const renderStepTitle = () => {
    switch (step) {
      case 1:
        return {
          title: "Dietary Preferences",
          subtitle: "Tell us if you follow any specific dietary regimens.",
          icon: <Heart className="w-5 h-5 text-[#FF6B35]" />
        };
      case 2:
        return {
          title: "Allergies & Intolerances",
          subtitle: "We strictly block allergen-conflicting meals from your selection.",
          icon: <ShieldAlert className="w-5 h-5 text-[#EF5350]" />
        };
      case 3:
        return {
          title: "Cuisine Preferences",
          subtitle: "Rate how much you enjoy each cuisine style (0 = dislike, 1 = love).",
          icon: <Sparkles className="w-5 h-5 text-[#FF6B35]" />
        };
      case 4:
        return {
          title: "Portion Size Preference",
          subtitle: "What portion sizes do you typically prefer onboard?",
          icon: <Scale className="w-5 h-5 text-[#1E88E5]" />
        };
      default:
        return { title: "", subtitle: "", icon: null };
    }
  };

  const stepMeta = renderStepTitle();

  return (
    <div className="relative min-h-screen w-full flex flex-col justify-center items-center py-12 px-4 font-sans text-[#E8F1FA]">
      <div className="w-full max-w-2xl mx-auto z-10">
      
      {/* Step Indicator */}
      <div className="mb-6 flex items-center justify-between">
        <span className="text-xs font-semibold text-[#8BAABF]">Step {step} of 4</span>
        <div className="flex gap-1.5">
          {[1, 2, 3, 4].map(s => (
            <div
              key={s}
              className={`h-1.5 w-6 rounded-full transition-colors ${
                s === step
                  ? "bg-[#1E88E5]"
                  : s < step
                  ? "bg-[#1E88E5]"
                  : "bg-[rgba(30,136,229,0.15)]"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Header section */}
      <div className="mb-6 space-y-1">
        <div className="flex items-center gap-2">
          {stepMeta.icon}
          <h1 className="text-xl font-bold">{stepMeta.title}</h1>
        </div>
        <p className="text-xs text-[#8BAABF] leading-relaxed">{stepMeta.subtitle}</p>
      </div>

      {error && (
        <div className="bg-[rgba(198,40,40,0.15)] border border-[#EF5350] rounded-lg p-3 text-xs text-[#EF5350] mb-6 flex items-start gap-2">
          <ShieldAlert className="w-5 h-5 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Active step content */}
      <div className="glass-card p-5 border border-white/12 mb-6 min-h-[40vh] flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:shadow-[0_20px_50px_rgba(30,136,229,0.15)]">
        
        {/* Step 1: Dietary */}
        {step === 1 && (
          <div className="space-y-3 w-full">
            {DIETARY_OPTIONS.map(opt => {
              const isActive = dietaryFlags[opt.key];
              return (
                <button
                  type="button"
                  key={opt.key}
                  onClick={() => toggleDiet(opt.key)}
                  className={`w-full p-3 rounded-lg border text-left flex justify-between items-center transition-all cursor-pointer ${
                    isActive
                      ? "bg-[#1E88E5] border-[#1E88E5] text-white"
                      : "bg-[#050F1E] border-[rgba(30,136,229,0.1)] hover:border-[rgba(30,136,229,0.3)]"
                  }`}
                  style={{ minHeight: "44px" }}
                >
                  <div>
                    <p className="font-semibold text-xs text-inherit">{opt.label}</p>
                    <p className={`text-[10px] mt-0.5 ${isActive ? "text-white/85" : "text-[#8BAABF]"}`}>{opt.desc}</p>
                  </div>
                  {isActive && (
                    <div className="w-5 h-5 rounded-full bg-[#1E88E5] flex items-center justify-center flex-shrink-0">
                      <Check className="w-3.5 h-3.5 text-white" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Step 2: Allergies */}
        {step === 2 && (
          <div className="w-full space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {ALLERGEN_OPTIONS.map(opt => {
                const isActive = allergyFlags[opt.key];
                return (
                  <button
                    type="button"
                    key={opt.key}
                    onClick={() => toggleAllergy(opt.key)}
                    className={`p-3 rounded-lg border text-center flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      isActive
                        ? "bg-[rgba(239,83,80,0.15)] border-[#EF5350] text-[#EF5350]"
                        : "bg-[#050F1E] border-[rgba(30,136,229,0.1)] text-[#8BAABF] hover:border-[#EF5350]"
                    }`}
                    style={{ minHeight: "64px" }}
                  >
                    <span className="font-semibold text-xs">{opt.label}</span>
                    {isActive && (
                      <span className="text-[9px] uppercase font-bold bg-[#EF5350] text-white px-1.5 py-0.5 rounded-full">
                        Flagged
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-[#8BAABF] leading-normal text-center mt-3">
              * Safety warnings are updated dynamically across the platform based on these choices.
            </p>
          </div>
        )}

        {/* Step 3: Cuisines */}
        {step === 3 && (
          <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 pr-1">
            {CUISINES.map(opt => {
              const val = cuisinePrefs[opt.key];
              return (
                <div key={opt.key} className="space-y-1 border-b border-[rgba(30,136,229,0.05)] pb-3">
                  <div className="flex justify-between items-center text-xs">
                    <div>
                      <span className="font-semibold text-[#E8F1FA]">{opt.label}</span>
                      <span className="text-[10px] text-[#8BAABF] block">{opt.desc}</span>
                    </div>
                    <span className="font-bold text-[#1E88E5]">{(val * 100).toFixed(0)}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={val}
                      onChange={(e) => handleCuisineChange(opt.key, parseFloat(e.target.value))}
                      className="w-full h-2 bg-[#050F1E] rounded-lg appearance-none cursor-pointer accent-[#1E88E5]"
                      style={{ minHeight: "44px" }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Step 4: Portion */}
        {step === 4 && (
          <div className="w-full space-y-3">
            {PORTIONS.map(opt => {
              const isActive = portionPref === opt.key;
              return (
                <button
                  type="button"
                  key={opt.key}
                  onClick={() => setPortionPref(opt.key)}
                  className={`w-full p-4 rounded-lg border text-left flex justify-between items-center transition-all cursor-pointer ${
                    isActive
                      ? "bg-[#1E88E5] border-[#1E88E5] text-white"
                      : "bg-[#050F1E] border-[rgba(30,136,229,0.1)] hover:border-[rgba(30,136,229,0.3)]"
                  }`}
                  style={{ minHeight: "44px" }}
                >
                  <div>
                    <p className="font-semibold text-xs text-inherit">{opt.label}</p>
                    <p className={`text-[10px] mt-0.5 ${isActive ? "text-white/85" : "text-[#8BAABF]"}`}>{opt.desc}</p>
                  </div>
                  {isActive && (
                    <div className="w-5 h-5 rounded-full bg-[#1E88E5] flex items-center justify-center flex-shrink-0">
                      <Check className="w-3.5 h-3.5 text-white" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

      </div>

      {/* Footer Navigation Buttons */}
      <div className="flex gap-3">
        {step > 1 ? (
          <button
            onClick={handleBack}
            disabled={loading}
            className="flex-1 h-12 border border-[rgba(30,136,229,0.2)] rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-1 cursor-pointer"
            style={{ minHeight: "44px" }}
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Back</span>
          </button>
        ) : (
          <Link
            href="/passenger"
            className="flex-1 h-12 border border-[rgba(30,136,229,0.15)] rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-1"
            style={{ minHeight: "44px" }}
          >
            <span>Skip</span>
          </Link>
        )}

        <button
          onClick={handleNext}
          disabled={loading}
          className="flex-1 h-12 bg-[#90CAF9] hover:bg-[#64B5F6] text-[#0A2F5E] font-bold rounded-lg text-sm transition-colors flex items-center justify-center gap-1 cursor-pointer"
          style={{ minHeight: "44px" }}
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Saving...</span>
            </>
          ) : (
            <>
              <span>{step === 4 ? "Finish" : "Next"}</span>
              {step < 4 && <ChevronRight className="w-4 h-4" />}
            </>
          )}
        </button>
      </div>

      </div>
    </div>
  );
}

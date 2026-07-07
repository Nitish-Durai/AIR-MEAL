"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import Link from "next/link";
import { SearchBar } from "@/components/ui/search-bar";
import {
  Armchair,
  ShieldCheck,
  Search,
  Filter,
  Flame,
  AlertCircle,
  ChevronLeft,
  ShoppingBag,
  Loader2,
  Sparkles,
  Plus,
  Minus,
  X,
  ChevronRight,
  CheckCircle,
  AlertTriangle,
  Check
} from "lucide-react";

interface MealItemResponse {
  id: string;
  meal_code: string;
  category_id: string | null;
  name: string;
  cuisine_type: string | null;
  ingredients: Record<string, unknown> | null;
  allergen_flags: Record<string, boolean> | null;
  dietary_flags: Record<string, boolean> | null;
  calories: number | null;
  image_url: string | null;
  current_stock: number | null;
  initial_qty: number | null;
  is_alcohol?: boolean;
}

import { categoryChipStyle, dietChipStyle } from "@/lib/categoryColors";

interface RecommendationResponseItem {
  meal_id: string;
  meal_code: string;
  name: string;
  score: number;
  why: string;
  calories: number | null;
  allergen_flags: Record<string, boolean>;
  dietary_flags: Record<string, boolean>;
  waste_boosted?: boolean;
}

const CATEGORY_MAP: Record<string, string> = {
  "06ce14c8-3158-44a4-b6a0-04674d81a0d2": "Beverages",
  "29101780-8b9e-4c5e-af92-bb2e667840ed": "Desserts",
  "13d16283-160e-4c20-aebd-f9d6297e4c73": "Main Course",
  "233ea18b-ca97-4371-ba51-51731e512c3a": "Snacks",
  "71445abc-2f0d-4ac2-8097-acb7a3823bc9": "Starters",
};

const getCategoryName = (categoryId: string | null, uniqueCategoryIds: string[]) => {
  if (!categoryId) return "General";
  if (CATEGORY_MAP[categoryId]) return CATEGORY_MAP[categoryId];
  const index = uniqueCategoryIds.indexOf(categoryId);
  const fallbackNames = ["Starters", "Main Course", "Desserts", "Beverages", "Snacks"];
  return index !== -1 && index < fallbackNames.length ? fallbackNames[index] : `Category ${index + 1}`;
};

function MenuBrowser() {
  const router = useRouter();
  const searchParams = useSearchParams();
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

  // Load params from URL or fallback to localStorage
  const [flightId, setFlightId] = useState<string | null>(null);
  const [cabinClass, setCabinClass] = useState<string>("economy");
  const [seatNumber, setSeatNumber] = useState<string | null>(null);

  const [menuItems, setMenuItems] = useState<MealItemResponse[]>([]);
  const [recommendations, setRecommendations] = useState<RecommendationResponseItem[]>([]);
  const [recLoading, setRecLoading] = useState<boolean>(true);
  const [allergyFlags, setAllergyFlags] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedCategory, setSelectedCategory] = useState<string>("All");

  const [selectedRecCategory, setSelectedRecCategory] = useState<string>("All");
  const [selectedDiet, setSelectedDiet] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState("");

  // Unique categories list for dynamic mapping fallback
  const [uniqueCategories, setUniqueCategories] = useState<string[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const mealCategory = (meal: MealItemResponse) =>
    meal.is_alcohol ? "Alcohol" : getCategoryName(meal.category_id, uniqueCategories);

  // Cart and ordering state
  const [cart, setCart] = useState<Record<string, number>>({});
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [priorityFactors, setPriorityFactors] = useState<string[]>([]);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [createdOrder, setCreatedOrder] = useState<any | null>(null);
  const [expandedRecId, setExpandedRecId] = useState<string | null>(null);

  const [lastOrderId, setLastOrderId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setLastOrderId(localStorage.getItem("airmeal_last_order_id"));
    }
  }, []);

  const togglePriority = (f: string) =>
    setPriorityFactors(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const qFlightId = searchParams.get("flight_id");
      const qCabinClass = searchParams.get("cabin_class");
      const qSeatNumber = searchParams.get("seat_number");

      const fId = qFlightId || localStorage.getItem("airmeal_flight_id");
      const cClass = qCabinClass || localStorage.getItem("airmeal_cabin_class") || "economy";
      const sNum = qSeatNumber || localStorage.getItem("airmeal_seat_number");

      setFlightId(fId);
      setCabinClass(cClass);
      setSeatNumber(sNum);

      if (qFlightId) localStorage.setItem("airmeal_flight_id", qFlightId);
      if (qCabinClass) localStorage.setItem("airmeal_cabin_class", qCabinClass);
      if (qSeatNumber) localStorage.setItem("airmeal_seat_number", qSeatNumber);
    }
  }, [searchParams]);

  // Main menu & profile fetcher
  useEffect(() => {
    if (!flightId) return;

    const fetchMenuAndProfile = async () => {
      setLoading(true);
      setError(null);
      try {
        // Fetch Menu
        const menuResponse = await api.get<{ data: MealItemResponse[] }>(
          `/api/v1/flights/${flightId}/menu?cabin_class=${cabinClass.toLowerCase()}`,
          accessToken || undefined
        );
        const meals = menuResponse.data || [];
        setMenuItems(meals);

        // Fetch unique category IDs to support fallback index mapping
        const catIds = Array.from(new Set(meals.map(m => m.category_id).filter((id): id is string => !!id)));
        setUniqueCategories(catIds);

        // Fetch Passenger Profile to check allergens
        if (accessToken) {
          try {
            const profileResponse = await api.get<{ data: { allergy_flags?: Record<string, boolean> } }>(
              "/api/v1/passengers/profile",
              accessToken
            );
            setAllergyFlags(profileResponse.data?.allergy_flags || {});
          } catch (profileErr) {
            console.error("Could not fetch profile, defaulting to empty allergy flags", profileErr);
          }
        }
      } catch (err) {
        console.error("Failed to load menu details:", err);
        if (err instanceof ApiError) {
          setError(err.detail || "Failed to load flight menu.");
        } else {
          setError("Failed to load flight menu.");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchMenuAndProfile();
  }, [flightId, cabinClass, accessToken, refreshKey]);

  // Recommendations fetcher
  useEffect(() => {
    if (!flightId || !accessToken) {
      setRecommendations([]);
      setRecLoading(false);
      return;
    }
    const fetchRecommendations = async () => {
      setRecLoading(true);
      try {
        const recResponse = await api.get<{ data: RecommendationResponseItem[] }>(
          `/api/v1/flights/${flightId}/recommendations?top_n=10`,
          accessToken
        );
        setRecommendations(recResponse.data || []);
      } catch (recErr) {
        console.error("Failed to load recommendations:", recErr);
      } finally {
        setRecLoading(false);
      }
    };
    fetchRecommendations();
  }, [flightId, accessToken, refreshKey]);

  // Auto-close review modal if cart is cleared
  const totalCartCount = Object.values(cart).reduce((sum, q) => sum + q, 0);
  useEffect(() => {
    if (isReviewModalOpen && totalCartCount === 0) {
      setIsReviewModalOpen(false);
      setOrderError(null);
    }
  }, [totalCartCount, isReviewModalOpen]);

  // Lock background body scroll when any modal is open
  useEffect(() => {
    const anyModalOpen = isReviewModalOpen || !!createdOrder;
    if (anyModalOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isReviewModalOpen, createdOrder]);

  // Clear order error on cart modification
  useEffect(() => {
    setOrderError(null);
  }, [cart]);

  // Cart operations
  const addToCart = (mealId: string) => {
    setCart(prev => ({
      ...prev,
      [mealId]: (prev[mealId] || 0) + 1
    }));
  };

  const decrementCart = (mealId: string) => {
    setCart(prev => {
      const next = { ...prev };
      if ((next[mealId] || 0) <= 1) {
        delete next[mealId];
      } else {
        next[mealId] -= 1;
      }
      return next;
    });
  };

  const incrementCart = (mealId: string) => {
    setCart(prev => ({
      ...prev,
      [mealId]: (prev[mealId] || 0) + 1
    }));
  };

  const placeOrder = async () => {
    if (!flightId || !seatNumber || !cabinClass) return;
    setPlacingOrder(true);
    setOrderError(null);
    try {
      const itemsPayload = Object.entries(cart).map(([mealId, qty]) => ({
        meal_id: mealId,
        qty: qty
      }));

      const response = await api.post<any>(
        "/api/v1/orders",
        {
          flight_id: flightId,
          seat_number: seatNumber,
          cabin_class: cabinClass,
          items: itemsPayload,
          priority_factors: priorityFactors
        },
        accessToken || undefined
      );

      const orderData = response.data;
      setCreatedOrder(orderData);
      if (orderData?.id && typeof window !== "undefined") {
        localStorage.setItem("airmeal_last_order_id", orderData.id);
        setLastOrderId(orderData.id);
      }
      setCart({}); // clear cart
      setPriorityFactors([]); // reset priority factors
      setIsReviewModalOpen(false); // close review modal
      setRefreshKey(prev => prev + 1); // refresh stock badges
    } catch (err) {
      console.error("Order placement failed:", err);
      if (err instanceof ApiError) {
        setOrderError(err.detail);
      } else {
        setOrderError("Failed to place your order. Please try again.");
      }
    } finally {
      setPlacingOrder(false);
    }
  };

  const renderCardAction = (mealId: string, isOutOfStock: boolean) => {
    if (isOutOfStock) {
      return (
        <button
          disabled
          className="w-full flex items-center justify-center h-11 px-4 bg-[#0D2137] border border-[rgba(30,136,229,0.05)] text-[#8BAABF] font-medium rounded-lg text-xs cursor-not-allowed select-none"
        >
          Currently Unavailable
        </button>
      );
    }

    const qty = cart[mealId] || 0;
    if (qty > 0) {
      return (
        <div className="flex items-center justify-between w-full h-11 border border-[#1E88E5] rounded-lg overflow-hidden bg-[#0A1929]">
          <button
            onClick={() => decrementCart(mealId)}
            className="w-12 h-full flex items-center justify-center text-[#E8F1FA] hover:bg-[rgba(30,136,229,0.1)] transition-colors text-lg font-bold cursor-pointer"
            style={{ minHeight: "44px", minWidth: "44px" }}
            aria-label="Decrease quantity"
          >
            <Minus className="w-4 h-4" />
          </button>
          <span className="font-bold text-[#E8F1FA] text-sm select-none">{qty}</span>
          <button
            onClick={() => incrementCart(mealId)}
            className="w-12 h-full flex items-center justify-center text-[#E8F1FA] hover:bg-[rgba(30,136,229,0.1)] transition-colors text-lg font-bold cursor-pointer"
            style={{ minHeight: "44px", minWidth: "44px" }}
            aria-label="Increase quantity"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      );
    }

    return (
      <button
        onClick={() => addToCart(mealId)}
        className="w-full flex items-center justify-center h-11 px-4 bg-[#90CAF9] hover:bg-[#64B5F6] border border-[#90CAF9] text-[#0A2F5E] font-medium rounded-lg text-xs transition-colors hover:shadow-md cursor-pointer"
        style={{ minHeight: "44px" }}
      >
        Select Menu Item
      </button>
    );
  };

  if (!flightId) {
    return (
      <div className="max-w-md mx-auto p-6 text-center">
        <div className="glass-card p-8 flex flex-col items-center">
          <AlertCircle className="w-12 h-12 text-[#FF6B35] mb-4" />
          <h1 className="text-xl font-bold text-[#E8F1FA] mb-2">No Active Flight Session</h1>
          <p className="text-sm text-[#8BAABF] mb-6 leading-relaxed">
            Scan a seat QR code or sign in with your PNR and seat information to view the inflight dining catalog.
          </p>
          <Link
            href="/passenger"
            className="w-full flex items-center justify-center h-11 bg-[#90CAF9] hover:bg-[#64B5F6] text-[#0A2F5E] font-medium rounded-lg transition-colors text-sm"
          >
            Enter Flight Info
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 min-h-[50vh]">
        <Loader2 className="w-8 h-8 text-[#1E88E5] animate-spin mb-4" />
        <p className="text-sm text-[#8BAABF]">Loading onboard dining catalog...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto p-6 text-center">
        <div className="glass-card p-8 flex flex-col items-center">
          <AlertCircle className="w-12 h-12 text-[#EF5350] mb-4" />
          <h1 className="text-xl font-bold text-[#E8F1FA] mb-2">Failed to Load Menu</h1>
          <p className="text-sm text-[#8BAABF] mb-6 leading-relaxed">
            {error}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="w-full h-11 bg-[#90CAF9] hover:bg-[#64B5F6] text-[#0A2F5E] font-medium rounded-lg transition-colors text-sm"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // 1. Identify active allergens in user profile
  const activeAllergens = Object.keys(allergyFlags).filter(k => allergyFlags[k]);

  // 2. Perform Allergen Safety Filtering
  const safeMenuItems: MealItemResponse[] = [];
  const hiddenMenuItems: { meal: MealItemResponse; conflictingAllergens: string[] }[] = [];
  for (const meal of menuItems) {
    const mealAllergens = meal.allergen_flags || {};
    const conflicts = activeAllergens.filter(a => mealAllergens[a]);
    if (conflicts.length > 0) {
      hiddenMenuItems.push({ meal, conflictingAllergens: conflicts });
    } else {
      safeMenuItems.push(meal);
    }
  }
  const allergenHiddenCount = hiddenMenuItems.length;

  // 3. Category & Dietary Filters
  const CATEGORY_ORDER = ["Snacks", "Starters", "Main Course", "Beverages", "Alcohol", "Desserts"];
  const presentCategories = new Set(safeMenuItems.map(m => mealCategory(m)));
  const categoriesList = ["All", ...CATEGORY_ORDER.filter(c => presentCategories.has(c))];
  
  const dietFilters = [
    { key: "All", label: "All Dietaries" },
    { key: "vegetarian", label: "Vegetarian" },
    { key: "non_vegetarian", label: "Non-vegetarian" },
    { key: "halal", label: "Halal" },
    { key: "gluten_free", label: "Gluten Free" },
    { key: "low_calorie", label: "Low Calorie" },
    { key: "jain", label: "Jain" },
  ];

  const filteredItems = safeMenuItems.filter(meal => {
    // Search filter
    if (searchQuery && !meal.name.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    // Category filter
    if (selectedCategory !== "All" && mealCategory(meal) !== selectedCategory) {
      return false;
    }
    // Dietary filter
    if (selectedDiet !== "All") {
      const flags = meal.dietary_flags || {};
      if (selectedDiet === "non_vegetarian") {
        if (flags["vegetarian"]) return false; // exclude vegetarian meals
      } else {
        if (!flags[selectedDiet]) return false;
      }
    }
    return true;
  });

  // Order the menu by category: Snacks → Starters → Main Course → Beverages → Alcohol → Desserts.
  // Stable within each category (preserves prior order for equal keys).
  const _catRank = (m: MealItemResponse) => {
    const idx = CATEGORY_ORDER.indexOf(mealCategory(m));
    return idx === -1 ? CATEGORY_ORDER.length : idx; // unknown categories last
  };
  filteredItems.sort((a, b) => _catRank(a) - _catRank(b));

  const cartItems = Object.entries(cart).map(([mealId, qty]) => {
    const meal = menuItems.find(m => m.id === mealId);
    return { mealId, qty, meal };
  });

  const visibleHiddenItems = hiddenMenuItems.filter(({ meal }) =>
    selectedCategory === "All" ||
    mealCategory(meal) === selectedCategory
  );

  return (
    <div className="relative min-h-screen w-full flex flex-col items-center py-6 px-4 font-sans text-[#E8F1FA]">
      <div className={`w-full max-w-4xl z-10 flex flex-col ${totalCartCount > 0 ? "pb-28" : ""}`}>
      
      {/* Back button and Active seat details header */}
      <div className="flex items-center justify-between mb-6 pt-4">
        <Link href="/passenger" className="flex items-center gap-1 text-sm text-[#8BAABF] hover:text-[#E8F1FA] transition-colors">
          <ChevronLeft className="w-4 h-4" />
          <span>Home</span>
        </Link>
        {seatNumber && (
          <div className="flex items-center gap-2 bg-[#0A1929] border border-[rgba(30,136,229,0.15)] rounded-full px-3 py-1 text-xs">
            <Armchair className="w-3.5 h-3.5 text-[#FF6B35]" />
            <span className="font-semibold">{seatNumber} · <span className="capitalize">{cabinClass}</span></span>
          </div>
        )}
      </div>

      {/* Main Title & Allergen Alert */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-3 mb-2">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Inflight Dining Menu</h1>
          {lastOrderId && (
            <button
              onClick={() => router.push(`/passenger/tracking?order_id=${lastOrderId}&flight_id=${flightId}`)}
              className="flex-shrink-0 flex items-center gap-1.5 h-9 px-4 bg-[#FFB74D] hover:bg-[#FFA726] text-[#7C4A03] font-bold rounded-lg transition-colors text-xs cursor-pointer"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>Track Order</span>
            </button>
          )}
        </div>
        <p className="text-sm text-[#8BAABF]">Browse and filter meals available on your flight.</p>

        {allergenHiddenCount > 0 && (
          <div className="mt-4 flex items-start gap-3 bg-[rgba(198,40,40,0.15)] border border-[rgba(198,40,40,0.3)] rounded-lg p-3 text-xs text-[#EF5350]">
            <ShieldCheck className="w-5 h-5 flex-shrink-0" />
            <div>
              <span className="font-bold">{allergenHiddenCount} items hidden</span> automatically based on your allergy profile (allergy flags: {activeAllergens.join(", ")}).
            </div>
          </div>
        )}

        {visibleHiddenItems.length > 0 && (
          <button
            onClick={() => document.getElementById("flagged-items")?.scrollIntoView({ behavior: "smooth" })}
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[#EF5350] bg-[rgba(198,40,40,0.1)] border border-[rgba(198,40,40,0.3)] hover:bg-[rgba(198,40,40,0.18)] rounded-lg px-3 py-2 transition-colors cursor-pointer"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            View {visibleHiddenItems.length} flagged item{visibleHiddenItems.length > 1 ? "s" : ""}
          </button>
        )}
      </div>

      {/* Recommendations loading skeleton */}
      {recLoading && recommendations.length === 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-5 h-5 text-[#FF6B35]" />
            <span className="text-lg font-bold text-[#E8F1FA]">Recommended for You</span>
          </div>
          <div className="flex gap-4 overflow-hidden">
            {[0, 1, 2].map(i => (
              <div
                key={i}
                className="w-[280px] sm:w-[320px] flex-shrink-0 bg-[#0A1929] border border-[rgba(30,136,229,0.15)] rounded-xl p-4 animate-pulse"
              >
                <div className="h-4 bg-[rgba(30,136,229,0.15)] rounded w-2/3 mb-3"></div>
                <div className="h-3 bg-[rgba(30,136,229,0.10)] rounded w-1/2 mb-4"></div>
                <div className="h-9 bg-[rgba(30,136,229,0.10)] rounded w-full"></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations Carousel */}
      {recommendations.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-bold text-[#E8F1FA] mb-3 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#FF6B35]" />
            <span>Recommended for You</span>
          </h2>
          {(() => {
            // Category chips derived from the recommendations present.
            const recCats = Array.from(new Set(recommendations.map(r => {
              const mi = menuItems.find(m => m.id === r.meal_id);
              return (mi ? mealCategory(mi) : null) || "Other";
            })));
            const recChips = ["All", ...recCats];
            const visibleRecs = recommendations.filter(r => {
              if (selectedRecCategory === "All") return true;
              const mi = menuItems.find(m => m.id === r.meal_id);
              return ((mi ? mealCategory(mi) : null) || "Other") === selectedRecCategory;
            });
            return (
              <>
                <div className="flex gap-2 overflow-x-auto pb-3 scrollbar-none -mx-4 px-4 sm:mx-0 sm:px-0">
                  {recChips.map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedRecCategory(cat)}
                      className={`flex-shrink-0 px-3 h-8 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                        selectedRecCategory === cat
                          ? "bg-[#90CAF9] text-[#0A2F5E]"
                          : "bg-[var(--color-surface)] text-[var(--color-text-secondary)] border border-[var(--color-border)] hover:border-[#64B5F6]"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
                <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-none whitespace-nowrap -mx-4 px-4 sm:mx-0 sm:px-0">
                  {visibleRecs.map(rec => {
                    const menuItem = menuItems.find(m => m.id === rec.meal_id);
                    const recCategory = menuItem ? mealCategory(menuItem) : null;
                    const isOutOfStock = menuItem ? (menuItem.current_stock === 0 || menuItem.current_stock === null) : false;
                    return (
                <div
                  key={rec.meal_id}
                  className="flex w-[280px] flex-shrink-0 flex-col justify-between overflow-hidden whitespace-normal rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-card)] transition-all duration-300 hover:-translate-y-1 hover:border-[var(--color-primary)] hover:shadow-[0_8px_30px_rgba(255,107,53,0.15)] sm:w-[320px]"
                >
                  <div>
                    {/* Header strip with match score */}
                    <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[linear-gradient(135deg,rgba(255,107,53,0.10),rgba(30,136,229,0.08))] px-4 py-3">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
                        <Sparkles className="h-3.5 w-3.5 text-[var(--color-accent)]" />
                        <span>Recommended</span>
                      </div>
                      <span className="rounded-[var(--radius-pill)] bg-[var(--color-primary)]/15 px-2.5 py-0.5 text-[11px] font-bold text-[var(--color-primary-hover)]">
                        {Math.round(rec.score * 100)}% Match
                      </span>
                    </div>

                    <div className="p-4">
                      <h3 className="mb-2 text-sm font-bold leading-snug text-[var(--color-text-primary)] line-clamp-2">
                        {rec.name}
                      </h3>

                      <div className="mb-3 flex flex-wrap items-center gap-1.5">
                        <span className="text-[9px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                          {rec.meal_code}
                        </span>
                        {recCategory && (
                          <span className="rounded-[var(--radius-pill)] bg-[var(--color-accent)]/12 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--color-accent)]">
                            {recCategory}
                          </span>
                        )}
                        {rec.calories !== null && (
                          <span className="flex items-center gap-0.5 text-[10px] text-[var(--color-text-secondary)]">
                            <Flame className="h-3 w-3 text-[var(--color-accent)]" />
                            {rec.calories} kcal
                          </span>
                        )}
                      </div>

                      {rec.waste_boosted && (
                        <div
                          className="mb-3 inline-flex items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--color-success)]/12 px-2 py-1 text-[10px] font-semibold text-[var(--color-success-light)]"
                          title="Surfaced partly to reduce predicted food waste on this flight"
                        >
                          <span>♻</span> Helps reduce waste
                        </div>
                      )}

                      <div className="text-xs">
                        <button
                          onClick={() => setExpandedRecId(prev => prev === rec.meal_id ? null : rec.meal_id)}
                          className="flex h-8 items-center gap-1 text-[11px] font-semibold text-[var(--color-primary)] hover:text-[var(--color-primary-hover)] focus:outline-none cursor-pointer"
                        >
                          <span>Why recommended?</span>
                          <ChevronRight className={`h-3.5 w-3.5 transition-transform ${expandedRecId === rec.meal_id ? "rotate-90" : ""}`} />
                        </button>
                        {expandedRecId === rec.meal_id && (
                          <div className="mt-1.5 whitespace-normal rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-[11px] leading-relaxed text-[var(--color-text-secondary)]">
                            {rec.why}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-[var(--color-border)] p-4 pt-3">
                    {renderCardAction(rec.meal_id, isOutOfStock)}
                  </div>
                </div>
              );
                  })}
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* Search and Filters panel */}
      <div className="space-y-4 mb-6">
        {/* Search bar */}
        <SearchBar
          value={searchQuery}
          onValueChange={setSearchQuery}
          placeholder="Search meals, drinks, desserts…"
        />

        {/* Categories row - Horizontally Scrollable on Mobile */}
        <div className="relative">
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none whitespace-nowrap -mx-4 px-4 sm:mx-0 sm:px-0">
            {categoriesList.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`h-9 px-4 rounded-full text-xs font-semibold tracking-wide border transition-all select-none cursor-pointer ${
                  selectedCategory === cat
                    ? "shadow-sm"
                    : "bg-transparent border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                }`}
                style={categoryChipStyle(cat, selectedCategory === cat)}
              >
                {cat === "All" ? "All Items" : cat}
              </button>
            ))}
          </div>
        </div>

        {/* Dietary Pills row - Horizontally Scrollable on Mobile */}
        <div className="relative">
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none whitespace-nowrap -mx-4 px-4 sm:mx-0 sm:px-0">
            {dietFilters.map(diet => (
              <button
                key={diet.key}
                onClick={() => setSelectedDiet(diet.key)}
                className={`h-8 px-3.5 rounded-full text-xs font-medium border transition-all select-none cursor-pointer ${
                  selectedDiet === diet.key
                    ? "shadow-sm"
                    : "bg-transparent border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                }`}
                style={dietChipStyle(selectedDiet === diet.key)}
              >
                {diet.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Meals Grid */}
      {filteredItems.length === 0 ? (
        <div className="text-center py-16 bg-[#0A1929] border border-[rgba(30,136,229,0.1)] rounded-lg p-8">
          <Filter className="w-10 h-10 text-[#8BAABF] mx-auto mb-3" />
          <h2 className="text-[#E8F1FA] text-lg font-bold mb-1">No items match your criteria</h2>
          <p className="text-sm text-[#8BAABF]">Try relaxing your search query or dining filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filteredItems.map(meal => {
            const isOutOfStock = meal.current_stock === 0 || meal.current_stock === null;
            const isLowStock = meal.current_stock !== null && meal.current_stock > 0 && meal.current_stock <= 3;
            
            // Format allergens display
            const mealAllergens = meal.allergen_flags
              ? Object.keys(meal.allergen_flags).filter(k => meal.allergen_flags?.[k])
              : [];

            return (
              <div
                key={meal.id}
                className={`group flex flex-col justify-between overflow-hidden rounded-[var(--radius)] border transition-all duration-200 ${
                  isOutOfStock
                    ? "border-[var(--color-error)]/15 bg-[var(--color-card)]/40 opacity-70"
                    : "border-[var(--color-border)] bg-[var(--color-card)] hover:-translate-y-1 hover:border-white/20 hover:shadow-[0_8px_30px_rgba(30,136,229,0.15)]"
                }`}
              >
                <div>
                  {/* Accent header strip (image-free design) */}
                  <div className="relative flex items-center justify-between border-b border-[var(--color-border)] bg-[linear-gradient(135deg,rgba(30,136,229,0.12),rgba(10,47,94,0.12))] px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-primary)]/15 text-[var(--color-primary-hover)]">
                        <ShoppingBag className="h-4 w-4" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
                          {mealCategory(meal)}
                        </span>
                        <span className="text-[10px] font-semibold text-[var(--color-text-muted)]">
                          {meal.meal_code}
                        </span>
                      </div>
                    </div>
                    <div className="select-none">
                      {isOutOfStock ? (
                        <span className="rounded-[var(--radius-pill)] bg-[var(--color-error)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-[var(--shadow-xs)]">
                          Sold Out
                        </span>
                      ) : isLowStock ? (
                        <span className="animate-pulse rounded-[var(--radius-pill)] bg-[var(--color-warning)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-[var(--shadow-xs)]">
                          Low Stock: {meal.current_stock}
                        </span>
                      ) : (
                        <span className="rounded-[var(--radius-pill)] bg-[var(--color-success)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-[var(--shadow-xs)]">
                          In Stock
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Card content */}
                  <div className="p-4">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <h3 className="text-base font-bold leading-snug text-[var(--color-text-primary)] line-clamp-2">
                        {meal.name}
                      </h3>
                      {meal.calories !== null && (
                        <div className="flex flex-shrink-0 items-center gap-0.5 text-xs font-medium text-[var(--color-text-secondary)]">
                          <Flame className="h-3.5 w-3.5 text-[var(--color-accent)]" />
                          <span>{meal.calories} kcal</span>
                        </div>
                      )}
                    </div>

                    {mealAllergens.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {mealAllergens.map(allergen => (
                          <span
                            key={allergen}
                            className="rounded-[var(--radius-xs)] border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-[var(--color-text-secondary)]"
                          >
                            {allergen}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-[var(--radius-xs)] bg-[var(--color-success)]/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[var(--color-success-light)]">
                        <Check className="h-2.5 w-2.5" /> Allergen Free
                      </span>
                    )}
                  </div>
                </div>

                {/* Bottom button section */}
                <div className="p-4 pt-0 border-t border-[rgba(30,136,229,0.05)] mt-2">
                  {renderCardAction(meal.id, isOutOfStock)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Hidden for your safety section */}
      {visibleHiddenItems.length > 0 && (
        <div id="flagged-items" className="mt-12 space-y-6">
          <div className="border-b border-[rgba(198,40,40,0.2)] pb-4">
            <h2 className="text-lg font-bold text-[#EF5350] flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-[#EF5350]" />
              <span>Hidden for your safety ({visibleHiddenItems.length})</span>
            </h2>
            <p className="text-xs text-[#8BAABF] mt-1">
              These meals contain ingredients that conflict with your allergy profile, so they can't be ordered.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {visibleHiddenItems.map(({ meal, conflictingAllergens }) => {
              const mealAllergens = meal.allergen_flags
                ? Object.keys(meal.allergen_flags).filter(k => meal.allergen_flags?.[k])
                : [];

              return (
                <div
                  key={meal.id}
                  className="flex flex-col overflow-hidden rounded-[var(--radius)] border border-[var(--color-error)]/30 bg-[var(--color-error)]/5 opacity-90"
                >
                  {/* Red accent header strip */}
                  <div className="flex items-center justify-between border-b border-[var(--color-error)]/20 bg-[linear-gradient(135deg,rgba(198,40,40,0.14),rgba(198,40,40,0.06))] px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-error)]/15 text-[var(--color-error-light)]">
                        <AlertTriangle className="h-4 w-4" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
                          {mealCategory(meal)}
                        </span>
                        <span className="text-[10px] font-semibold text-[var(--color-text-muted)]">
                          {meal.meal_code}
                        </span>
                      </div>
                    </div>
                    <span className="rounded-[var(--radius-pill)] bg-[var(--color-error)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-[var(--shadow-xs)]">
                      Blocked
                    </span>
                  </div>

                  {/* Content */}
                  <div className="space-y-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-base font-bold leading-snug text-[var(--color-text-primary)] line-clamp-2">
                        {meal.name}
                      </h3>
                      {meal.calories !== null && (
                        <div className="flex flex-shrink-0 items-center gap-0.5 text-xs font-medium text-[var(--color-text-secondary)]">
                          <Flame className="h-3.5 w-3.5 text-[var(--color-accent)]" />
                          <span>{meal.calories} kcal</span>
                        </div>
                      )}
                    </div>

                    <div className="rounded-[var(--radius-sm)] border border-[var(--color-error)]/25 bg-[var(--color-error)]/10 p-2.5 text-xs text-[var(--color-error-light)]">
                      <span className="mb-0.5 block text-[9px] font-bold uppercase tracking-wider">
                        Unavailable — allergy conflict
                      </span>
                      <span>Contains: {conflictingAllergens.join(", ")}</span>
                    </div>

                    {mealAllergens.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {mealAllergens.map(allergen => (
                          <span
                            key={allergen}
                            className="rounded-[var(--radius-xs)] border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-[var(--color-text-secondary)]"
                          >
                            {allergen}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Sticky Bottom Cart Summary */}
      {totalCartCount > 0 && !isReviewModalOpen && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-[var(--color-card)] backdrop-blur-md border-t-2 border-[#1E88E5] p-4 shadow-2xl">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-[var(--color-text)]">
              <div className="bg-[#1E88E5] text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shadow-md animate-pulse">
                {totalCartCount}
              </div>
              <span className="font-semibold text-sm">Items Selected</span>
            </div>
            <button
              onClick={() => setIsReviewModalOpen(true)}
              className="h-11 px-6 bg-[#FF6B35] hover:bg-[#FF8A5E] text-white font-bold text-sm rounded-lg flex items-center gap-2 transition-colors shadow-lg cursor-pointer"
              style={{ minHeight: "44px" }}
            >
              <ShoppingBag className="w-4 h-4" />
              <span>Review Order</span>
            </button>
          </div>
        </div>
      )}

      {/* Review Order Allergen Safety Modal */}
      {isReviewModalOpen && (
        <div className="fixed inset-0 z-50 bg-[rgba(5,15,30,0.55)] backdrop-blur-[2px] flex items-center justify-center p-4">
          <div
            className="w-full max-w-md bg-[#0A1929] rounded-xl shadow-2xl p-6 relative flex flex-col justify-between max-h-[90vh] text-[#E8F1FA] transition-all duration-300"
            style={{
              border: "1px solid rgba(30,136,229,0.3)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(30,136,229,0.1) inset",
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget as HTMLDivElement;
              el.style.border = "1px solid rgba(30,136,229,0.55)";
              el.style.boxShadow = "0 20px 50px rgba(30,136,229,0.18), 0 0 0 1px rgba(30,136,229,0.15) inset";
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLDivElement;
              el.style.border = "1px solid rgba(30,136,229,0.3)";
              el.style.boxShadow = "0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(30,136,229,0.1) inset";
            }}
          >
            
            {/* Header section (fixed at top) */}
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
              <h3 className="text-lg font-bold">Review Your Order</h3>
              <button
                onClick={() => {
                  setIsReviewModalOpen(false);
                  setOrderError(null);
                }}
                className="text-[#8BAABF] hover:text-[#E8F1FA] transition-colors p-1 cursor-pointer"
                style={{ minWidth: "44px", minHeight: "44px" }}
                aria-label="Close modal"
              >
                <X className="w-5 h-5 mx-auto" />
              </button>
            </div>

            {/* Scrollable body container (everything in the middle scrolls together) */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1 mb-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              {/* Allergen Policy Notice */}
              <div className="bg-[rgba(30,136,229,0.05)] border border-[rgba(30,136,229,0.15)] rounded-lg p-3 text-xs text-[#8BAABF] space-y-1">
                <div className="flex items-center gap-1.5 text-[#E8F1FA] font-semibold">
                  <ShieldCheck className="w-4 h-4 text-[#1E88E5]" />
                  <span>Allergen Safety Check</span>
                </div>
                <p>
                  Our system verifies your order against your active allergy profile. Allergen-conflicting items are strictly blocked for your safety.
                </p>
                {activeAllergens.length > 0 ? (
                  <p className="mt-1 font-medium text-[#FF6B35]">
                    Your allergy flags: {activeAllergens.join(", ")}
                  </p>
                ) : (
                  <p className="mt-1 italic text-[#8BAABF]">No allergy flags set on your profile.</p>
                )}
              </div>

              {/* Dynamic Error Handling */}
              {orderError && orderError.startsWith("Allergen conflict") && (
                <div className="bg-[rgba(198,40,40,0.15)] border border-[#EF5350] rounded-lg p-3 text-xs text-[#EF5350] font-medium flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                  <div>
                    <p className="font-bold text-sm mb-0.5">Safety Stop</p>
                    <p>{orderError}</p>
                    <p className="mt-1 text-[#8BAABF]">This item cannot be ordered. Please remove it from your cart.</p>
                  </div>
                </div>
              )}

              {orderError && !orderError.startsWith("Allergen conflict") && (
                <div className="bg-[rgba(245,124,0,0.15)] border border-[#F57C00] rounded-lg p-3 text-xs text-[#F57C00] font-medium flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                  <div>
                    <p className="font-bold text-sm mb-0.5">Out of Stock or Request Error</p>
                    <p>{orderError}</p>
                    {orderError.toLowerCase().includes("out of stock") && (
                      <p className="mt-1 text-[#8BAABF]">Please adjust quantities or remove unavailable items to proceed.</p>
                    )}
                  </div>
                </div>
              )}

              {/* Cart List */}
              <div className="space-y-3">
                {cartItems.map(({ mealId, qty, meal }) => {
                  if (!meal) return null;
                  return (
                    <div
                      key={mealId}
                      className="flex items-center justify-between bg-[#050F1E] border border-[rgba(30,136,229,0.1)] rounded-lg p-3 gap-4"
                    >
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-[#E8F1FA] truncate">{meal.name}</p>
                        <p className="text-[10px] text-[#8BAABF] font-semibold">{meal.meal_code}</p>
                      </div>
                      
                      {/* Quantity Selector inside modal */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => decrementCart(mealId)}
                          className="w-8 h-8 rounded bg-[rgba(30,136,229,0.1)] hover:bg-[rgba(30,136,229,0.2)] text-[#E8F1FA] flex items-center justify-center font-bold text-sm cursor-pointer"
                          style={{ minHeight: "44px", minWidth: "44px" }}
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="font-bold text-sm w-4 text-center">{qty}</span>
                        <button
                          onClick={() => incrementCart(mealId)}
                          className="w-8 h-8 rounded bg-[rgba(30,136,229,0.1)] hover:bg-[rgba(30,136,229,0.2)] text-[#E8F1FA] flex items-center justify-center font-bold text-sm cursor-pointer"
                          style={{ minHeight: "44px", minWidth: "44px" }}
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Priority Needs Checkboxes */}
              <div className="p-3 bg-[#0A1929] border border-[rgba(30,136,229,0.15)] rounded-lg">
                <div className="text-[11px] font-bold text-[#8BAABF] uppercase tracking-wider mb-2">Priority needs (optional)</div>
                <div className="flex flex-col gap-2">
                  {[
                    { key: "medical", label: "Medical dietary need" },
                    { key: "infant", label: "Travelling with an infant" },
                    { key: "connecting", label: "Tight connecting flight" },
                  ].map(opt => {
                    const isSelected = priorityFactors.includes(opt.key);
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => togglePriority(opt.key)}
                        className="flex items-center gap-2 text-left text-xs px-3 h-9 rounded-lg transition-all duration-200 cursor-pointer"
                        style={{
                          border: isSelected ? "1px solid #1E88E5" : "1px solid rgba(30,136,229,0.25)",
                          background: isSelected ? "rgba(30,136,229,0.12)" : "transparent",
                          color: isSelected ? "#1E88E5" : "#8BAABF",
                          boxShadow: isSelected ? "0 4px 14px rgba(30,136,229,0.12)" : "none",
                          transform: "translateY(0)",
                        }}
                        onMouseEnter={(e) => {
                          const el = e.currentTarget as HTMLButtonElement;
                          el.style.transform = "translateY(-2px)";
                          el.style.border = "1px solid rgba(30,136,229,0.6)";
                          el.style.boxShadow = "0 6px 20px rgba(30,136,229,0.18)";
                          el.style.color = "#0A2F5E";
                        }}
                        onMouseLeave={(e) => {
                          const el = e.currentTarget as HTMLButtonElement;
                          el.style.transform = "translateY(0)";
                          el.style.border = isSelected ? "1px solid #1E88E5" : "1px solid rgba(30,136,229,0.25)";
                          el.style.boxShadow = isSelected ? "0 4px 14px rgba(30,136,229,0.12)" : "none";
                          el.style.color = isSelected ? "#1E88E5" : "#8BAABF";
                        }}
                      >
                        <span
                          className="w-4 h-4 rounded border flex items-center justify-center flex-shrink-0"
                          style={{
                            background: isSelected ? "#1E88E5" : "transparent",
                            borderColor: isSelected ? "#1E88E5" : "#5C7E97",
                          }}
                        >
                          {isSelected && <Check className="w-3 h-3 text-white" />}
                        </span>
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-[#5C7E97] mt-2">Crew prioritize these orders for faster service.</p>
              </div>
            </div>

            {/* Footer action buttons (fixed at bottom) */}
            <div className="flex gap-3 border-t border-[rgba(30,136,229,0.1)] pt-4 flex-shrink-0">
              <button
                onClick={() => {
                  setIsReviewModalOpen(false);
                  setOrderError(null);
                }}
                disabled={placingOrder}
                className="flex-1 h-11 border border-[rgba(30,136,229,0.2)] text-[#E8F1FA] hover:bg-[rgba(30,136,229,0.05)] rounded-lg text-sm font-semibold transition-colors cursor-pointer"
                style={{ minHeight: "44px" }}
              >
                Cancel
              </button>
              <button
                onClick={placeOrder}
                disabled={placingOrder || totalCartCount === 0 || (orderError !== null && orderError.startsWith("Allergen conflict"))}
                className={`flex-1 h-11 rounded-lg text-sm font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                  (orderError !== null && orderError.startsWith("Allergen conflict"))
                    ? "bg-[#0A2F5E] text-[#8BAABF] border-[rgba(30,136,229,0.2)] cursor-not-allowed"
                    : "bg-[#90CAF9] hover:bg-[#64B5F6] text-[#0A2F5E]"
                }`}
                style={{ minHeight: "44px" }}
              >
                {placingOrder ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Placing...</span>
                  </>
                ) : (
                  <span>Confirm Order</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Static Order Confirmation Screen */}
      {createdOrder && (
        <div className="fixed inset-0 z-50 bg-[rgba(5,15,30,0.55)] backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#0A1929] border border-green-500/30 rounded-xl shadow-2xl p-8 text-center flex flex-col items-center text-[#E8F1FA] transition-all duration-300 hover:-translate-y-1 hover:border-green-500/50 hover:shadow-[0_20px_50px_rgba(76,175,80,0.2)]">
            <div className="w-16 h-16 rounded-full bg-[rgba(46,125,50,0.1)] border border-[rgba(46,125,50,0.2)] flex items-center justify-center mb-6">
              <CheckCircle className="w-10 h-10 text-[#4CAF50] animate-pulse" />
            </div>
            <h1 className="text-2xl font-bold mb-2">Order Confirmed!</h1>
            <p className="text-sm text-[#8BAABF] mb-6">Your order has been received by the cabin crew.</p>
            
            <div className="w-full bg-[#050F1E] border border-[rgba(30,136,229,0.1)] rounded-lg p-4 mb-6 text-left space-y-2">
              <div className="flex justify-between text-xs text-[#8BAABF]">
                <span>Order ID:</span>
                <span className="font-semibold text-[#E8F1FA] select-all">{createdOrder.id}</span>
              </div>
              <div className="flex justify-between text-xs text-[#8BAABF]">
                <span>Status:</span>
                <span className="font-bold text-[#4CAF50] uppercase tracking-wider">{createdOrder.status}</span>
              </div>
              <div className="flex justify-between text-xs text-[#8BAABF]">
                <span>Seat:</span>
                <span className="font-semibold text-[#E8F1FA]">{createdOrder.seat_number}</span>
              </div>
            </div>

            <div className="flex flex-col gap-2 w-full mt-4">
              <button
                onClick={() => {
                  router.push(`/passenger/tracking?order_id=${createdOrder.id}&flight_id=${flightId}`);
                }}
                className="w-full h-11 bg-[#FFB74D] hover:bg-[#FFA726] text-[#7C4A03] font-bold rounded-lg transition-colors text-sm cursor-pointer flex items-center justify-center gap-1.5"
                style={{ minHeight: "44px" }}
              >
                <ShoppingBag className="w-4 h-4" />
                <span>Track Order</span>
              </button>
              <button
                onClick={() => setCreatedOrder(null)}
                className="w-full h-11 bg-[#90CAF9] hover:bg-[#64B5F6] border border-[#90CAF9] text-[#0A2F5E] font-medium rounded-lg transition-colors text-sm cursor-pointer"
                style={{ minHeight: "44px" }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      </div>
    </div>
  );
}

export default function MenuPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center justify-center p-12 min-h-[50vh]">
          <Loader2 className="w-8 h-8 text-[#1E88E5] animate-spin mb-4" />
          <p className="text-sm text-[#8BAABF]">Loading menu component...</p>
        </div>
      }
    >
      <MenuBrowser />
    </Suspense>
  );
}

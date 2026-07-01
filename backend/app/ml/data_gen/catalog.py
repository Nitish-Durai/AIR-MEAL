"""Static catalog data for the synthetic data generator.

All constants here are generation parameters — not claimed performance results.
"""

from __future__ import annotations

# ── Allergen / dietary key order (must stay consistent — used in embeddings) ─
ALLERGEN_KEYS = ["nuts", "gluten", "dairy", "eggs", "soy", "shellfish", "sesame", "fish"]
DIETARY_KEYS  = ["vegetarian", "vegan", "halal", "kosher", "gluten_free", "low_calorie", "jain"]
CUISINE_KEYS  = [
    "indian", "japanese", "mediterranean", "continental",
    "middle_eastern", "chinese", "thai", "american",
]

# ── Airlines ─────────────────────────────────────────────────────────────────
AIRLINES: list[dict] = [
    {"name": "SkyVista Airlines",       "code": "SV"},
    {"name": "AirGlobe International",  "code": "AG"},
    {"name": "Pacific Wing Express",    "code": "PW"},
]

# ── Airports (IATA) ───────────────────────────────────────────────────────────
AIRPORTS: list[str] = [
    "LHR", "DXB", "SIN", "JFK", "CDG", "HND", "DEL", "BOM",
    "SYD", "DFW", "ORD", "FRA", "AMS", "ICN", "KUL", "BKK",
    "SFO", "LAX", "DOH", "AUH", "IST", "ATL", "PEK", "ZRH",
]

AIRPORT_COUNTRY: dict[str, str] = {
    "LHR": "UK", "DXB": "UAE", "SIN": "Singapore", "JFK": "USA",
    "CDG": "France", "HND": "Japan", "DEL": "India", "BOM": "India",
    "SYD": "Australia", "DFW": "USA", "ORD": "USA", "FRA": "Germany",
    "AMS": "Netherlands", "ICN": "South Korea", "KUL": "Malaysia", "BKK": "Thailand",
    "SFO": "USA", "LAX": "USA", "DOH": "Qatar", "AUH": "UAE",
    "IST": "Turkey", "ATL": "USA", "PEK": "China", "ZRH": "Switzerland",
}

# ── Aircraft cabin configurations ─────────────────────────────────────────────
#  key → {cabin_class: n_seats}
AIRCRAFT_CONFIGS: dict[str, dict] = {
    "B737-800":   {"first": 0,  "business": 12, "premium_economy": 18, "economy": 132},
    "A320neo":    {"first": 0,  "business": 16, "premium_economy": 20, "economy": 124},
    "B777-300ER": {"first": 8,  "business": 42, "premium_economy": 40, "economy": 164},
    "A380-800":   {"first": 14, "business": 76, "premium_economy": 56, "economy": 364},
}
# Sampling probabilities matching real fleet distributions
AIRCRAFT_WEIGHTS: list[float] = [0.35, 0.35, 0.25, 0.05]

# ── Nationality config ────────────────────────────────────────────────────────
#  weight      — probability of drawing this nationality
#  cuisine_prefs — base preference score (0–1) for each cuisine
NATIONALITY_CONFIG: dict[str, dict] = {
    "Indian":     {"weight": 0.20,
                   "cuisine_prefs": {"indian": 0.90, "middle_eastern": 0.40, "continental": 0.20}},
    "British":    {"weight": 0.12,
                   "cuisine_prefs": {"continental": 0.80, "mediterranean": 0.60,
                                     "indian": 0.30, "american": 0.40}},
    "Chinese":    {"weight": 0.15,
                   "cuisine_prefs": {"chinese": 0.90, "japanese": 0.50, "thai": 0.40}},
    "American":   {"weight": 0.12,
                   "cuisine_prefs": {"american": 0.80, "continental": 0.60, "mediterranean": 0.30}},
    "German":     {"weight": 0.07,
                   "cuisine_prefs": {"continental": 0.80, "mediterranean": 0.50, "american": 0.30}},
    "French":     {"weight": 0.07,
                   "cuisine_prefs": {"mediterranean": 0.80, "continental": 0.70, "american": 0.20}},
    "Japanese":   {"weight": 0.08,
                   "cuisine_prefs": {"japanese": 0.90, "chinese": 0.30, "thai": 0.20}},
    "Emirati":    {"weight": 0.09,
                   "cuisine_prefs": {"middle_eastern": 0.90, "mediterranean": 0.50, "indian": 0.30}},
    "Australian": {"weight": 0.05,
                   "cuisine_prefs": {"continental": 0.60, "mediterranean": 0.50,
                                     "thai": 0.40, "american": 0.40}},
    "Brazilian":  {"weight": 0.05,
                   "cuisine_prefs": {"american": 0.50, "continental": 0.50, "mediterranean": 0.40}},
}

# Dietary flag prevalence by nationality (probability each flag is True)
NATIONALITY_DIETARY: dict[str, dict] = {
    "Indian":     {"vegetarian": 0.35, "vegan": 0.05, "halal": 0.15},
    "British":    {"vegetarian": 0.09, "vegan": 0.04},
    "Chinese":    {"vegetarian": 0.05, "vegan": 0.02},
    "American":   {"vegetarian": 0.08, "vegan": 0.04, "gluten_free": 0.03},
    "German":     {"vegetarian": 0.08, "vegan": 0.03},
    "French":     {"vegetarian": 0.06, "vegan": 0.02},
    "Japanese":   {"vegetarian": 0.04, "vegan": 0.02},
    "Emirati":    {"halal": 0.90,      "vegetarian": 0.05},
    "Australian": {"vegetarian": 0.08, "vegan": 0.04, "gluten_free": 0.02},
    "Brazilian":  {"vegetarian": 0.07, "vegan": 0.03},
}

# Allergy prevalence — applied uniformly across all nationalities
ALLERGY_PREVALENCE: dict[str, float] = {
    "nuts":      0.020,
    "dairy":     0.030,
    "gluten":    0.010,
    "eggs":      0.015,
    "shellfish": 0.010,
    "soy":       0.005,
    "sesame":    0.005,
    "fish":      0.005,
}

# ── FFP tiers, portion prefs, price sensitivity ───────────────────────────────
FFP_TIERS        = ["Bronze", "Silver", "Gold", "Platinum"]
FFP_WEIGHTS      = [0.60, 0.25, 0.12, 0.03]

PORTION_PREFS    = ["small", "medium", "large"]
PORTION_WEIGHTS  = [0.25,   0.55,    0.20  ]

PRICE_LEVELS     = ["budget", "mid", "premium"]
PRICE_WEIGHTS    = [0.30,    0.50,  0.20   ]

# ── Name pools ────────────────────────────────────────────────────────────────
FIRST_NAMES: list[str] = [
    "Liam", "Emma", "Noah", "Olivia", "William", "Ava", "James", "Isabella",
    "Oliver", "Sophia", "Benjamin", "Mia", "Elijah", "Charlotte", "Lucas",
    "Amelia", "Mason", "Harper", "Logan", "Evelyn", "Arjun", "Priya",
    "Rahul", "Ananya", "Vikram", "Wei", "Mei", "Hiroshi", "Yuki",
    "Mohammed", "Fatima", "Ahmed", "Aisha", "Klaus", "Marie", "Pierre",
    "Sophie", "Kenji", "Sakura", "Ravi", "Deepa", "Chen", "Lin",
    "Sarah", "Michael", "David", "Jennifer", "Daniel", "Jessica", "Ryan",
]
LAST_NAMES: list[str] = [
    "Smith", "Johnson", "Brown", "Davis", "Wilson", "Moore", "Taylor",
    "Anderson", "Thomas", "Jackson", "White", "Harris", "Patel", "Kumar",
    "Singh", "Sharma", "Gupta", "Mueller", "Schmidt", "Fischer", "Tanaka",
    "Yamamoto", "Suzuki", "Al-Rashid", "Hassan", "Khan", "Ahmed",
    "Martin", "Bernard", "Dubois", "Nakamura", "Watanabe", "Ito",
    "Chen", "Li", "Wang", "Rodriguez", "Martinez", "Lee", "Walker",
]
CREW_FIRST: list[str] = [
    "Alice", "Bob", "Carol", "David", "Eve", "Frank", "Grace", "Henry",
    "Iris", "Jack", "Karen", "Leo", "Monica", "Nathan", "Olivia", "Paul",
]
CREW_LAST: list[str] = [
    "Adams", "Baker", "Clark", "Dixon", "Evans", "Ford", "Grant", "Hayes",
    "Irving", "Jones", "King", "Lane", "Mills", "Nash", "Owen", "Park",
]

# ── Feedback tags ─────────────────────────────────────────────────────────────
FEEDBACK_TAGS: list[str] = [
    "great-taste", "generous-portion", "hot-food", "quick-delivery",
    "allergen-safe", "fresh-ingredients", "well-presented", "cold-food",
    "small-portion", "slow-delivery", "average-taste", "excellent-value",
    "crispy", "tender", "flavorful", "bland", "perfect-temp", "premium-quality",
]

# ── Meal catalog (61 items) ───────────────────────────────────────────────────
# allergens / dietary use ALLERGEN_KEYS / DIETARY_KEYS ordering.
def _a(**kw) -> dict:
    """Build a complete allergen dict from keyword overrides (default False)."""
    base = {k: False for k in ALLERGEN_KEYS}
    base.update(kw)
    return base

def _d(**kw) -> dict:
    """Build a complete dietary dict from keyword overrides (default False)."""
    base = {k: False for k in DIETARY_KEYS}
    base.update(kw)
    return base

def _meal(code, name, category, cuisine, calories, allergens, dietary, ingredients, alcohol=False):
    """Build a meal dict; alcohol defaults False."""
    return {"code": code, "name": name, "category": category, "cuisine": cuisine,
            "calories": calories, "allergens": allergens, "dietary": dietary,
            "ingredients": ingredients, "alcohol": alcohol}

MEAL_CATALOG: list[dict] = [
    # ── STARTERS (8) ──────────────────────────────────────────────────────────
    {"code": "ST001", "name": "Tomato Bisque",          "category": "Starters",
     "cuisine": "continental",   "calories": 145,
     "allergens": _a(dairy=True),
     "dietary":  _d(vegetarian=True, halal=True, gluten_free=True, low_calorie=True),
     "ingredients": {"tomato": True, "cream": True, "butter": True, "basil": True}},

    {"code": "ST002", "name": "Miso Soup",               "category": "Starters",
     "cuisine": "japanese",      "calories": 40,
     "allergens": _a(soy=True, fish=True),
     "dietary":  _d(halal=True, gluten_free=True, low_calorie=True),
     "ingredients": {"miso_paste": True, "tofu": True, "wakame": True, "dashi": True}},

    {"code": "ST003", "name": "Hummus with Pita",        "category": "Starters",
     "cuisine": "middle_eastern","calories": 280,
     "allergens": _a(gluten=True, sesame=True),
     "dietary":  _d(vegetarian=True, vegan=True, halal=True, kosher=True),
     "ingredients": {"chickpeas": True, "tahini": True, "olive_oil": True, "pita": True}},

    {"code": "ST004", "name": "Chicken Tikka Starter",   "category": "Starters",
     "cuisine": "indian",        "calories": 210,
     "allergens": _a(dairy=True),
     "dietary":  _d(halal=True, gluten_free=True),
     "ingredients": {"chicken": True, "yogurt": True, "spices": True, "lemon": True}},

    {"code": "ST005", "name": "Vegetable Spring Roll",   "category": "Starters",
     "cuisine": "chinese",       "calories": 190,
     "allergens": _a(gluten=True, soy=True, sesame=True),
     "dietary":  _d(vegetarian=True, vegan=True, halal=True),
     "ingredients": {"cabbage": True, "carrot": True, "soy_sauce": True}},

    {"code": "ST006", "name": "Caesar Salad",            "category": "Starters",
     "cuisine": "american",      "calories": 320,
     "allergens": _a(gluten=True, dairy=True, eggs=True, fish=True),
     "dietary":  _d(),
     "ingredients": {"romaine": True, "parmesan": True, "croutons": True, "anchovies": True}},

    {"code": "ST007", "name": "Greek Salad",             "category": "Starters",
     "cuisine": "mediterranean", "calories": 185,
     "allergens": _a(dairy=True),
     "dietary":  _d(vegetarian=True, halal=True, gluten_free=True, low_calorie=True),
     "ingredients": {"tomato": True, "cucumber": True, "feta": True, "olives": True}},

    {"code": "ST008", "name": "Edamame",                 "category": "Starters",
     "cuisine": "japanese",      "calories": 120,
     "allergens": _a(soy=True),
     "dietary":  _d(vegetarian=True, vegan=True, halal=True, kosher=True,
                    gluten_free=True, low_calorie=True, jain=True),
     "ingredients": {"edamame": True, "sea_salt": True}},

    # ── MAIN COURSE (16) ──────────────────────────────────────────────────────
    {"code": "MC001", "name": "Butter Chicken",                   "category": "Main Course",
     "cuisine": "indian",        "calories": 550,
     "allergens": _a(nuts=True, dairy=True),
     "dietary":  _d(halal=True, gluten_free=True),
     "ingredients": {"chicken": True, "butter": True, "cream": True, "cashews": True}},

    {"code": "MC002", "name": "Chicken Biryani",                  "category": "Main Course",
     "cuisine": "indian",        "calories": 650,
     "allergens": _a(nuts=True, dairy=True),
     "dietary":  _d(halal=True, gluten_free=True),
     "ingredients": {"basmati_rice": True, "chicken": True, "yogurt": True, "saffron": True}},

    {"code": "MC003", "name": "Dal Tadka with Rice",              "category": "Main Course",
     "cuisine": "indian",        "calories": 380,
     "allergens": _a(dairy=True),
     "dietary":  _d(vegetarian=True, halal=True, gluten_free=True),
     "ingredients": {"lentils": True, "ghee": True, "tomato": True, "spices": True}},

    {"code": "MC004", "name": "Paneer Tikka Masala",              "category": "Main Course",
     "cuisine": "indian",        "calories": 450,
     "allergens": _a(dairy=True),
     "dietary":  _d(vegetarian=True, halal=True, gluten_free=True),
     "ingredients": {"paneer": True, "cream": True, "tomato": True, "spices": True}},

    {"code": "MC005", "name": "Beef Teriyaki with Steamed Rice",  "category": "Main Course",
     "cuisine": "japanese",      "calories": 520,
     "allergens": _a(gluten=True, soy=True, sesame=True),
     "dietary":  _d(),
     "ingredients": {"beef": True, "teriyaki_sauce": True, "sesame": True, "rice": True}},

    {"code": "MC006", "name": "Salmon Sashimi Plate",             "category": "Main Course",
     "cuisine": "japanese",      "calories": 350,
     "allergens": _a(gluten=True, soy=True, sesame=True, fish=True),
     "dietary":  _d(low_calorie=True),
     "ingredients": {"salmon": True, "soy_sauce": True, "wasabi": True, "ginger": True}},

    {"code": "MC007", "name": "Vegetable Tempura",                "category": "Main Course",
     "cuisine": "japanese",      "calories": 380,
     "allergens": _a(gluten=True, eggs=True, soy=True, sesame=True),
     "dietary":  _d(vegetarian=True, halal=True),
     "ingredients": {"vegetables": True, "tempura_batter": True, "sesame_oil": True}},

    {"code": "MC008", "name": "Pasta Primavera",                  "category": "Main Course",
     "cuisine": "mediterranean", "calories": 420,
     "allergens": _a(gluten=True, dairy=True, eggs=True),
     "dietary":  _d(vegetarian=True, halal=True),
     "ingredients": {"pasta": True, "parmesan": True, "vegetables": True, "herbs": True}},

    {"code": "MC009", "name": "Grilled Mediterranean Chicken",    "category": "Main Course",
     "cuisine": "mediterranean", "calories": 480,
     "allergens": _a(sesame=True),
     "dietary":  _d(halal=True, gluten_free=True),
     "ingredients": {"chicken": True, "lemon": True, "herbs": True, "olive_oil": True}},

    {"code": "MC010", "name": "Lamb Kofta with Couscous",        "category": "Main Course",
     "cuisine": "middle_eastern","calories": 520,
     "allergens": _a(gluten=True, eggs=True, sesame=True),
     "dietary":  _d(halal=True),
     "ingredients": {"lamb": True, "couscous": True, "herbs": True, "spices": True}},

    {"code": "MC011", "name": "Falafel Plate",                    "category": "Main Course",
     "cuisine": "middle_eastern","calories": 400,
     "allergens": _a(gluten=True, sesame=True),
     "dietary":  _d(vegetarian=True, vegan=True, halal=True, kosher=True),
     "ingredients": {"chickpeas": True, "herbs": True, "tahini": True, "pita": True}},

    {"code": "MC012", "name": "Kung Pao Chicken",                 "category": "Main Course",
     "cuisine": "chinese",       "calories": 490,
     "allergens": _a(nuts=True, gluten=True, soy=True, sesame=True),
     "dietary":  _d(),
     "ingredients": {"chicken": True, "peanuts": True, "chili": True, "soy_sauce": True}},

    {"code": "MC013", "name": "Dim Sum Selection",                "category": "Main Course",
     "cuisine": "chinese",       "calories": 380,
     "allergens": _a(gluten=True, eggs=True, soy=True, shellfish=True, sesame=True),
     "dietary":  _d(),
     "ingredients": {"shrimp": True, "pork": True, "soy_sauce": True, "wrapper": True}},

    {"code": "MC014", "name": "Pad Thai",                         "category": "Main Course",
     "cuisine": "thai",          "calories": 480,
     "allergens": _a(nuts=True, gluten=True, eggs=True, soy=True, shellfish=True, fish=True),
     "dietary":  _d(),
     "ingredients": {"rice_noodles": True, "shrimp": True, "peanuts": True,
                     "eggs": True, "fish_sauce": True, "tamarind": True}},

    {"code": "MC015", "name": "Thai Green Curry",                 "category": "Main Course",
     "cuisine": "thai",          "calories": 440,
     "allergens": _a(shellfish=True, fish=True),
     "dietary":  _d(gluten_free=True),
     "ingredients": {"chicken": True, "coconut_milk": True, "green_curry_paste": True,
                     "vegetables": True, "fish_sauce": True}},

    {"code": "MC016", "name": "Classic Beef Burger",              "category": "Main Course",
     "cuisine": "american",      "calories": 680,
     "allergens": _a(gluten=True, dairy=True, eggs=True, sesame=True),
     "dietary":  _d(),
     "ingredients": {"beef_patty": True, "brioche_bun": True, "cheese": True,
                     "lettuce": True, "tomato": True}},

    # ── DESSERTS (8) ──────────────────────────────────────────────────────────
    {"code": "DS001", "name": "Gulab Jamun",                      "category": "Desserts",
     "cuisine": "indian",        "calories": 280,
     "allergens": _a(gluten=True, dairy=True),
     "dietary":  _d(vegetarian=True, halal=True, jain=True),
     "ingredients": {"milk_solids": True, "flour": True, "sugar_syrup": True}},

    {"code": "DS002", "name": "Mango Mousse",                     "category": "Desserts",
     "cuisine": "continental",   "calories": 220,
     "allergens": _a(dairy=True, eggs=True),
     "dietary":  _d(vegetarian=True, halal=True, gluten_free=True),
     "ingredients": {"mango": True, "cream": True, "eggs": True, "sugar": True}},

    {"code": "DS003", "name": "Tiramisu",                         "category": "Desserts",
     "cuisine": "continental",   "calories": 310,
     "allergens": _a(gluten=True, dairy=True, eggs=True),
     "dietary":  _d(vegetarian=True, jain=True),
     "ingredients": {"mascarpone": True, "ladyfingers": True, "espresso": True, "cocoa": True}},

    {"code": "DS004", "name": "Baklava",                          "category": "Desserts",
     "cuisine": "middle_eastern","calories": 350,
     "allergens": _a(nuts=True, gluten=True, dairy=True, sesame=True),
     "dietary":  _d(vegetarian=True, halal=True, jain=True),
     "ingredients": {"phyllo": True, "walnuts": True, "pistachios": True, "honey": True}},

    {"code": "DS005", "name": "Mochi Ice Cream",                  "category": "Desserts",
     "cuisine": "japanese",      "calories": 180,
     "allergens": _a(dairy=True),
     "dietary":  _d(vegetarian=True, halal=True, gluten_free=True, low_calorie=True, jain=True),
     "ingredients": {"mochi_rice": True, "ice_cream": True, "matcha": True}},

    {"code": "DS006", "name": "Fresh Fruit Bowl",                 "category": "Desserts",
     "cuisine": "continental",   "calories": 120,
     "allergens": _a(),
     "dietary":  _d(vegetarian=True, vegan=True, halal=True, kosher=True,
                    gluten_free=True, low_calorie=True, jain=True),
     "ingredients": {"seasonal_fruit": True, "mint": True}},

    {"code": "DS007", "name": "Chocolate Lava Cake",              "category": "Desserts",
     "cuisine": "continental",   "calories": 390,
     "allergens": _a(gluten=True, dairy=True, eggs=True),
     "dietary":  _d(vegetarian=True, halal=True, jain=True),
     "ingredients": {"dark_chocolate": True, "butter": True, "eggs": True, "flour": True}},

    {"code": "DS008", "name": "Panna Cotta with Berry Compote",   "category": "Desserts",
     "cuisine": "continental",   "calories": 240,
     "allergens": _a(dairy=True),
     "dietary":  _d(vegetarian=True, halal=True, gluten_free=True),
     "ingredients": {"cream": True, "gelatin": True, "vanilla": True, "berries": True}},

    # ── BEVERAGES (4) ─────────────────────────────────────────────────────────
    {"code": "BV001", "name": "Masala Chai",                      "category": "Beverages",
     "cuisine": "indian",        "calories": 80,
     "allergens": _a(dairy=True),
     "dietary":  _d(vegetarian=True, halal=True, gluten_free=True, low_calorie=True, jain=True),
     "ingredients": {"tea": True, "milk": True, "spices": True, "sugar": True}},

    {"code": "BV002", "name": "Sencha Green Tea",                 "category": "Beverages",
     "cuisine": "japanese",      "calories": 5,
     "allergens": _a(),
     "dietary":  _d(vegetarian=True, vegan=True, halal=True, kosher=True,
                    gluten_free=True, low_calorie=True, jain=True),
     "ingredients": {"green_tea_leaves": True}},

    {"code": "BV003", "name": "Freshly Squeezed Orange Juice",    "category": "Beverages",
     "cuisine": "continental",   "calories": 110,
     "allergens": _a(),
     "dietary":  _d(vegetarian=True, vegan=True, halal=True, kosher=True,
                    gluten_free=True, low_calorie=True, jain=True),
     "ingredients": {"oranges": True}},

    {"code": "BV004", "name": "Still Mineral Water",              "category": "Beverages",
     "cuisine": "continental",   "calories": 0,
     "allergens": _a(),
     "dietary":  _d(vegetarian=True, vegan=True, halal=True, kosher=True,
                    gluten_free=True, low_calorie=True, jain=True),
     "ingredients": {"water": True}},

    # ── SNACKS (4) ────────────────────────────────────────────────────────────
    {"code": "SN001", "name": "Mixed Nuts & Dried Fruit",         "category": "Snacks",
     "cuisine": "continental",   "calories": 180,
     "allergens": _a(nuts=True),
     "dietary":  _d(vegetarian=True, vegan=True, halal=True, kosher=True, gluten_free=True, jain=True),
     "ingredients": {"almonds": True, "cashews": True, "raisins": True, "cranberries": True}},

    {"code": "SN002", "name": "Sea Salt Pretzels",                "category": "Snacks",
     "cuisine": "american",      "calories": 120,
     "allergens": _a(gluten=True, sesame=True),
     "dietary":  _d(vegetarian=True, vegan=True, halal=True, low_calorie=True, jain=True),
     "ingredients": {"wheat_flour": True, "salt": True, "yeast": True, "sesame": True}},

    {"code": "SN003", "name": "Cheese & Crackers",                "category": "Snacks",
     "cuisine": "continental",   "calories": 220,
     "allergens": _a(gluten=True, dairy=True),
     "dietary":  _d(vegetarian=True, halal=True, jain=True),
     "ingredients": {"assorted_cheese": True, "crackers": True, "grapes": True}},

    {"code": "SN004", "name": "Dried Fruit Mix",                  "category": "Snacks",
     "cuisine": "continental",   "calories": 150,
     "allergens": _a(),
     "dietary":  _d(vegetarian=True, vegan=True, halal=True, kosher=True, gluten_free=True, jain=True),
     "ingredients": {"apricots": True, "figs": True, "dates": True, "raisins": True}},

    # ── NEW SNACKS (6) ──
    {"code": "SN005", "name": "Trail Mix Bar", "category": "Snacks",
     "cuisine": "american", "calories": 220,
     "allergens": _a(gluten=True, nuts=True),
     "dietary": _d(vegetarian=True, halal=True, kosher=True, jain=True),
     "ingredients": {"oats": True, "nuts": True, "honey": True, "dried_fruit": True}},

    {"code": "SN006", "name": "Fresh Fruit Cup", "category": "Snacks",
     "cuisine": "continental", "calories": 90,
     "allergens": _a(),
     "dietary": _d(vegetarian=True, vegan=True, halal=True, kosher=True,
                   gluten_free=True, low_calorie=True, jain=True),
     "ingredients": {"melon": True, "pineapple": True, "grapes": True, "berries": True}},

    {"code": "SN007", "name": "Air-popped Popcorn", "category": "Snacks",
     "cuisine": "american", "calories": 110,
     "allergens": _a(),
     "dietary": _d(vegetarian=True, vegan=True, halal=True, kosher=True,
                   gluten_free=True, low_calorie=True, jain=True),
     "ingredients": {"corn": True, "salt": True}},

    {"code": "SN008", "name": "Hummus & Veg Sticks", "category": "Snacks",
     "cuisine": "mediterranean", "calories": 180,
     "allergens": _a(sesame=True),
     "dietary": _d(vegetarian=True, vegan=True, halal=True, kosher=True,
                   gluten_free=True),
     "ingredients": {"chickpeas": True, "tahini": True, "carrots": True, "celery": True}},

    {"code": "SN009", "name": "Greek Yogurt Parfait", "category": "Snacks",
     "cuisine": "continental", "calories": 200,
     "allergens": _a(dairy=True),
     "dietary": _d(vegetarian=True, halal=True, kosher=True, gluten_free=True, jain=True),
     "ingredients": {"greek_yogurt": True, "honey": True, "granola": True, "berries": True}},

    {"code": "SN010", "name": "Spiced Chickpea Crunch", "category": "Snacks",
     "cuisine": "indian", "calories": 160,
     "allergens": _a(gluten=True),
     "dietary": _d(vegetarian=True, vegan=True, halal=True, kosher=True),
     "ingredients": {"chickpeas": True, "spices": True, "salt": True}},

    # ── NEW DESSERTS (4) ──
    {"code": "DS009", "name": "New York Cheesecake", "category": "Desserts",
     "cuisine": "american", "calories": 400,
     "allergens": _a(gluten=True, dairy=True, eggs=True),
     "dietary": _d(vegetarian=True, halal=True, jain=True),
     "ingredients": {"cream_cheese": True, "graham_crust": True, "eggs": True}},

    {"code": "DS010", "name": "Crème Brûlée", "category": "Desserts",
     "cuisine": "continental", "calories": 330,
     "allergens": _a(dairy=True, eggs=True),
     "dietary": _d(vegetarian=True, halal=True, gluten_free=True),
     "ingredients": {"cream": True, "egg_yolk": True, "vanilla": True, "caramel": True}},

    {"code": "DS011", "name": "Fruit Sorbet", "category": "Desserts",
     "cuisine": "continental", "calories": 130,
     "allergens": _a(),
     "dietary": _d(vegetarian=True, vegan=True, halal=True, kosher=True,
                   gluten_free=True, low_calorie=True, jain=True),
     "ingredients": {"fruit_puree": True, "sugar": True, "water": True}},

    {"code": "DS012", "name": "Apple Pie", "category": "Desserts",
     "cuisine": "american", "calories": 360,
     "allergens": _a(gluten=True, dairy=True, eggs=True),
     "dietary": _d(vegetarian=True, halal=True, jain=True),
     "ingredients": {"apples": True, "pastry": True, "cinnamon": True, "butter": True}},

    # ── NEW BEVERAGES (6, incl. sodas) ──
    {"code": "BV005", "name": "Coca-Cola", "category": "Beverages",
     "cuisine": "american", "calories": 140,
     "allergens": _a(),
     "dietary": _d(vegetarian=True, vegan=True, halal=True, kosher=True, gluten_free=True, jain=True),
     "ingredients": {"carbonated_water": True, "sugar": True, "caffeine": True}},

    {"code": "BV006", "name": "Diet Coke", "category": "Beverages",
     "cuisine": "american", "calories": 0,
     "allergens": _a(),
     "dietary": _d(vegetarian=True, vegan=True, halal=True, kosher=True,
                   gluten_free=True, low_calorie=True, jain=True),
     "ingredients": {"carbonated_water": True, "aspartame": True, "caffeine": True}},

    {"code": "BV007", "name": "Sprite", "category": "Beverages",
     "cuisine": "american", "calories": 140,
     "allergens": _a(),
     "dietary": _d(vegetarian=True, vegan=True, halal=True, kosher=True, gluten_free=True, jain=True),
     "ingredients": {"carbonated_water": True, "lemon_lime": True, "sugar": True}},

    {"code": "BV008", "name": "Cappuccino", "category": "Beverages",
     "cuisine": "continental", "calories": 120,
     "allergens": _a(dairy=True),
     "dietary": _d(vegetarian=True, halal=True, gluten_free=True, jain=True),
     "ingredients": {"espresso": True, "steamed_milk": True, "foam": True}},

    {"code": "BV009", "name": "Iced Lemon Tea", "category": "Beverages",
     "cuisine": "continental", "calories": 90,
     "allergens": _a(),
     "dietary": _d(vegetarian=True, vegan=True, halal=True, kosher=True,
                   gluten_free=True, low_calorie=True, jain=True),
     "ingredients": {"black_tea": True, "lemon": True, "sugar": True, "ice": True}},

    {"code": "BV010", "name": "Sparkling Water", "category": "Beverages",
     "cuisine": "continental", "calories": 0,
     "allergens": _a(),
     "dietary": _d(vegetarian=True, vegan=True, halal=True, kosher=True,
                   gluten_free=True, low_calorie=True, jain=True),
     "ingredients": {"carbonated_water": True}},

    # ── ALCOHOL (5, international flights only) ──
    {"code": "AL001", "name": "Red Wine", "category": "Beverages",
     "cuisine": "continental", "calories": 125,
     "allergens": _a(),
     "dietary": _d(vegetarian=True, vegan=True, gluten_free=True),
     "ingredients": {"grapes": True, "alcohol": True}, "alcohol": True},

    {"code": "AL002", "name": "White Wine", "category": "Beverages",
     "cuisine": "continental", "calories": 120,
     "allergens": _a(),
     "dietary": _d(vegetarian=True, vegan=True, gluten_free=True),
     "ingredients": {"grapes": True, "alcohol": True}, "alcohol": True},

    {"code": "AL003", "name": "Craft Beer", "category": "Beverages",
     "cuisine": "american", "calories": 150,
     "allergens": _a(gluten=True),
     "dietary": _d(vegetarian=True, vegan=True),
     "ingredients": {"barley": True, "hops": True, "alcohol": True}, "alcohol": True},

    {"code": "AL004", "name": "Whiskey", "category": "Beverages",
     "cuisine": "continental", "calories": 105,
     "allergens": _a(gluten=True),
     "dietary": _d(vegetarian=True, vegan=True),
     "ingredients": {"grain": True, "alcohol": True}, "alcohol": True},

    {"code": "AL005", "name": "Gin & Tonic", "category": "Beverages",
     "cuisine": "continental", "calories": 180,
     "allergens": _a(),
     "dietary": _d(vegetarian=True, vegan=True, gluten_free=True),
     "ingredients": {"gin": True, "tonic": True, "alcohol": True}, "alcohol": True},
]

assert len(MEAL_CATALOG) == 61, f"Expected 61 meals, got {len(MEAL_CATALOG)}"

"""One-time script: fetch real food photos for each meal from TheMealDB.

Queries TheMealDB by dish name, saves matched image URLs to meal_images.json.
Meals with no match are reported so we can handle them (icon fallback / manual URL).
Run on a machine with internet access (TheMealDB API).
"""
import json
import time
import urllib.parse
import urllib.request

from app.ml.data_gen.catalog import MEAL_CATALOG

API = "https://www.themealdb.com/api/json/v1/1/search.php?s="

# Manual search-term overrides for dishes whose catalog name differs from
# what TheMealDB indexes well. Maps meal code -> better search term.
SEARCH_OVERRIDES = {
    "MC006": "salmon sashimi",
    "MC013": "dim sum",
    "ST004": "chicken tikka",
    "BV001": "masala chai",
    "SN009": "yogurt parfait",
}


def fetch(term: str):
    url = API + urllib.parse.quote(term)
    try:
        with urllib.request.urlopen(url, timeout=15) as r:
            data = json.loads(r.read().decode())
        meals = data.get("meals")
        if meals:
            return meals[0].get("strMealThumb")
    except Exception as e:
        print("  error:", e)
    return None


def main():
    results = {}
    misses = []
    for entry in MEAL_CATALOG:
        code = entry["code"]
        name = entry["name"]
        term = SEARCH_OVERRIDES.get(code, name)

        img = fetch(term)
        # Fallback: try the first two words of the name
        if not img and " " in name:
            img = fetch(" ".join(name.split()[:2]))
        # Fallback: try the first word
        if not img:
            img = fetch(name.split()[0])

        if img:
            results[code] = img
            print(f"OK   {code}  {name}  ->  {img}")
        else:
            misses.append((code, name))
            print(f"MISS {code}  {name}")
        time.sleep(0.3)  # be polite to the API

    with open("meal_images.json", "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)

    print(f"\nMatched {len(results)}/{len(MEAL_CATALOG)} meals.")
    if misses:
        print("Misses (will use icon fallback or need manual URLs):")
        for code, name in misses:
            print(f"  {code}  {name}")
    print("\nWrote meal_images.json")


if __name__ == "__main__":
    main()

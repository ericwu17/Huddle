"""Grounded menu selection helpers; no database or model calls.

Ingredient matching detects explicit conflicts, not absence of allergens or
cross-contact. Missing information makes an option provisional, not invisible.
"""
import re
from decimal import Decimal


def menu_items(catalog, place_id):
    evidence = catalog.evidence.get(place_id)
    return evidence.menu.items if evidence and evidence.menu else []


def normalized(text):
    return re.sub(r"[^a-z0-9]+", " ", text.casefold()).strip()


ALLERGEN_TERMS = {
    "peanut": ("peanut", "peanuts", "groundnut", "groundnuts"),
    "sesame": ("sesame", "tahini"),
    "milk": ("milk", "cheese", "cream", "butter", "feta", "yogurt"),
    "dairy": ("milk", "cheese", "cream", "butter", "feta", "yogurt"),
    "egg": ("egg", "eggs", "mayonnaise", "mayo"),
    "shellfish": ("shrimp", "prawn", "crab", "lobster", "clam", "oyster", "mussel", "scallop"),
    "tree nut": ("almond", "cashew", "walnut", "pecan", "pistachio", "hazelnut", "macadamia"),
    "soy": ("soy", "tofu", "edamame", "miso"),
    "wheat": ("wheat", "flour", "bread", "naan"),
    "gluten": ("wheat", "barley", "rye", "flour", "bread", "naan"),
    "fish": ("salmon", "tuna", "anchovy", "cod", "tilapia", "bonito", "fish sauce"),
}


def has_term(text, term):
    return bool(re.search(r"\b" + re.escape(normalized(term)) + r"(?:s)?\b", normalized(text)))


def allergy_conflict(item, allergies):
    text = " ".join([item.name, item.description])
    for allergy in allergies:
        key = normalized(allergy).removesuffix("s")
        matched = [term for label, aliases in ALLERGEN_TERMS.items()
                   if has_term(key, label) or any(has_term(key, alias) for alias in aliases) for term in aliases]
        terms = tuple(matched) or (key,)
        # Remove explicit absence phrases before matching ingredient tokens.
        clean = text
        for term in terms:
            clean = re.sub(r"\b" + re.escape(term) + r"[ -]free\b|\bno\s+" + re.escape(term) + r"\b", "", clean, flags=re.I)
        if any(has_term(clean, term) for term in terms):
            return True
    return False


def diet_conflict(item, dietary):
    text = " ".join([item.name, item.description])
    text = re.sub(r"\b(?:vegan|plant[- ]based|imitation|mock|non[- ]dairy|dairy[- ]free|without|no)\s+[a-z-]+", " ", text, flags=re.I)
    text = re.sub(r"\b(?:almond|soy|oat|coconut|cashew|rice|hemp)\s+milk\b", " ", text, flags=re.I)
    meat = ("beef", "steak", "chicken", "turkey", "pork", "bacon", "ham", "lamb", "goat", "duck", "shrimp", "prawn", "crab", "lobster", "oyster", "fish", "salmon", "tuna", "prosciutto", "sausage", "salami", "pepperoni", "lard", "gelatin", "anchovy", "anchovies")
    if "vegan" in dietary or "vegetarian" in dietary:
        if any(has_term(text, word) for word in meat):
            return True
    if "vegan" in dietary and any(has_term(text, word) for word in ("feta", "cheese", "milk", "egg", "butter", "yogurt", "cream", "honey", "whey", "ghee")):
        return True
    if "halal" in dietary or "kosher" in dietary:
        if any(has_term(text, word) for word in ("pork", "bacon", "ham", "prosciutto", "lard")):
            return True
    if "kosher" in dietary and any(has_term(text, word) for word in ("shrimp", "prawn", "crab", "lobster", "oyster")):
        return True
    if "gluten_free" in dietary and any(has_term(text, word) for word in ("wheat", "barley", "rye", "seitan", "couscous", "semolina", "bulgur")):
        return True
    return False


def allowed_items(catalog, place_id, member):
    hard = member.needs.hard
    return [item for item in menu_items(catalog, place_id)
            if not allergy_conflict(item, hard.allergies) and not diet_conflict(item, hard.dietary)]


def supported_diet(place, item, dietary):
    tags = set(place.dietary)
    if item:
        tags.update(normalized(label).replace(" ", "_") for label in item.labels)
    if "vegan" in tags:
        tags.add("vegetarian")
    return set(dietary).issubset(tags) and not (item and diet_conflict(item, dietary))


def item_cost(place, item):
    return Decimal(str(item.price if item and item.price is not None else place.costPerPerson))


def own_total(catalog, stops, selected):
    total = Decimal(0)
    for stop in stops:
        place = catalog.places[catalog.index[stop.placeId]]
        item_id = selected.get(stop.placeId)
        item = next((i for i in menu_items(catalog, place.id) if i.id == item_id), None)
        total += item_cost(place, item)
    return total.quantize(Decimal("0.01"))

"""Daily diet plan built with fixed rules (replaces the Gemini call in /nutrition/generate).

How it works
  1. Read the latest lab results (and home BP / weight) and flag what needs attention, using the lab's own
     reference range or a widely used cut-off (ADA prediabetes: HbA1c ≥ 5.7 % or fasting glucose ≥ 100 mg/dL;
     ACC/AHA: BP ≥ 130/80; Asian BMI ≥ 23).
  2. Score a curated list of everyday Indian meals by how well each fits those needs (low-GI, high-fibre,
     heart-healthy fats, iron + vitamin C, B12 sources, low salt, low purine …) and pick the best per meal.
  3. Calories: Mifflin-St Jeor resting energy × activity factor from the profile, minus 500 kcal when BMI ≥ 23
     (never below 1,200 kcal for women / 1,500 kcal for men). Without enough profile data: 2,000 kcal.

Plain words: the plan is chosen from a fixed menu, and every change is linked to a specific lab result,
so the same results always give the same plan and nothing is invented. It is general guidance, not a
prescription — a dietitian or doctor should personalise it, especially with kidney disease or diabetes medicines.
"""
from __future__ import annotations

from typing import Dict, List, Optional, Tuple

from app.services.biomarker_catalog import CATALOG_BY_KEY
from app.services.health_facts import PatientContext

# ---------------------------------------------------------------------------- meal library
# tags: low_gi, high_fiber, heart, iron, vit_c, b12, vit_d, low_salt, low_purine, protein, seafood, light
MEALS: Dict[str, List[Dict]] = {
    "breakfast": [
        {"name": "Vegetable oats upma with peanuts", "tags": {"low_gi", "high_fiber", "heart"},
         "description": "Rolled oats cooked with onion, carrot, beans and peas; a small handful of roasted peanuts."},
        {"name": "Moong dal chilla with mint chutney", "tags": {"low_gi", "protein", "high_fiber", "low_purine"},
         "description": "Two thin pancakes of soaked green-gram batter with grated vegetables, cooked with little oil."},
        {"name": "Besan–spinach chilla with tomato", "tags": {"iron", "protein", "low_gi"},
         "description": "Gram-flour pancakes with chopped spinach; eat with fresh tomato or a squeeze of lemon (vitamin C helps iron absorption)."},
        {"name": "Curd with fruit and seeds", "tags": {"b12", "low_purine", "light"},
         "description": "A bowl of plain curd with a cut fruit (guava, apple or papaya) and a spoon of flax or pumpkin seeds."},
        {"name": "Two boiled eggs with whole-wheat toast", "tags": {"b12", "vit_d", "protein"},
         "description": "Two boiled eggs, one slice of whole-wheat toast and a fruit. Vegetarian swap: paneer bhurji."},
        {"name": "Ragi dosa with sambar", "tags": {"high_fiber", "low_purine"},
         "description": "Finger-millet dosa with vegetable sambar and coconut-free chutney."},
    ],
    "lunch": [
        {"name": "Millet roti, dal, mixed vegetables and salad", "tags": {"low_gi", "high_fiber", "heart", "low_salt"},
         "description": "Two jowar or bajra rotis, a bowl of dal, a vegetable sabzi made with little oil and salt, and a large salad."},
        {"name": "Palak dal with multigrain roti and raita", "tags": {"iron", "b12", "high_fiber"},
         "description": "Spinach-lentil dal, two multigrain rotis and cucumber raita; finish with a lemon-dressed salad for vitamin C."},
        {"name": "Rajma with brown rice and salad", "tags": {"high_fiber", "iron", "low_gi", "protein"},
         "description": "A bowl of rajma, a small portion of brown rice and a large salad."},
        {"name": "Grilled fish curry with millet and vegetables", "tags": {"heart", "vit_d", "b12", "protein", "seafood"},
         "description": "Grilled or curried fish (such as mackerel or sardine) with a millet portion and vegetables. Vegetarian swap: paneer."},
        {"name": "Low-salt vegetable khichdi with curd", "tags": {"low_salt", "light", "low_purine"},
         "description": "Rice–moong khichdi with plenty of vegetables, cooked with minimal salt, and a bowl of curd."},
    ],
    "snack": [
        {"name": "Roasted chana", "tags": {"protein", "low_gi", "high_fiber"},
         "description": "A small bowl (about 30 g) of roasted Bengal gram, unsalted."},
        {"name": "Unsalted almonds and walnuts", "tags": {"heart", "low_salt"},
         "description": "A small handful (about 20–25 g) of unsalted nuts."},
        {"name": "Sprouts salad with lemon", "tags": {"iron", "vit_c", "high_fiber", "low_gi"},
         "description": "Moong sprouts with onion, tomato and lemon juice."},
        {"name": "Guava or orange", "tags": {"vit_c", "low_gi", "low_purine"},
         "description": "One whole fruit — whole fruit rather than juice."},
        {"name": "Plain buttermilk (chaas)", "tags": {"b12", "low_purine", "light"},
         "description": "A glass of buttermilk with roasted cumin, no added salt."},
    ],
    "dinner": [
        {"name": "Jowar roti with paneer and sautéed vegetables", "tags": {"low_gi", "b12", "protein"},
         "description": "Two jowar rotis, paneer bhurji or tofu, and stir-fried vegetables."},
        {"name": "Vegetable dalia khichdi", "tags": {"low_gi", "high_fiber", "light", "low_salt"},
         "description": "Broken-wheat and moong khichdi with vegetables, lightly salted."},
        {"name": "Clear soup, moong dal and one roti", "tags": {"light", "low_salt", "low_purine"},
         "description": "A bowl of vegetable soup, a bowl of moong dal and one whole-wheat roti."},
        {"name": "Methi thepla with curd and salad", "tags": {"iron", "b12", "high_fiber"},
         "description": "Two fenugreek theplas, a bowl of curd and a salad."},
    ],
}

# need -> (tags to prefer, tags to avoid, plain reason, change)
NEEDS: Dict[str, Tuple[set, set, str]] = {
    "glucose": ({"low_gi", "high_fiber"}, set(), "Prefer low-glycaemic whole grains, dal and vegetables; keep sweets, sugary drinks and white rice small."),
    "lipids": ({"heart", "high_fiber"}, set(), "Prefer fibre (oats, dal, vegetables) and unsaturated fats (nuts, seeds, fish); limit fried food and ghee/vanaspati."),
    "uric_acid": ({"low_purine"}, {"seafood"}, "Limit organ meat, shellfish and sardines/mackerel and avoid alcohol; dal, vegetables and low-fat dairy are fine."),
    "iron": ({"iron", "vit_c"}, set(), "Add iron-rich foods (spinach, rajma, sprouts, besan) with vitamin C (lemon, guava, orange); keep tea/coffee away from meals."),
    "vit_d": ({"vit_d"}, set(), "Include eggs or oily fish if you eat them, plus regular sunlight; your doctor may advise a supplement."),
    "b12": ({"b12"}, set(), "Include milk, curd, paneer or eggs daily — B12 comes mainly from animal foods; vegetarians often need a supplement (ask your doctor)."),
    "liver": ({"high_fiber", "low_gi"}, set(), "Cut sugar, refined flour and alcohol; weight loss is the main diet lever for fatty liver."),
    "bp": ({"low_salt"}, set(), "Keep salt under 5 g a day (about one teaspoon): avoid pickles, papad, chips and added table salt."),
    "kidney": (set(), set(), "Ask your doctor or a renal dietitian before high-protein or high-potassium diets or salt substitutes."),
    "weight": ({"high_fiber", "light"}, set(), "Calories are set 500 kcal below your estimated needs for gradual weight loss."),
}

ACTIVITY = {"sedentary": 1.2, "mild": 1.375, "moderate": 1.55, "vigorous": 1.725}


def _fmt(v: float) -> str:
    return str(int(v)) if float(v).is_integer() else f"{v:.1f}"


def _latest(ctx: PatientContext, key: str, source: Optional[str] = None):
    rs = [r for r in ctx.series.get(key, []) if source is None or r.source == source]
    return rs[-1] if rs else None


def detect_needs(ctx: PatientContext) -> List[Dict]:
    """[{need, because}] in a fixed order, each tied to a measured value."""
    out: List[Dict] = []

    def add(need, r, why):
        if not any(o["need"] == need for o in out):
            out.append({"need": need, "because": why, "date": r.date.isoformat()})

    def lab(key):
        return _latest(ctx, key, "lab")

    def label(key):
        return CATALOG_BY_KEY[key].label

    r = lab("hba1c")
    if r and r.value >= 5.7:
        add("glucose", r, f"HbA1c {_fmt(r.value)} % (5.7 % or higher is above normal)")
    r = _latest(ctx, "fasting_glucose")
    if r and r.value >= 100:
        add("glucose", r, f"fasting glucose {_fmt(r.value)} mg/dL (100 or higher is above normal)")
    for key in ("ldl", "total_cholesterol", "triglycerides"):
        r = lab(key)
        if r and r.status() == "above":
            add("lipids", r, f"{label(key)} {_fmt(r.value)} {r.unit} is above the lab range")
    r = lab("hdl")
    if r and r.status() == "below":
        add("lipids", r, f"HDL cholesterol {_fmt(r.value)} {r.unit} is below the lab range")
    r = lab("uric_acid")
    if r and r.status() == "above":
        add("uric_acid", r, f"uric acid {_fmt(r.value)} {r.unit} is above the lab range")
    for key in ("hemoglobin", "ferritin", "iron"):
        r = lab(key)
        if r and r.status() == "below":
            add("iron", r, f"{label(key)} {_fmt(r.value)} {r.unit} is below the lab range")
    r = lab("vitamin_d")
    if r and r.status() == "below":
        add("vit_d", r, f"vitamin D {_fmt(r.value)} {r.unit} is below the lab range")
    r = lab("vitamin_b12")
    if r and r.status() == "below":
        add("b12", r, f"vitamin B12 {_fmt(r.value)} {r.unit} is below the lab range")
    for key in ("alt", "ast"):
        r = lab(key)
        if r and r.status() == "above":
            add("liver", r, f"{label(key)} {_fmt(r.value)} {r.unit} is above the lab range")
    sbp, dbp = _latest(ctx, "sbp"), _latest(ctx, "dbp")
    if (sbp and sbp.value >= 130) or (dbp and dbp.value >= 80):
        r = sbp if (sbp and sbp.value >= 130) else dbp
        bp = f"{_fmt(sbp.value) if sbp else '—'}/{_fmt(dbp.value) if dbp else '—'}"
        add("bp", r, f"blood pressure {bp} mmHg (130/80 or higher is raised)")
    r = lab("egfr")
    if r and r.value < 60:
        add("kidney", r, f"eGFR {_fmt(r.value)} (below 60 suggests reduced kidney function)")
    else:
        r = lab("creatinine")
        if r and r.status() == "above":
            add("kidney", r, f"creatinine {_fmt(r.value)} {r.unit} is above the lab range")
    bmi = current_bmi(ctx)
    if bmi and bmi[0] >= 23:
        out.append({"need": "weight", "because": f"BMI {bmi[0]:.1f} (23 or higher is above the healthy range for Asian adults)",
                    "date": bmi[1]})
    return out


def current_bmi(ctx: PatientContext) -> Optional[Tuple[float, str]]:
    p = ctx.profile
    weight, wdate = _weight(ctx)
    if p and p.height_cm and weight:
        return weight / (p.height_cm / 100) ** 2, wdate
    r = _latest(ctx, "bmi")
    return (r.value, r.date.isoformat()) if r else None


def _weight(ctx: PatientContext) -> Tuple[Optional[float], str]:
    if ctx.weight_logs:
        w = ctx.weight_logs[-1]
        return w["value"], str(w["date"])
    p = ctx.profile
    if p and p.weight_kg:
        return p.weight_kg, "profile"
    return None, ""


def energy_target(ctx: PatientContext, lose_weight: bool) -> Tuple[int, str]:
    p, age, sex = ctx.profile, ctx.age, ctx.sex
    weight, _ = _weight(ctx)
    if not (p and p.height_cm and weight and age and sex in ("male", "female")):
        return 2000, "2,000 kcal default — add age, sex, height and weight in your profile to personalise it"
    bmr = 10 * weight + 6.25 * p.height_cm - 5 * age + (5 if sex == "male" else -161)
    factor = ACTIVITY.get(p.physical_activity or "", 1.375)
    kcal = bmr * factor
    note = (f"Mifflin-St Jeor: resting {bmr:.0f} kcal × {factor} activity factor "
            f"({p.physical_activity or 'activity not set, assumed mild'})")
    if lose_weight:
        floor = 1500 if sex == "male" else 1200
        kcal = max(floor, kcal - 500)
        note += f", minus 500 kcal for weight loss (minimum {floor})"
    return int(round(kcal / 50) * 50), note


def build_diet_plan(ctx: PatientContext) -> Dict:
    needs = detect_needs(ctx)
    active = {n["need"] for n in needs}
    prefer, avoid = {}, set()
    for n in active:
        tags, bad, _ = NEEDS[n]
        for t in tags:
            prefer[t] = prefer.get(t, 0) + 1
        avoid |= bad

    meals = {}
    for slot, options in MEALS.items():
        allowed = [m for m in options if not (m["tags"] & avoid)] or options
        best = max(allowed, key=lambda m: (sum(prefer.get(t, 0) for t in m["tags"]), -options.index(m)))
        meals[slot] = {"name": best["name"], "description": best["description"],
                       "why": sorted(t for t in best["tags"] if t in prefer)}

    kcal, kcal_note = energy_target(ctx, "weight" in active)
    carb_pct, protein_pct, fat_pct = (45, 25, 30) if "glucose" in active else (50, 20, 30)
    if "kidney" in active:
        carb_pct, protein_pct, fat_pct = carb_pct + protein_pct - 15, 15, fat_pct
    macros = {"calories": kcal, "protein": f"{round(kcal * protein_pct / 100 / 4)}g",
              "carbs": f"{round(kcal * carb_pct / 100 / 4)}g", "fats": f"{round(kcal * fat_pct / 100 / 9)}g"}

    adjustments = []
    for n in needs:
        change = NEEDS[n["need"]][2]
        if n["need"] == "weight" and "default" in kcal_note:
            change = ("Add your age, sex, height and weight in the profile so the plan can set a calorie target "
                      "about 500 kcal below your needs for gradual weight loss.")
        adjustments.append({"because": n["because"], "change": change, "date": n["date"]})
    if needs:
        reasoning = ("Chosen from your latest results: " + "; ".join(n["because"] for n in needs) + ". "
                     f"Target {kcal:,} kcal ({kcal_note}). Approximate split: {carb_pct}% carbohydrate, "
                     f"{protein_pct}% protein, {fat_pct}% fat.")
    else:
        reasoning = (f"No diet-related results are outside the normal range, so this is a balanced everyday plan. "
                     f"Target {kcal:,} kcal ({kcal_note}).")
    reasoning += " General guidance from fixed rules, not a prescription — check with your doctor or a dietitian."
    return {"summary_reasoning": reasoning, "adjustments": adjustments,
            "daily_plan": {"meals": meals, "macros": macros}, "method": "rules"}

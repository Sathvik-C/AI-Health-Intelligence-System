"""Pharmacogenomics (PGx) knowledge base.

A small, curated subset of CPIC (Clinical Pharmacogenetics Implementation
Consortium) gene-drug guidance, summarised in plain words. It is meant to flag
"discuss this with your doctor/pharmacist" items, never to change a dose.
Full guidelines: https://cpicpgx.org/guidelines/

Result vocabulary (what the user can enter in their profile)
------------------------------------------------------------
Metaboliser genes (CYP2C19, CYP2C9, CYP2D6, CYP3A5, TPMT, NUDT15, DPYD):
    poor_metabolizer | intermediate_metabolizer | normal_metabolizer |
    rapid_metabolizer | ultrarapid_metabolizer
SLCO1B1 (transporter): poor_function | decreased_function | normal_function | increased_function
VKORC1 (-1639G>A genotype): GG | GA | AA
G6PD: normal | deficient
HLA alleles (HLA-B*57:01, HLA-B*58:01, HLA-B*15:02, HLA-A*31:01): positive | negative
"""
from __future__ import annotations

import re
from typing import Dict, List, Optional

CPIC_URL = "https://cpicpgx.org/guidelines/"

METABOLIZER = ["poor_metabolizer", "intermediate_metabolizer", "normal_metabolizer", "rapid_metabolizer",
               "ultrarapid_metabolizer"]
GENES: Dict[str, Dict] = {
    "CYP2C19": {"values": METABOLIZER, "about": "Activates clopidogrel; clears many antidepressants, PPIs and voriconazole."},
    "CYP2C9": {"values": METABOLIZER[:3], "about": "Clears warfarin, phenytoin and several NSAIDs."},
    "CYP2D6": {"values": [v for v in METABOLIZER if v != "rapid_metabolizer"],
               "about": "Activates codeine/tramadol and tamoxifen; clears some beta-blockers, ondansetron, atomoxetine."},
    "CYP3A5": {"values": ["poor_metabolizer", "intermediate_metabolizer", "normal_metabolizer"],
               "about": "Expressers (normal/intermediate) clear tacrolimus faster."},
    "SLCO1B1": {"values": ["poor_function", "decreased_function", "normal_function", "increased_function"],
                "about": "Liver transporter for statins; reduced function raises statin muscle-side-effect risk."},
    "VKORC1": {"values": ["GG", "GA", "AA"], "about": "Warfarin target; A allele means higher warfarin sensitivity."},
    "TPMT": {"values": METABOLIZER[:3], "about": "Inactivates thiopurines (azathioprine, mercaptopurine)."},
    "NUDT15": {"values": METABOLIZER[:3], "about": "Inactivates thiopurines; reduced function is common in Asian ancestry."},
    "DPYD": {"values": METABOLIZER[:3], "about": "Breaks down fluorouracil and capecitabine."},
    "G6PD": {"values": ["normal", "deficient"], "about": "Deficiency causes haemolysis with oxidant drugs."},
    "HLA-B*57:01": {"values": ["positive", "negative"], "about": "Abacavir hypersensitivity."},
    "HLA-B*58:01": {"values": ["positive", "negative"], "about": "Allopurinol severe skin reactions."},
    "HLA-B*15:02": {"values": ["positive", "negative"],
                    "about": "Carbamazepine/oxcarbazepine/phenytoin SJS-TEN; more common in South & Southeast Asian ancestry."},
    "HLA-A*31:01": {"values": ["positive", "negative"], "about": "Carbamazepine severe skin reactions."},
}

# Well-known international brand names -> generic (kept deliberately small).
BRANDS = {
    "plavix": "clopidogrel", "coumadin": "warfarin", "zocor": "simvastatin", "lipitor": "atorvastatin",
    "crestor": "rosuvastatin", "tegretol": "carbamazepine", "trileptal": "oxcarbazepine", "dilantin": "phenytoin",
    "zyloprim": "allopurinol", "imuran": "azathioprine", "xeloda": "capecitabine", "ziagen": "abacavir",
    "prograf": "tacrolimus", "celexa": "citalopram", "lexapro": "escitalopram", "zoloft": "sertraline",
    "prilosec": "omeprazole", "prevacid": "lansoprazole", "protonix": "pantoprazole", "ultram": "tramadol",
    "nolvadex": "tamoxifen", "zofran": "ondansetron", "lopressor": "metoprolol", "toprol": "metoprolol",
    "strattera": "atomoxetine", "vfend": "voriconazole", "celebrex": "celecoxib", "advil": "ibuprofen",
    "brufen": "ibuprofen", "mobic": "meloxicam",
}

H, M, I = "high", "moderate", "info"

# Each rule: drugs, gene, {result: (severity, recommendation)}
RULES: List[Dict] = [
    {"drugs": ["clopidogrel"], "gene": "CYP2C19", "map": {
        "poor_metabolizer": (H, "Clopidogrel is barely activated. CPIC: avoid clopidogrel if possible; an alternative such as prasugrel or ticagrelor is preferred when not contraindicated."),
        "intermediate_metabolizer": (M, "Reduced clopidogrel activation. CPIC: after ACS/PCI prefer prasugrel or ticagrelor if not contraindicated; for other uses, discuss with the prescriber."),
    }},
    {"drugs": ["simvastatin"], "gene": "SLCO1B1", "map": {
        "decreased_function": (M, "Higher risk of statin muscle symptoms. CPIC: use an alternative statin or keep simvastatin at ≤20 mg/day."),
        "poor_function": (H, "High risk of statin muscle symptoms. CPIC: prescribe an alternative statin."),
    }},
    {"drugs": ["atorvastatin"], "gene": "SLCO1B1", "map": {
        "decreased_function": (I, "Somewhat higher exposure. CPIC: start at ≤40 mg/day and adjust to LDL goals."),
        "poor_function": (M, "Higher exposure and muscle-symptom risk. CPIC: start at ≤20 mg/day; if more is needed consider rosuvastatin or combination therapy."),
    }},
    {"drugs": ["rosuvastatin"], "gene": "SLCO1B1", "map": {
        "poor_function": (M, "Higher exposure. CPIC: start at ≤20 mg/day; if more is needed consider an alternative or combination therapy."),
    }},
    {"drugs": ["warfarin"], "gene": "CYP2C9", "map": {
        "intermediate_metabolizer": (M, "Slower warfarin clearance → lower dose needs and higher bleeding risk. CPIC: use genotype-guided dosing (e.g. a validated dosing algorithm) with close INR monitoring."),
        "poor_metabolizer": (H, "Much slower warfarin clearance → substantially lower dose needs. CPIC: genotype-guided dosing with close INR monitoring."),
    }},
    {"drugs": ["warfarin"], "gene": "VKORC1", "map": {
        "GA": (M, "Increased warfarin sensitivity → lower dose needs. CPIC: use genotype-guided dosing."),
        "AA": (H, "High warfarin sensitivity → much lower dose needs. CPIC: use genotype-guided dosing."),
    }},
    {"drugs": ["codeine", "tramadol"], "gene": "CYP2D6", "map": {
        "ultrarapid_metabolizer": (H, "Rapid conversion to the active opioid → risk of serious toxicity. CPIC: avoid; use a non-codeine, non-tramadol analgesic."),
        "poor_metabolizer": (M, "Little conversion to the active opioid → poor pain relief. CPIC: avoid; use a non-codeine, non-tramadol analgesic."),
        "intermediate_metabolizer": (I, "Standard dosing; if pain relief is inadequate, consider an alternative analgesic."),
    }},
    {"drugs": ["ondansetron"], "gene": "CYP2D6", "map": {
        "ultrarapid_metabolizer": (M, "Faster clearance → may work less well. CPIC: consider an antiemetic not mainly cleared by CYP2D6 (e.g. granisetron)."),
    }},
    {"drugs": ["tamoxifen"], "gene": "CYP2D6", "map": {
        "poor_metabolizer": (H, "Low levels of the active metabolite (endoxifen). CPIC: discuss alternative hormonal therapy (e.g. an aromatase inhibitor where appropriate) with the oncologist."),
        "intermediate_metabolizer": (M, "Reduced endoxifen. CPIC: discuss alternative hormonal therapy or dosing with the oncologist."),
    }},
    {"drugs": ["metoprolol"], "gene": "CYP2D6", "map": {
        "poor_metabolizer": (M, "Higher metoprolol levels → more slowing of heart rate. CPIC: start low and titrate gradually, watching heart rate."),
    }},
    {"drugs": ["atomoxetine"], "gene": "CYP2D6", "map": {
        "poor_metabolizer": (M, "Much higher exposure. CPIC: start at a low dose and increase slowly based on response and side effects."),
    }},
    {"drugs": ["citalopram", "escitalopram"], "gene": "CYP2C19", "map": {
        "poor_metabolizer": (M, "Higher drug levels. CPIC: consider a 50% lower starting dose or an alternative antidepressant."),
        "ultrarapid_metabolizer": (M, "Lower drug levels → may not work. CPIC: consider an alternative not mainly cleared by CYP2C19."),
    }},
    {"drugs": ["sertraline"], "gene": "CYP2C19", "map": {
        "poor_metabolizer": (I, "Higher drug levels. CPIC: consider a lower starting dose and slower titration."),
    }},
    {"drugs": ["omeprazole", "lansoprazole", "pantoprazole", "dexlansoprazole"], "gene": "CYP2C19", "map": {
        "ultrarapid_metabolizer": (M, "Faster PPI clearance → less acid suppression. CPIC: increase the starting dose (about 100%)."),
        "rapid_metabolizer": (I, "Faster PPI clearance. CPIC: consider a higher starting dose for H. pylori or erosive oesophagitis."),
        "poor_metabolizer": (I, "Higher PPI levels. CPIC: for long-term use (>12 weeks) consider a 50% lower dose."),
        "intermediate_metabolizer": (I, "Higher PPI levels. CPIC: for long-term use, consider a 50% lower dose once controlled."),
    }},
    {"drugs": ["voriconazole"], "gene": "CYP2C19", "map": {
        "ultrarapid_metabolizer": (M, "Levels may be too low to work. CPIC: choose an alternative antifungal."),
        "rapid_metabolizer": (M, "Levels may be too low. CPIC: choose an alternative antifungal."),
        "poor_metabolizer": (M, "Higher levels → more side effects. CPIC: choose an alternative antifungal."),
    }},
    {"drugs": ["abacavir"], "gene": "HLA-B*57:01", "map": {
        "positive": (H, "High risk of a severe hypersensitivity reaction. CPIC / drug label: do not use abacavir."),
    }},
    {"drugs": ["carbamazepine", "oxcarbazepine"], "gene": "HLA-B*15:02", "map": {
        "positive": (H, "Greatly increased risk of SJS/TEN (severe skin reaction). CPIC: avoid if not already taking it long-term without problems."),
    }},
    {"drugs": ["carbamazepine"], "gene": "HLA-A*31:01", "map": {
        "positive": (H, "Increased risk of severe skin reactions. CPIC: avoid if alternatives are available."),
    }},
    {"drugs": ["phenytoin", "fosphenytoin"], "gene": "HLA-B*15:02", "map": {
        "positive": (H, "Increased risk of SJS/TEN. CPIC: avoid if the patient has not taken it before."),
    }},
    {"drugs": ["phenytoin", "fosphenytoin"], "gene": "CYP2C9", "map": {
        "intermediate_metabolizer": (M, "Slower clearance. CPIC: consider a lower maintenance dose and check drug levels."),
        "poor_metabolizer": (H, "Much slower clearance. CPIC: use a substantially lower maintenance dose and check drug levels."),
    }},
    {"drugs": ["allopurinol"], "gene": "HLA-B*58:01", "map": {
        "positive": (H, "High risk of severe cutaneous adverse reactions. CPIC: allopurinol should not be used."),
    }},
    {"drugs": ["azathioprine", "mercaptopurine", "thioguanine"], "gene": "TPMT", "map": {
        "intermediate_metabolizer": (M, "Higher toxic metabolite levels. CPIC: start at a reduced dose and adjust to blood counts."),
        "poor_metabolizer": (H, "Very high risk of severe bone-marrow toxicity. CPIC: drastically reduced dose or a non-thiopurine alternative."),
    }},
    {"drugs": ["azathioprine", "mercaptopurine", "thioguanine"], "gene": "NUDT15", "map": {
        "intermediate_metabolizer": (M, "Higher toxicity risk. CPIC: start at a reduced dose and adjust to blood counts."),
        "poor_metabolizer": (H, "Very high toxicity risk. CPIC: drastically reduced dose or a non-thiopurine alternative."),
    }},
    {"drugs": ["fluorouracil", "capecitabine"], "gene": "DPYD", "map": {
        "intermediate_metabolizer": (H, "Reduced drug breakdown → severe toxicity risk. CPIC: reduce the starting dose (about 50%) and titrate."),
        "poor_metabolizer": (H, "Severe, potentially fatal toxicity risk. CPIC: avoid these drugs."),
    }},
    {"drugs": ["tacrolimus"], "gene": "CYP3A5", "map": {
        "normal_metabolizer": (M, "CYP3A5 expresser → faster clearance. CPIC: increase the starting dose 1.5–2× and use drug-level monitoring."),
        "intermediate_metabolizer": (M, "CYP3A5 expresser → faster clearance. CPIC: increase the starting dose 1.5–2× and use drug-level monitoring."),
    }},
    {"drugs": ["celecoxib", "ibuprofen", "flurbiprofen", "meloxicam", "piroxicam"], "gene": "CYP2C9", "map": {
        "poor_metabolizer": (M, "Slower NSAID clearance → more side effects. CPIC: start at 25–50% of the lowest dose (celecoxib, ibuprofen, flurbiprofen) or choose an alternative (meloxicam, piroxicam)."),
        "intermediate_metabolizer": (I, "Slightly slower clearance. Use the lowest effective dose."),
    }},
    {"drugs": ["rasburicase", "pegloticase", "primaquine", "tafenoquine"], "gene": "G6PD", "map": {
        "deficient": (H, "Risk of acute haemolytic anaemia. CPIC: avoid."),
    }},
    {"drugs": ["dapsone"], "gene": "G6PD", "map": {
        "deficient": (M, "Risk of haemolysis. CPIC: use with caution and monitor."),
    }},
]

ALL_RULE_DRUGS = sorted({d for r in RULES for d in r["drugs"]})


def generic_name(drug_name: str) -> Optional[str]:
    """Return the generic drug in our rule set mentioned in a free-text medicine name."""
    text = (drug_name or "").lower()
    words = set(re.findall(r"[a-z]+", text))
    for brand, generic in BRANDS.items():
        if brand in words:
            return generic
    for generic in ALL_RULE_DRUGS:
        if generic in words:
            return generic
    return None


def evaluate(medicines: List[Dict], pgx_results: Optional[Dict[str, str]]) -> Dict:
    """Cross-check current medicines against entered PGx results.

    medicines: [{"drug_name": str, "dosage": str|None}]
    Returns {"interactions": [...], "testing_opportunities": [...], "results_entered": int}
    """
    results = {k: v for k, v in (pgx_results or {}).items() if v}
    interactions, opportunities = [], []
    seen_opp = set()
    for med in medicines:
        generic = generic_name(med.get("drug_name", ""))
        if not generic:
            continue
        for rule in RULES:
            if generic not in rule["drugs"]:
                continue
            gene = rule["gene"]
            result = results.get(gene)
            if result is None:
                if (generic, gene) not in seen_opp:
                    seen_opp.add((generic, gene))
                    opportunities.append({
                        "drug": med.get("drug_name"), "generic": generic, "gene": gene,
                        "why": GENES[gene]["about"],
                    })
                continue
            hit = rule["map"].get(result)
            if hit:
                severity, rec = hit
                interactions.append({
                    "drug": med.get("drug_name"), "generic": generic, "gene": gene, "result": result,
                    "severity": severity, "recommendation": rec, "source": "CPIC", "source_url": CPIC_URL,
                })
            else:
                interactions.append({
                    "drug": med.get("drug_name"), "generic": generic, "gene": gene, "result": result,
                    "severity": "none", "recommendation": "No gene-based change suggested for this result.",
                    "source": "CPIC", "source_url": CPIC_URL,
                })
    order = {"high": 0, "moderate": 1, "info": 2, "none": 3}
    interactions.sort(key=lambda x: order.get(x["severity"], 9))
    return {"interactions": interactions, "testing_opportunities": opportunities, "results_entered": len(results)}

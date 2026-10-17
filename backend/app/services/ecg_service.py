import io
import json
import os
import re

import torch
import timm
from PIL import Image
from torchvision import transforms

from app.services.ecg_content import template_summary, facts_for


# ============================================================
# MODEL CONFIG
# Checkpoint: fmenegui/pretrained_image_ecg_doc (model_fold0.ckpt)
# Put the file at: backend/ml_weights/ecg/model_fold0.ckpt
# (kept outside app/models, which holds the database models)
# ============================================================

CKPT_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "ml_weights", "ecg", "model_fold0.ckpt"
)

# Output order verified with labelled test images at 224 px.
CLASSES = ["1dAVb", "RBBB", "LBBB", "SB", "AF", "ST"]

INPUT_SIZE = 224  # 384 gave poor results in testing

# Placeholder cutoffs. Replace with values chosen from your test set.
HIGH_CUTOFF = 0.80
MID_CUTOFF = 0.50

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

_model = None

_transform = transforms.Compose(
    [
        transforms.Resize((INPUT_SIZE, INPUT_SIZE)),
        transforms.ToTensor(),
        transforms.Normalize((0.485, 0.456, 0.406), (0.229, 0.224, 0.225)),
    ]
)


def _load_model():
    """Load once, on first request (keeps server startup fast)."""
    global _model
    if _model is None:
        ckpt = torch.load(CKPT_PATH, map_location=DEVICE)
        state = {k[len("model."):]: v for k, v in ckpt["state_dict"].items()}
        m = timm.create_model(
            "convnext_tiny_in22k", pretrained=False, num_classes=len(CLASSES)
        )
        m.load_state_dict(state)  # raises if any key does not match
        _model = m.to(DEVICE).eval()
    return _model


# ============================================================
# USER-FRIENDLY TERMINOLOGY
# ============================================================

UI_TERMINOLOGY = {
    "1dAVb": {
        "name": "First-degree AV block",
        "category": "Conduction",
        "description": (
            "A pattern that may be associated with a slightly slowed electrical "
            "signal between the upper and lower chambers of the heart."
        ),
    },
    "RBBB": {
        "name": "Right bundle branch block",
        "category": "Conduction",
        "description": (
            "A pattern that may be associated with a delay in the heart's "
            "electrical signal on the right side."
        ),
    },
    "LBBB": {
        "name": "Left bundle branch block",
        "category": "Conduction",
        "description": (
            "A pattern that may be associated with a delay in the heart's "
            "electrical signal on the left side."
        ),
    },
    "SB": {
        "name": "Sinus bradycardia (slow heart rate)",
        "category": "Rhythm",
        "description": (
            "A pattern that may be associated with a slow but regular heart rhythm."
        ),
    },
    "AF": {
        "name": "Atrial fibrillation",
        "category": "Rhythm",
        "description": (
            "A pattern that may be associated with an irregular rhythm in the "
            "upper chambers of the heart."
        ),
    },
    "ST": {
        "name": "Sinus tachycardia (fast heart rate)",
        "category": "Rhythm",
        "description": (
            "A pattern that may be associated with a fast but regular heart rhythm."
        ),
    },
}

DISCLAIMER = (
    "This analysis is for informational and research purposes only. Model scores "
    "are not medical diagnoses or calibrated probabilities. The model checks only "
    "six conditions and can be wrong. Please have a qualified healthcare "
    "professional review your ECG."
)

SUMMARY_NOTICE = (
    "This summary was written by AI from the model's results. It is not a diagnosis."
)


# ============================================================
# INTERPRETATION LAYER
# ============================================================

def interpret_score(score: float) -> dict:
    """Model-score categories, NOT diagnoses or calibrated probabilities."""
    if score >= HIGH_CUTOFF:
        return {"level": "high", "label": "Strong model score", "status": "attention"}
    if score >= MID_CUTOFF:
        return {"level": "moderate", "label": "Possible (less certain)", "status": "review"}
    return {"level": "not_detected", "label": "Not detected", "status": "minimal"}


_LEVEL_WORD = {"high": "strong", "moderate": "possible", "not_detected": "not detected"}


def _is_inconsistent(flagged_codes: set) -> bool:
    """AF is irregular; sinus rhythms are regular. Both together is suspect."""
    return "AF" in flagged_codes and bool(flagged_codes & {"ST", "SB"})


# ============================================================
# SUMMARIES: template (always available) + LLM (optional)
# ============================================================

_LLM_SYSTEM = f"""You write short, plain-language ECG result summaries for patients.
You are given the output of a classification model that checks ONLY six conditions:
first-degree AV block, right bundle branch block, left bundle branch block,
sinus bradycardia, atrial fibrillation, sinus tachycardia.

Rules:
- Refer to the predictions as coming from "the model". Never call the classifier "AI".
- Use ONLY the levels and facts provided. Do not add other conditions, numbers, causes,
  symptoms the patient has, or treatments.
- Never state or imply a diagnosis. Say "the model found a pattern associated with...".
- Describe "possible" findings as less certain than "strong" ones.
- Never say the ECG is normal. If nothing is detected, say the model did not detect any of
  the six checked conditions and that this does not rule out other problems.
- If several findings are flagged, or atrial fibrillation appears together with sinus
  tachycardia or sinus bradycardia, say the results are inconsistent and need doctor review.
- Briefly explain each flagged condition in general terms, at about a 7th grade reading level.
- Always recommend that a doctor review the ECG. Do not give medication or treatment advice.
- Keep it under 250 words. End with exactly: "{SUMMARY_NOTICE}"
"""

_BANNED = ["prescri", "medication", "heart attack", "you have ", "you are diagnosed"]


def _llm_summary_is_safe(text: str) -> bool:
    if SUMMARY_NOTICE not in text:
        return False
    body = text.replace(SUMMARY_NOTICE, "")
    low = body.lower()
    # "AI" may only appear in the closing notice
    if re.search(r"\bai\b", low):
        return False
    if any(b in low for b in _BANNED):
        return False
    # "normal" is only allowed in a negated phrase such as "does not mean ... normal"
    for m in re.finditer(r"normal", low):
        if " not " not in " " + low[max(0, m.start() - 40): m.start()]:
            return False
    return True


def _llm_summary(observations: list):
    """Returns LLM text, or None if unavailable/unsafe (caller falls back to template)."""
    if not os.getenv("GEMINI_API_KEY"):
        print("[ECG summary] GEMINI_API_KEY not set, using template")
        return None
    try:
        from app.ai.gemini_service import get_client

        flagged_codes = [o["code"] for o in observations if o["level"] != "not_detected"]
        findings = {
            "levels": {o["name"]: _LEVEL_WORD[o["level"]] for o in observations},
            "facts": facts_for(flagged_codes),
        }
        model = get_client()
        resp = model.generate_content(
            _LLM_SYSTEM + "\n\nClassifier results:\n" + json.dumps(findings, indent=2)
        )
        text = resp.text.strip()
        if _llm_summary_is_safe(text):
            print("[ECG summary] using Gemini text")
            return text
        print("[ECG summary] Gemini text failed the safety check:\n", text)
        return None
    except Exception as e:
        print("[ECG summary] Gemini call failed:", repr(e))
        return None


# ============================================================
# ECG ANALYSIS
# ============================================================

def analyze_ecg(image_bytes: bytes) -> dict:
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    x = _transform(img).unsqueeze(0).to(DEVICE)

    with torch.no_grad():
        probs = torch.sigmoid(_load_model()(x))[0].cpu().tolist()  # multi-label

    raw_scores = {code: float(p) for code, p in zip(CLASSES, probs)}

    observations = []
    for code, score in raw_scores.items():
        term = UI_TERMINOLOGY[code]
        interp = interpret_score(score)
        observations.append(
            {
                "code": code,
                "technical_name": code,
                "name": term["name"],
                "category": term["category"],
                "score": round(score, 4),
                "interpretation": interp["label"],
                "level": interp["level"],
                "status": interp["status"],
                "description": term["description"],
            }
        )
    observations.sort(key=lambda o: o["score"], reverse=True)

    flagged = {o["code"] for o in observations if o["level"] != "not_detected"}
    if not flagged:
        status = "none_detected"
        text = (
            "The model did not detect any of the six conditions it checks. "
            "This does not mean the ECG is normal."
        )
    elif _is_inconsistent(flagged):
        status = "inconsistent"
        text = (
            "The model flagged findings that do not normally occur together. "
            "A healthcare professional should review this ECG."
        )
    else:
        status = "attention"
        text = (
            "The model produced higher scores for some findings. These should be "
            "reviewed by a qualified healthcare professional."
        )

    patient_summary = _llm_summary(observations)
    if patient_summary is None:
        print("[ECG summary] using fixed template")
        patient_summary = template_summary(observations, _is_inconsistent(flagged))

    return {
        "summary": {"status": status, "text": text},
        "patient_summary": patient_summary,
        "observations": observations,
        "technical_scores": {k: round(v, 4) for k, v in raw_scores.items()},
        "disclaimer": DISCLAIMER,
    }
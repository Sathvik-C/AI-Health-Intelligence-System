"""
Patient-facing content for the ECG feature.

Reviewed facts live here so the fixed template AND the Gemini prompt use the same
material. Have a clinician review this wording before real patients see it.
"""

TEMPLATE_NOTICE = (
    "This summary is generated automatically from the model's results. "
    "It is not a diagnosis."
)

URGENT_GENERAL = (
    "Get urgent medical help right away if you have chest pain, severe shortness of "
    "breath, fainting, or signs of a stroke (face drooping, arm weakness, trouble speaking)."
)

PATIENT_INFO = {
    "ST": {
        "what": (
            "Sinus tachycardia means the heart is beating faster than usual (above about "
            "100 beats per minute) while keeping a regular rhythm."
        ),
        "context": (
            "It is often a normal response to exercise, stress, fever, pain, dehydration "
            "or caffeine. Sometimes it is linked to other conditions such as anaemia or "
            "thyroid problems."
        ),
        "next": (
            "Ask a doctor to check the ECG together with your symptoms. If it keeps "
            "happening at rest, it is worth getting checked."
        ),
        "questions": [
            "Is my resting heart rate normal for me?",
            "Could anything I take (medicines, caffeine) be contributing?",
        ],
    },
    "SB": {
        "what": (
            "Sinus bradycardia means the heart is beating slower than usual (below about "
            "60 beats per minute) while keeping a regular rhythm."
        ),
        "context": (
            "It is common and often harmless, especially in athletes and during sleep. "
            "Sometimes it is linked to certain medicines, thyroid problems or the heart's "
            "electrical system."
        ),
        "next": (
            "Mention it to a doctor, especially if you feel dizzy, very tired, faint or "
            "short of breath."
        ),
        "questions": [
            "Is a slow heart rate normal for me?",
            "Do any of my medicines slow the heart rate?",
        ],
    },
    "AF": {
        "what": (
            "Atrial fibrillation is an irregular, often fast rhythm that starts in the "
            "upper chambers of the heart."
        ),
        "context": (
            "Some people notice palpitations, tiredness or breathlessness, while others "
            "feel nothing. It can raise the risk of stroke, which is why it needs to be "
            "assessed by a doctor."
        ),
        "next": (
            "Please arrange a review soon so a doctor can confirm the rhythm, usually with "
            "another ECG or a heart monitor."
        ),
        "questions": [
            "Does this ECG confirm atrial fibrillation?",
            "Do I need a heart monitor or further tests?",
            "What does this mean for my stroke risk?",
        ],
    },
    "1dAVb": {
        "what": (
            "First-degree AV block means the electrical signal takes slightly longer than "
            "usual to pass from the upper to the lower chambers of the heart."
        ),
        "context": (
            "It often causes no symptoms and can be harmless. It can also be linked to "
            "certain medicines or to the heart's electrical system."
        ),
        "next": (
            "A doctor can confirm it and decide whether any follow-up is needed."
        ),
        "questions": [
            "Does this need follow-up or only monitoring?",
            "Could a medicine of mine be involved?",
        ],
    },
    "RBBB": {
        "what": (
            "Right bundle branch block means the electrical signal travels more slowly "
            "through the right side of the heart."
        ),
        "context": (
            "It is fairly common and is often harmless in people with an otherwise healthy "
            "heart. Sometimes it goes along with heart or lung conditions, so doctors read "
            "it together with the rest of the ECG and your history."
        ),
        "next": "Please have a doctor review it to confirm what it means for you.",
        "questions": [
            "Is this a long-standing finding for me?",
            "Do I need any further tests?",
        ],
    },
    "LBBB": {
        "what": (
            "Left bundle branch block means the electrical signal travels more slowly "
            "through the left side of the heart."
        ),
        "context": (
            "It is more often linked to an underlying heart condition than right bundle "
            "branch block, so doctors usually want to look into it."
        ),
        "next": (
            "Please arrange a prompt review with a doctor, who may suggest further tests "
            "such as an echocardiogram."
        ),
        "questions": [
            "Is this new or has it been there before?",
            "Do I need a heart ultrasound or other tests?",
        ],
    },
}


def facts_for(codes):
    """Facts handed to the Gemini prompt so it explains only reviewed content."""
    return {
        c: {k: PATIENT_INFO[c][k] for k in ("what", "context", "next")} for c in codes
    }


def template_summary(observations, inconsistent: bool) -> str:
    """Fixed, reviewed summary. Never claims to be AI-written."""
    flagged = [o for o in observations if o["level"] != "not_detected"]

    if not flagged:
        return (
            "What the model found\n"
            "The model did not detect any of the six conditions it checks: first-degree AV "
            "block, right or left bundle branch block, sinus bradycardia, atrial "
            "fibrillation and sinus tachycardia.\n\n"
            "What this means\n"
            "This does not mean your ECG is normal. The model cannot check for other heart "
            "problems, and it can miss things.\n\n"
            "What to do next\n"
            "Have a doctor review your ECG, especially if you have symptoms such as "
            "palpitations, dizziness or chest discomfort.\n\n"
            + URGENT_GENERAL
            + "\n\n"
            + TEMPLATE_NOTICE
        )

    parts = []

    if inconsistent:
        parts.append(
            "Important\n"
            "The model flagged findings that do not normally occur together (an irregular "
            "rhythm together with a regular fast or slow one). This suggests the result may "
            "contain a mistake, so please have a doctor look at the ECG itself."
        )

    for o in flagged:
        info = PATIENT_INFO[o["code"]]
        certainty = (
            "a strong pattern" if o["level"] == "high" else "a possible, less certain pattern"
        )
        parts.append(
            f"{o['name']}\n"
            f"The model found {certainty} associated with this.\n"
            f"What it is: {info['what']}\n"
            f"Good to know: {info['context']}\n"
            f"What to do next: {info['next']}"
        )

    if len(flagged) > 1 and not inconsistent:
        parts.append(
            "Note\nMore than one pattern was flagged. The model can flag extra patterns by "
            "mistake, so a doctor should look at all of them."
        )

    questions = []
    for o in flagged:
        for q in PATIENT_INFO[o["code"]]["questions"]:
            if q not in questions:
                questions.append(q)
    parts.append(
        "Questions you could ask your doctor\n" + "\n".join(f"- {q}" for q in questions[:4])
    )

    parts.append(URGENT_GENERAL)
    parts.append(TEMPLATE_NOTICE)

    return "\n\n".join(parts)

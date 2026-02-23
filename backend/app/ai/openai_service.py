import os
import json
import google.generativeai as genai

def get_client():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY is not set in your .env file")
    genai.configure(api_key=api_key)
    return genai.GenerativeModel("gemini-2.5-flash")


async def extract_biomarkers_from_text(text: str) -> list:
    model = get_client()
    prompt = f"""You are a medical data extraction assistant.
Extract all biomarkers/lab values from the following medical report text.
Return ONLY a JSON array with no markdown, no explanation.
Each item must have: name, value, unit, ref_min, ref_max.
Use empty string "" for missing fields. All values must be numeric strings or empty strings.

Report text:
{text[:4000]}

Return format:
[{{"name": "Hemoglobin", "value": "14.2", "unit": "g/dL", "ref_min": "12.0", "ref_max": "16.0"}}]
"""
    response = model.generate_content(prompt)
    raw = response.text.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    return json.loads(raw)


async def generate_health_summary(biomarker_data: list) -> dict:
    model = get_client()
    prompt = f"""You are a health data analyst assistant. Based on the following biomarker history, generate a structured health summary.
Return ONLY valid JSON with no markdown.

Biomarker history:
{json.dumps(biomarker_data[:80], indent=2)}

Return this exact structure:
{{
  "key_improvements": ["..."],
  "worsening_indicators": ["..."],
  "risk_trends": ["..."],
  "important_changes": ["..."],
  "overall_assessment": "..."
}}
"""
    response = model.generate_content(prompt)
    raw = response.text.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    return json.loads(raw)

import json
import logging
from app.ai.gemini_service import get_client

async def generate_diet_plan(health_data: list) -> dict:
    model = get_client()
    prompt = f"""You are an expert AI Nutritionist.
Based on the following user health data (biomarkers and manual logs), generate a personalized daily diet plan template.
Target specific nutritional interventions based on their anomalies (e.g., if glucose is high, suggest low GI meals; if cholesterol is high, suggest heart-healthy fats).

Health Data:
{json.dumps(health_data[:150], indent=2)}

Return ONLY a valid JSON object matching this exact structure, with no markdown formatting:
{{
  "summary_reasoning": "A brief explanation of why this diet was chosen based on their lab results...",
  "daily_plan": {{
    "meals": {{
      "breakfast": {{"name": "...", "description": "..."}},
      "lunch": {{"name": "...", "description": "..."}},
      "dinner": {{"name": "...", "description": "..."}},
      "snack": {{"name": "...", "description": "..."}}
    }},
    "macros": {{"calories": 2000, "protein": "100g", "carbs": "250g", "fats": "65g"}}
  }}
}}
"""
    try:
        response = model.generate_content(prompt)
        raw = response.text.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        return json.loads(raw)
    except Exception as e:
        logging.error(f"Error generating diet plan: {e}")
        raise e

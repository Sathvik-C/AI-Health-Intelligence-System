import os
import json
import google.generativeai as genai

def get_client():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY is not set in your .env file")
    genai.configure(api_key=api_key)
    return genai.GenerativeModel("gemini-2.5-flash")

SYSTEM_PROMPT = """You are a helpful health information assistant. You help users understand their lab results and health data.

IMPORTANT RULES:
- You are NOT a doctor and cannot provide medical diagnoses
- You provide contextual explanations and observations only
- Always recommend consulting a healthcare provider for medical decisions
- Be clear, empathetic, and educational
- Base your answers on the provided context
"""

DOCTOR_SYSTEM_PROMPT = """You are a clinical data summarization assistant for healthcare professionals.
Present data in a structured, clinical format. Be concise and factual. No conversational language."""


async def get_rag_answer(
    question: str,
    biomarker_context: list,
    report_texts: list,
    doctor_mode: bool = False,
) -> str:
    model = get_client()

    biomarker_str = json.dumps(biomarker_context[:50], indent=2)
    system = DOCTOR_SYSTEM_PROMPT if doctor_mode else SYSTEM_PROMPT

    prompt = f"""{system}

User Question: {question}

Recent Biomarker Data (latest first):
{biomarker_str}

Please answer the question based on this data."""

    response = model.generate_content(prompt)
    return response.text

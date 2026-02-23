import os
import json
import hashlib
import chromadb
from openai import AsyncOpenAI

def get_client():
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY is not set in your .env file")
    return AsyncOpenAI(api_key=api_key)
MODEL = "gpt-4o-mini"
EMBED_MODEL = "text-embedding-3-small"

# Initialize ChromaDB
chroma_client = chromadb.PersistentClient(path=os.getenv("CHROMA_PATH", "./chroma_db"))
collection = chroma_client.get_or_create_collection("health_reports")


def chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> list[str]:
    """Split text into overlapping chunks."""
    words = text.split()
    chunks = []
    for i in range(0, len(words), chunk_size - overlap):
        chunk = " ".join(words[i:i + chunk_size])
        if chunk:
            chunks.append(chunk)
    return chunks


async def embed_texts(texts: list[str]) -> list[list[float]]:
    client = get_client()
    response = await client.embeddings.create(input=texts, model=EMBED_MODEL)
    return [item.embedding for item in response.data]


async def index_report_texts(report_texts: list[str], user_id: int):
    """Index report texts into ChromaDB."""
    all_chunks = []
    for text in report_texts:
        all_chunks.extend(chunk_text(text))

    if not all_chunks:
        return

    # Deduplicate
    unique_chunks = list(set(all_chunks))
    ids = [hashlib.md5(f"{user_id}_{c}".encode()).hexdigest() for c in unique_chunks]
    metadatas = [{"user_id": str(user_id)} for _ in unique_chunks]

    embeddings = await embed_texts(unique_chunks)
    collection.upsert(ids=ids, documents=unique_chunks, embeddings=embeddings, metadatas=metadatas)


async def retrieve_relevant_chunks(query: str, user_id: int, n_results: int = 4) -> list[str]:
    """Retrieve relevant text chunks for a query."""
    query_embedding = (await embed_texts([query]))[0]
    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=n_results,
        where={"user_id": str(user_id)},
    )
    return results.get("documents", [[]])[0]


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
    report_texts: list[str],
    doctor_mode: bool = False,
) -> str:
    """Answer a health question using RAG + biomarker context."""

    # Format biomarker context
    biomarker_str = json.dumps(biomarker_context[:50], indent=2)

    # Try to retrieve relevant chunks
    retrieved_chunks = []
    if report_texts:
        try:
            # Index any new texts
            await index_report_texts(report_texts, id(report_texts))
            # Note: In production, pass actual user_id. Using hash as fallback.
        except Exception:
            pass

    context_str = "\n".join(retrieved_chunks) if retrieved_chunks else "No report text retrieved."

    user_message = f"""User Question: {question}

Recent Biomarker Data (latest first):
{biomarker_str}

Relevant Report Context:
{context_str}

Please answer the question based on this data."""

    client = get_client()
    response = await client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": DOCTOR_SYSTEM_PROMPT if doctor_mode else SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
        temperature=0.3,
        max_tokens=800,
    )
    return response.choices[0].message.content

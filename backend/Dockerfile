FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y gcc libpq-dev && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

# Install CPU-only PyTorch
RUN pip install --no-cache-dir torch==2.3.1 torchvision==0.18.1 \
    --index-url https://download.pytorch.org/whl/cpu

# Install the remaining dependencies
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p uploads chroma_db

EXPOSE 8000

CMD ["sh", "-c", "python download_ecg_model.py && exec uvicorn app.main:app --host 0.0.0.0 --port 8000"]
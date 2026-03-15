FROM python:3.12-slim

RUN pip install --no-cache-dir \
    mem0ai \
    qdrant-client \
    uvicorn \
    fastapi

COPY server.py /app/server.py

WORKDIR /app
EXPOSE 8000

CMD ["python", "server.py"]

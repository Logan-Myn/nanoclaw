"""
Lightweight Mem0 REST server.
Wraps the mem0ai Python library in a FastAPI app with the same
/v1/memories/ endpoints that our agent skill and auto-injector expect.
"""

import os
from fastapi import FastAPI
from pydantic import BaseModel
from mem0 import Memory

# Build config from environment variables.
# Both LLM and embedder use OpenRouter (OpenAI-compatible API) with the same key.
api_key = os.environ.get("LLM_API_KEY", "")
base_url = os.environ.get("LLM_OPENAI_BASE_URL", "")

config = {
    "llm": {
        "provider": "openai",
        "config": {
            "model": os.environ.get("LLM_MODEL", "google/gemma-3-4b-it"),
            "api_key": api_key,
            "openai_base_url": base_url,
        },
    },
    "embedder": {
        "provider": "openai",
        "config": {
            "model": os.environ.get(
                "EMBEDDER_MODEL", "openai/text-embedding-3-small"
            ),
            "api_key": api_key,
            "openai_base_url": base_url,
        },
    },
    "vector_store": {
        "provider": "qdrant",
        "config": {
            "host": os.environ.get("QDRANT_HOST", "qdrant"),
            "port": int(os.environ.get("QDRANT_PORT", "6333")),
            "collection_name": "nanoclaw",
        },
    },
}

memory = Memory.from_config(config)
app = FastAPI(title="Mem0 Server", version="1.0.0")


# --- Request/Response Models ---


class AddMemoryRequest(BaseModel):
    messages: list[dict]
    user_id: str | None = None
    agent_id: str | None = None
    metadata: dict | None = None


class SearchRequest(BaseModel):
    query: str
    user_id: str | None = None
    agent_id: str | None = None
    limit: int = 5


# --- Endpoints ---


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/v1/memories/")
def add_memory(req: AddMemoryRequest):
    kwargs = {}
    if req.user_id:
        kwargs["user_id"] = req.user_id
    if req.agent_id:
        kwargs["agent_id"] = req.agent_id
    if req.metadata:
        kwargs["metadata"] = req.metadata

    result = memory.add(req.messages, **kwargs)
    return result


@app.post("/v1/memories/search/")
def search_memories(req: SearchRequest):
    kwargs = {"limit": req.limit}
    if req.user_id:
        kwargs["user_id"] = req.user_id
    if req.agent_id:
        kwargs["agent_id"] = req.agent_id

    results = memory.search(req.query, **kwargs)
    return results


@app.get("/v1/memories/")
def list_memories(user_id: str | None = None, agent_id: str | None = None):
    kwargs = {}
    if user_id:
        kwargs["user_id"] = user_id
    if agent_id:
        kwargs["agent_id"] = agent_id

    results = memory.get_all(**kwargs)
    return results


@app.delete("/v1/memories/{memory_id}")
def delete_memory(memory_id: str):
    memory.delete(memory_id)
    return {"status": "deleted"}


@app.delete("/v1/memories/")
def delete_all_memories(user_id: str | None = None, agent_id: str | None = None):
    kwargs = {}
    if user_id:
        kwargs["user_id"] = user_id
    if agent_id:
        kwargs["agent_id"] = agent_id

    memory.delete_all(**kwargs)
    return {"status": "deleted"}


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)

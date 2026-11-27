import os
from dotenv import load_dotenv

# Nạp ai/.env TRƯỚC khi import các service — embedding_service đọc os.environ
# ngay ở cấp module (GEMINI_API_KEY, GEMINI_EMBEDDING_MODEL...).
load_dotenv()

import hmac
import math

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator, model_validator
from typing import List

from app.services.embedding_service import generate_embedding
from app.services.matching_service import calculate_cosine_similarity

app = FastAPI(
    title="Smart Recruit AI Service",
    description="AI embedding & matching service. Powered by Gemini Embedding (gemini-embedding-001, 768 dims). Note: Gemini 3.6 Flash is a generative model, not used for embeddings.",
    version="2.1.0",
)


# ─── Xác thực bằng khoá dùng chung ────────────────────────────────────────────
# Đặt AI_API_KEY ở cả AI service và backend: mọi request (trừ /health và /) phải
# kèm header X-AI-API-Key. Không đặt thì service mở như trước — chỉ nên vậy khi
# AI service không public ra Internet.
AI_API_KEY = os.environ.get("AI_API_KEY", "").strip()
PUBLIC_PATHS = {"/", "/health", "/docs", "/openapi.json"}


@app.middleware("http")
async def require_api_key(request: Request, call_next):
    if AI_API_KEY and request.url.path not in PUBLIC_PATHS:
        given = request.headers.get("x-ai-api-key", "")
        if not hmac.compare_digest(given.encode(), AI_API_KEY.encode()):
            return JSONResponse(status_code=401, content={"detail": "Thiếu hoặc sai X-AI-API-Key"})
    return await call_next(request)


# Lỗi 422 mặc định trả lại cả `input` — với vector chứa NaN thì chính bước dựng
# JSON lỗi lại crash 500. Chỉ trả vị trí và thông báo.
@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    errors = [{"loc": list(e.get("loc", [])), "msg": str(e.get("msg", ""))} for e in exc.errors()]
    return JSONResponse(status_code=422, content={"detail": errors})


# ─── Health Check ─────────────────────────────────────────────────────────────
@app.get("/health")
def health_check():
    """Endpoint cho Render uptime monitor và Backend kiểm tra AI còn sống không."""
    api_key_set = bool(os.environ.get("GEMINI_API_KEY"))
    model = os.environ.get("GEMINI_EMBEDDING_MODEL", "models/gemini-embedding-001")
    dims = int(os.environ.get("GEMINI_EMBEDDING_DIMS", "768"))
    return {
        "status": "ok" if api_key_set else "degraded",
        "model": model,
        "dimensions": dims,
        "gemini_key_configured": api_key_set,
        "note": "Use gemini-embedding-* for vectors; gemini-3.6-flash is generative only",
    }


@app.get("/")
def read_root():
    return {"status": "AI Service is online", "version": "2.0.0 (Gemini API)"}


# ─── Request Models ───────────────────────────────────────────────────────────
MAX_TEXT_CHARS = 10_000
MAX_VECTOR_DIMS = 4096


class TextRequest(BaseModel):
    # Text rỗng vẫn gọi Gemini (tốn quota, vector vô nghĩa); text 200k ký tự thì
    # vượt giới hạn của model. Chặn cả hai bằng 422 rõ ràng.
    text: str = Field(min_length=1, max_length=MAX_TEXT_CHARS)

    @field_validator("text")
    @classmethod
    def not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("text không được để trống")
        return v


class MatchingRequest(BaseModel):
    cv_vector: List[float] = Field(min_length=1, max_length=MAX_VECTOR_DIMS)
    job_vector: List[float] = Field(min_length=1, max_length=MAX_VECTOR_DIMS)

    @field_validator("cv_vector", "job_vector")
    @classmethod
    def finite(cls, v: List[float]) -> List[float]:
        if not all(math.isfinite(x) for x in v):
            raise ValueError("vector chứa NaN hoặc Infinity")
        return v

    @model_validator(mode="after")
    def same_length(self):
        if len(self.cv_vector) != len(self.job_vector):
            raise ValueError("hai vector phải cùng số chiều")
        return self


# ─── Endpoints ────────────────────────────────────────────────────────────────
@app.post("/get-embedding")
def get_embedding_endpoint(request: TextRequest):
    # `def` (không phải `async def`): generate_embedding gọi Gemini đồng bộ, đặt
    # trong async def là chặn cả event loop — 20 request chạy tuần tự. FastAPI
    # chạy hàm `def` trong threadpool nên các request song song không nghẽn nhau.
    """
    Tạo vector embedding từ text.
    
    - Trả về list 768 float nếu thành công.
    - Trả về {"embedding": null, "error": "..."} nếu Gemini rate limit hoặc lỗi.
    - Không tính phí khi rate limit — chỉ báo lỗi 429.
    """
    vector = generate_embedding(request.text)
    if vector is None:
        return {"embedding": None, "error": "Embedding thất bại. Có thể do rate limit hoặc GEMINI_API_KEY chưa cấu hình."}
    return {"embedding": vector, "dimensions": len(vector)}


@app.post("/calculate-matching")
def calculate_matching_endpoint(request: MatchingRequest):
    """Tính cosine similarity giữa vector CV và vector Job Description."""
    score = calculate_cosine_similarity(request.cv_vector, request.job_vector)
    return {"score": score}
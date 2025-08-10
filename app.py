# app.py

import os
import uuid
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
if not GEMINI_API_KEY:
    raise RuntimeError("Falta GEMINI_API_KEY")
MODEL_NAME = os.getenv("GENAI_MODEL", "gemini-1.5-flash")
genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel(
    MODEL_NAME,
    system_instruction=(
        "Eres TARS, un asistente conversacional en tiempo real. "
        "Respondes breve, claro y útil, en español por defecto. "
        "Si no estás seguro, pregunta y propone opciones."
    ),
)
# ...

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

sessions = {}

# --- Endpoint para servir el index.html ---
@app.get("/", response_class=HTMLResponse)
async def read_root():
    # index.html en una carpeta llamada 'static'
    with open("static/index.html") as f:
        return HTMLResponse(content=f.read(), status_code=200)

# --- RUTAS DE API ---
@app.get("/session")
def new_session():
    sid = str(uuid.uuid4())
    sessions[sid] = model.start_chat(history=[])
    return {"sessionId": sid}

@app.post("/chat/stream")
async def chat_stream(req: Request):
    # ... (código de chat_stream) ...
    body = await req.json()
    text = (body.get("message") or "").strip()
    sid = body.get("sessionId")
    if not text:
        return JSONResponse({"error": "message is required"}, status_code=400)
    if not sid or sid not in sessions:
        sid = sid or str(uuid.uuid4())
        sessions[sid] = model.start_chat(history=[])

    chat = sessions[sid]

    def generate():
        try:
            response = chat.send_message(text, stream=True)
            for chunk in response:
                if getattr(chunk, "text", None):
                    yield chunk.text
            response.resolve()
        except Exception as e:
            yield f"\n[error] {e}"

    headers = {"X-Session-Id": sid}
    return StreamingResponse(generate(), media_type="text/plain; charset=utf-8", headers=headers)

# --- Montar el directorio estático ---
# Esto permite que cualquier otro archivo (CSS, JS, imágenes) en la carpeta 'static'
# sea accesible directamente. Aunque tu JS/CSS está en el HTML, es una buena práctica.
app.mount("/", StaticFiles(directory="static", html = True), name="static")

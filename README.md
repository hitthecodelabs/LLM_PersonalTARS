# TARS — Web Assistant (FastAPI + Gemini)

**TARS** es un asistente personal web con entrada por voz (STT), salida por voz (TTS) y streaming de respuestas desde un modelo de lenguaje (Google Gemini).  
Incluye una UI moderna (HTML/CSS/JS) que hace `POST /chat/stream` y reproduce la respuesta mientras llega.

---

## 🔎 Características principales

- Interfaz web responsiva con control por voz (presionar para hablar).
- Reconocimiento de voz (SpeechRecognition / Web Speech API) y visualización de la onda de audio (WebAudio).
- Text-to-Speech usando `speechSynthesis` del navegador, selector de voz y control de volumen.
- Streaming de respuestas desde el backend (FastAPI) que consume la API de Gemini.
- Manejo simple de sesiones (sessionId) para mantener contexto por usuario.
- Diseño pensado para demo / prototipo y tests locales.

---

## 🧱 Estructura del repo (resumen)

```
.
├─ app.py                 # FastAPI backend
├─ requirements.txt
├─ static/
│  ├─ index.html
│  ├─ css/styles.css
│  └─ js/main.js
└─ README.md (generado desde README_MD)
```

---

## 🔑 Requisitos / Dependencias

- Python 3.10+
- Dependencias en `requirements.txt` (FastAPI, uvicorn, google-genai, python-dotenv, etc.)
- Navegador moderno con Web Speech API para STT/TTS (Chrome/Edge recomendado)

Instalar dependencias:

```bash
python -m venv .venv
source .venv/bin/activate   # o .venv\Scripts\activate en Windows
pip install -r requirements.txt
```

---

## ⚙️ Variables de entorno

Crea un archivo `.env` en la raíz con al menos:

```
GEMINI_API_KEY=tu_api_key_de_gemini
# Opcional: elegir el modelo
GENAI_MODEL=gemini-2.5-flash-lite
```

> **IMPORTANTE**: No subas `.env` al repositorio. Añade `.env` a `.gitignore`.

El backend busca `GEMINI_API_KEY` o `GOOGLE_API_KEY`. Si no está definida, la aplicación falla al arrancar.

---

## 🚀 Ejecutar en desarrollo

```bash
uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

Abre tu navegador en `http://localhost:8000`.

---

## 🧾 API (endpoints relevantes)

- `GET /`  
  Sirve la UI (`static/index.html`).

- `GET /session`  
  Crea y devuelve un nuevo `sessionId` (JSON):  
  ```json
  { "sessionId": "uuid-..." }
  ```

- `POST /chat/stream`  
  Envía `{ "message": "texto", "sessionId": "uuid-..." }`.  
  Devuelve una respuesta en *stream* (texto plano) y header `X-Session-Id` con el sessionId (puede crear uno nuevo si no existe).

**Nota sobre sesiones:** las sesiones se guardan en memoria (`sessions = {}`) y contienen el chat state del cliente (model.start_chat). Para producción usa un store persistente (Redis, DB) o rehacer para stateless.

---

## 🛠️ Correcciones y comportamiento importante

- **Duplicado en transcripción / respuestas**  
  Si veías que el texto se repetía en el UI (tanto tu transcripción como la respuesta del asistente), se corrigió:
  - STT acumula `finalTranscript` y agrega `interim` por separado para evitar re-apéndices.
  - Streaming AI usa dos buffers distintos: uno para mostrar (`displayed`) y otro (`sentenceBuffer`) para detectar oraciones completas y enviarlas a TTS. Esto evita que el mismo texto se agregue dos veces.

---

## 🔒 Seguridad y producción

- **No permitir `CORS: *` en producción.** En `app.add_middleware(CORSMiddleware, allow_origins=["*"], ...)` cambie a orígenes confiables.
- **Protege tu API key**:
  - No incluir la clave en el cliente.
  - Considera un proxy o un backend que limite peticiones por usuario y registre cuotas.
- **HTTPS**: usar TLS en producción (reverse proxy con nginx / Cloudflare).
- **Escalado**: la implementación actual guarda estado en memoria. Para **scalado horizontal**:
  - Usa Redis para guardar estado de conversación o usa un mecanismo stateless (re-enviar historial).
  - Ejecuta múltiples workers (gunicorn + uvicorn workers) detrás de un balanceador.

---

## 🐳 Docker (sugerencia)

`Dockerfile` simple:

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
ENV PYTHONUNBUFFERED=1
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
```

Construir y ejecutar:

```bash
docker build -t tars-web .
docker run -e GEMINI_API_KEY="$GEMINI_API_KEY" -p 8000:8000 tars-web
```

---

## ⚠️ Limitaciones y costes

- Gemini (u otro modelo) puede tener **costos** por uso; monitoriza la facturación.
- Latencia y tasa de requests dependen del modelo elegido y del plan.
- La app actual usa streaming de texto; si quieres streaming de audio TTS desde el modelo (audio binario) necesitarás adaptar el backend y el frontend.

---

## ✅ Recomendaciones para mejoras

- Guardar historial de conversaciones en DB (por usuario) con opciones de expiración.
- Autenticación y control de acceso (API tokens, OAuth2).
- Reemplazar la persistencia en memoria por Redis para soportar múltiples instancias.
- Implementar WebSockets/SSE mejor integradas para control de estado y reconexión.
- Añadir tests automáticos (unit + integration).
- Integrar un mecanismo de backoff / retry ante errores de la API de Gemini.

---

## 🧪 Debug / Troubleshooting

- Si `GET /session` falla, revisa que `GEMINI_API_KEY` esté en `.env` y `python-dotenv` cargue las variables.
- Si no hay voces en TTS, prueba otro navegador o revisa `speechSynthesis.getVoices()`.
- Si la UI muestra repetidos, actualiza a la versión que separa finalTranscript y sentenceBuffer (ya corregido).
- Ver logs del backend para errores relacionados con streaming. Algunas excepciones de terminación de stream se manejan (p. ej. `InvalidOperation`).

---

## 📄 Licencia

MIT — libre para usar y adaptar. Incluye atribución si se usa en demos públicas.

---

## ✨ Créditos & Contacto

Proyecto creado como demo de integración entre **FastAPI** y **Gemini (Google generative AI)** con una UI orientada a demos/POCs.  
Si quieres que lo adapte a un entorno productivo o haga integración de audio streaming (voz generada por backend), házmelo saber.

---

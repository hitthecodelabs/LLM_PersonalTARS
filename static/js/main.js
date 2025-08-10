/* static/js/main.js */

const API_BASE = "http://localhost:8000";
let sessionId = localStorage.getItem("sessionId");
const historyEl = document.getElementById('history');
const sessionPreview = document.getElementById('sessionIdPreview');
const sessionDebug = document.getElementById('sessionDebug');
const copyBtn = document.getElementById('copySession');

function setSessionUI(id){
  sessionId = id;
  localStorage.setItem("sessionId", id);
  sessionPreview.textContent = "session: " + (id ? id.slice(0,8) + "…" : "—");
  sessionDebug.textContent = "sessionId: " + (id || "—");
}

async function ensureSession(){
  if (!sessionId){
    try{
      const r = await fetch(`${API_BASE}/session`);
      const j = await r.json();
      setSessionUI(j.sessionId);
    }catch(e){
      console.warn("No se pudo crear session:", e);
    }
  } else { setSessionUI(sessionId); }
}
ensureSession();

/* === helpers: mensajes en UI === */
function appendMessage(text, who="ai", opts={}){
  const el = document.createElement('div');
  el.className = 'msg ' + (who==='user' ? 'user' : 'ai');
  el.textContent = text;
  if (opts.small) el.style.fontSize = '0.95rem';
  historyEl.appendChild(el);
  historyEl.scrollTop = historyEl.scrollHeight;
  return el;
}

/* === STT & UI integration (corrección para duplicado) === */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null, recognizing = false;
if (SR) {
  recognition = new SR();
  recognition.lang = "es-ES";
  recognition.interimResults = true;
  recognition.continuous = true;
  recognition.maxAlternatives = 1;
}

/* mic / waveform (WebAudio) */
let audioStream = null, audioCtx = null, analyser = null, dataArray = null, rafId = null;
const canvas = document.getElementById('wave');
const canvasCtx = canvas.getContext('2d');

function startMeter(){
  if (!navigator.mediaDevices || !recognition) return;
  navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
    audioStream = stream;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const src = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
    const bufferLength = analyser.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);
    drawWave();
  }).catch(err => {
    console.warn("no permiso mic:", err);
  });
}
function stopMeter(){
  if (rafId) cancelAnimationFrame(rafId);
  if (audioStream) {
    audioStream.getTracks().forEach(t=>t.stop());
    audioStream = null;
  }
  if (audioCtx){ audioCtx.close().catch(()=>{}); audioCtx=null; }
  clearCanvas();
}
function clearCanvas(){
  canvasCtx.clearRect(0,0,canvas.width,canvas.height);
}
function drawWave(){
  if (!analyser) return;
  analyser.getByteTimeDomainData(dataArray);
  const w = canvas.width = canvas.clientWidth * devicePixelRatio;
  const h = canvas.height = canvas.clientHeight * devicePixelRatio;
  canvasCtx.fillStyle = "rgba(0,0,0,0)";
  canvasCtx.clearRect(0,0,w,h);

  canvasCtx.lineWidth = 2 * devicePixelRatio;
  canvasCtx.strokeStyle = "rgba(0,240,255,0.85)";
  canvasCtx.beginPath();
  const slice = dataArray.length;
  for (let i=0;i<slice;i++){
    const v = dataArray[i] / 128.0;
    const y = v * h/2;
    const x = i/slice * w;
    if (i===0) canvasCtx.moveTo(x,y);
    else canvasCtx.lineTo(x,y);
  }
  canvasCtx.stroke();

  rafId = requestAnimationFrame(drawWave);
}

/* TTS voices list + controls */
const voicesSelect = document.getElementById('voices');
const volRange = document.getElementById('vol');
let voices = [], chosenVoice = null;
function populateVoices(){
  voices = speechSynthesis.getVoices();
  voicesSelect.innerHTML = '';
  voices.forEach((v,i)=>{
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = `${v.name} — ${v.lang}`;
    voicesSelect.appendChild(opt);
  });
  chosenVoice = voices.find(v=>v.lang.toLowerCase().startsWith('es')) || voices[0] || null;
  if (chosenVoice) {
    const idx = voices.indexOf(chosenVoice);
    voicesSelect.value = idx;
  }
}
speechSynthesis.onvoiceschanged = populateVoices;
populateVoices();

voicesSelect.addEventListener('change', ()=> {
  chosenVoice = voices[voicesSelect.value];
});

/* speak / stopSpeak */
let speaking = false;
function speak(text){
  if (!text || !window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = chosenVoice?.lang || "es-ES";
  if (chosenVoice) u.voice = chosenVoice;
  u.volume = parseFloat(volRange.value || "1");
  u.rate = 1.0; u.pitch = 1.0;
  speaking = true;
  u.onend = ()=> speaking=false;
  speechSynthesis.speak(u);
}
document.getElementById('stopSpeak').addEventListener('click', ()=> { if(window.speechSynthesis) speechSynthesis.cancel(); });

/* boton copiar session */
copyBtn.addEventListener('click', async ()=> {
  if (!sessionId) return;
  try { await navigator.clipboard.writeText(sessionId); copyBtn.textContent = "Copiado"; setTimeout(()=>copyBtn.textContent="Copiar",1200); } catch(e){ console.warn(e); }
});

/* limpiar chat */
document.getElementById('clearChat').addEventListener('click', ()=> { historyEl.innerHTML=''; });

/* mic button + corrected STT flow */
const micBtn = document.getElementById('micBtn');
const statusEl = document.getElementById('status');
const metaEl = document.getElementById('meta');
const typingIndicator = document.getElementById('typingIndicator');

micBtn.addEventListener('mousedown', startListening);
micBtn.addEventListener('touchstart', (e)=>{ e.preventDefault(); startListening(); }, {passive:false});
document.addEventListener('mouseup', stopListening);
document.addEventListener('touchend', stopListening);

let currentUserBubble = null;
function startListening(){
  if (!recognition) {
    statusEl.textContent = "STT no soportado";
    return;
  }
  stopSpeaking();
  if (recognizing) return;
  recognizing = true;
  micBtn.classList.add('listening');
  statusEl.textContent = "escuchando...";
  metaEl.textContent = "suelta para enviar";
  currentUserBubble = appendMessage("", "user");

  // IMPORTANT: keep a separate accumulator to avoid re-appending already-final text
  let finalTranscript = "";

  startMeter();
  recognition.onresult = (e) => {
    let interim = "";
    for (let i=e.resultIndex;i<e.results.length;i++){
      const res = e.results[i];
      if (res.isFinal) {
        finalTranscript += res[0].transcript + " ";
      } else {
        interim += res[0].transcript;
      }
    }
    // set bubble as: finalTranscript + (interim in parentheses)
    currentUserBubble.textContent = (finalTranscript + (interim ? ` (${interim})` : "")).trim();
    historyEl.scrollTop = historyEl.scrollHeight;
  };
  recognition.onerror = (e) => {
    statusEl.textContent = `error STT: ${e.error}`;
    metaEl.textContent = "";
    recognition.stop();
    stopMeter();
    micBtn.classList.remove('listening');
    recognizing = false;
  };
  recognition.start();
}

function stopListening(){
  if (!recognition || !recognizing) return;
  recognizing = false;
  micBtn.classList.remove('listening');
  statusEl.textContent = "pensando...";
  metaEl.textContent = "";
  recognition.onend = async () => {
    stopMeter();
    const text = (currentUserBubble && currentUserBubble.textContent || "").trim();
    if (text) {
      await streamAI(text);
    } else {
      statusEl.textContent = "sin entrada";
    }
  };
  recognition.stop();
}

/* === streaming handler (corregido para evitar duplicados) === */
async function streamAI(message){
  await ensureSession();
  // create AI bubble
  const aiBubble = appendMessage("", "ai");
  typingIndicator.style.visibility = 'visible';

  if (speechSynthesis.speaking) speechSynthesis.cancel();

  let res;
  try {
    res = await fetch(`${API_BASE}/chat/stream`, {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ message, sessionId })
    });
  } catch(e){
    aiBubble.textContent = "Error conectando al servidor.";
    statusEl.textContent = "listo";
    typingIndicator.style.visibility = 'hidden';
    return;
  }

  const sidHeader = res.headers.get("X-Session-Id");
  if (sidHeader && sidHeader !== sessionId) setSessionUI(sidHeader);

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let displayed = "";       // lo que se muestra en el bubble (se construye incrementalmente)
  let sentenceBuffer = "";  // buffer para extraer oraciones completas para TTS

  // extrae oraciones completas del sentenceBuffer y las envía a TTS,
  // sin volver a añadirlas al 'displayed' (evita duplicado).
  function flushSentencesForTTS(){
    // regex que captura "texto + puntuación + espacio opcional"
    const sentenceRegex = /([^\.\!\?\…]+[\.\!\?\…]+\s*)/;
    let m = sentenceBuffer.match(sentenceRegex);
    while (m) {
      const sentence = m[0].trim();
      if (sentence) {
        // solo TTS (no append al displayed porque ya está mostrado)
        speak(sentence);
      }
      // quitar la parte ya procesada
      sentenceBuffer = sentenceBuffer.slice(m[0].length);
      m = sentenceBuffer.match(sentenceRegex);
    }
  }

  while(true){
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream:true });

    // 1) Mostrar stream en UI (carácter por carácter)
    displayed += chunk;
    aiBubble.textContent = displayed;

    // 2) Acumular para detectar oraciones completas y hablarlas
    sentenceBuffer += chunk;
    flushSentencesForTTS();

    historyEl.scrollTop = historyEl.scrollHeight;
  }

  // Si quedó texto sin puntuación final, hablarlo de una vez
  if (sentenceBuffer.trim()){
    speak(sentenceBuffer.trim());
    sentenceBuffer = "";
  }

  statusEl.textContent = "listo";
  typingIndicator.style.visibility = 'hidden';

  // actualizar session si hay header
  const sid2 = res.headers.get("X-Session-Id");
  if (sid2 && sid2 !== sessionId) setSessionUI(sid2);
}

/* stop any ongoing speech function */
function stopSpeaking(){ if (window.speechSynthesis) speechSynthesis.cancel(); }

/* ensure voices ready */
window.addEventListener('load', ()=> {
  try{ populateVoices(); }catch(e){}
});

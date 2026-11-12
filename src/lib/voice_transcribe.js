export async function transcribeAudio(buffer, mime) {
  const key = String(process.env.GROQ_API_KEY || '').trim();
  if (!key) return { ok: false, reason: 'no_key' };
  if (!buffer || !buffer.length) return { ok: false, reason: 'empty' };
  try {
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: mime || 'audio/webm' }), 'voz.webm');
    form.append('model', 'whisper-large-v3-turbo');
    form.append('language', 'es');
    const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, reason: `http_${r.status}`, detail: data?.error?.message || '' };
    const text = String(data.text || '').trim();
    if (!text) return { ok: false, reason: 'empty_text' };
    return { ok: true, text: text.slice(0, 4000) };
  } catch (err) {
    return { ok: false, reason: 'network', detail: err?.message || '' };
  }
}

export async function transcribeWithGemini(buffer, mime) {
  const key = String(process.env.GEMINI_API_KEY || '').trim();
  if (!key) return { ok: false, reason: 'no_key' };
  if (!buffer || !buffer.length) return { ok: false, reason: 'empty' };
  const model = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
  const body = {
    contents: [{
      parts: [
        { text: 'Transcribe literalmente este audio en español. Devuelve solo el texto dictado, sin comentarios.' },
        { inline_data: { mime_type: mime || 'audio/webm', data: Buffer.from(buffer).toString('base64') } }
      ]
    }]
  };
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, reason: `http_${r.status}`, detail: data?.error?.message || '' };
    const text = (data?.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join(' ').trim();
    if (!text) return { ok: false, reason: 'empty_text' };
    return { ok: true, text: text.slice(0, 4000), provider: 'gemini' };
  } catch (err) {
    return { ok: false, reason: 'network', detail: err?.message || '' };
  }
}

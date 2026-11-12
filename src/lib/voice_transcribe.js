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

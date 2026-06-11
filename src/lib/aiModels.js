// ============================================
// CASHLO AI — Central free-model registry
// Server-only. All calls use HUGGINGFACE_API_KEY via the HF router/inference.
// ============================================

const HF_CHAT_URL = 'https://router.huggingface.co/v1/chat/completions';
const HF_IMAGE_URL = (model) => `https://router.huggingface.co/hf-inference/models/${model}`;

// Text/agentic chain — ordered by quality for Indonesian + tool-calling.
export const CHAT_MODELS = [
    'google/gemma-3-27b-it',           // strong Indonesian, vision-capable
    'Qwen/Qwen2.5-72B-Instruct',       // best open tool-calling
    'meta-llama/Llama-3.3-70B-Instruct',
];

// Image chain — FLUX.1-schnell (Apache 2.0) first, ByteDance SDXL-Lightning fallback.
export const IMAGE_MODELS = [
    'black-forest-labs/FLUX.1-schnell',
    'ByteDance/SDXL-Lightning',
    'stabilityai/stable-diffusion-xl-base-1.0',
];

export function hasAIKey() {
    return !!process.env.HUGGINGFACE_API_KEY;
}

// Chat completion with model fallback. Returns { content, model } or throws.
export async function callChat(messages, { maxTokens = 1536, temperature = 0.4 } = {}) {
    const apiKey = process.env.HUGGINGFACE_API_KEY;
    if (!apiKey) throw new Error('HUGGINGFACE_API_KEY not set');

    let lastError = null;
    for (const model of CHAT_MODELS) {
        try {
            const res = await fetch(HF_CHAT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
                body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature }),
            });
            const data = await res.json();
            if (data.error) { lastError = data.error?.message || JSON.stringify(data.error); continue; }
            const content = data.choices?.[0]?.message?.content;
            if (content) return { content, model };
        } catch (e) {
            lastError = e.message;
        }
    }
    throw new Error('Semua model AI tidak tersedia: ' + (lastError || 'unknown'));
}

// Text-to-image with model fallback. Returns { dataUrl, model } or throws.
// Free tier: a few hundred images/month — fine for a coffee shop's promos.
export async function generateImage(prompt, { negativePrompt = '' } = {}) {
    const apiKey = process.env.HUGGINGFACE_API_KEY;
    if (!apiKey) throw new Error('HUGGINGFACE_API_KEY not set');

    let lastError = null;
    for (const model of IMAGE_MODELS) {
        try {
            const res = await fetch(HF_IMAGE_URL(model), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
                body: JSON.stringify({
                    inputs: prompt,
                    parameters: negativePrompt ? { negative_prompt: negativePrompt } : undefined,
                }),
            });
            if (!res.ok) {
                lastError = `${model}: HTTP ${res.status}`;
                continue;
            }
            const contentType = res.headers.get('content-type') || '';
            if (!contentType.startsWith('image/')) {
                const body = await res.text();
                lastError = `${model}: ${body.slice(0, 120)}`;
                continue;
            }
            const buf = Buffer.from(await res.arrayBuffer());
            return { dataUrl: `data:${contentType};base64,${buf.toString('base64')}`, model };
        } catch (e) {
            lastError = e.message;
        }
    }
    throw new Error('Semua model gambar tidak tersedia: ' + (lastError || 'unknown'));
}

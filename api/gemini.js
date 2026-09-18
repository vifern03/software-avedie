const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models/";
// Modelos estables (https://ai.google.dev/gemini-api/docs/models, consultado 18/09/2026).
// Extracción de facturas: gemini-2.5-pro con thinkingBudget 128 → 17–22 s y 25/25 campos
// en las facturas de prueba. "flash" solo se usa si el llamante lo pide expresamente.
const MODELOS = { pro: "gemini-2.5-pro", flash: "gemini-2.5-flash" };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Reintentos limitados por un PRESUPUESTO TOTAL de tiempo (presupuestoMs): cada
 * intento solo dispone del tiempo que queda y no se reintenta si no quedan al
 * menos 8 s. Así la espera total nunca supera el presupuesto.
 */
async function callGeminiWithRetry(apiKey, body, maxAttempts = 3, url = GEMINI_BASE + MODELOS.pro + ":generateContent", presupuestoMs = 165000) {
  let lastError;
  let isRateLimit = false;
  const fin = Date.now() + presupuestoMs;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      const base = isRateLimit ? 10000 : 2000;
      const delay = Math.min(base * Math.pow(2, attempt - 1) + Math.random() * 1000, 4000);
      if (fin - Date.now() < delay + 8000) break; // no cabe otro intento útil
      await sleep(delay);
    }
    isRateLimit = false;
    const restante = fin - Date.now();
    if (restante < 8000) break;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.min(55000, restante));

    try {
      const response = await fetch(`${url}?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.status === 429 || response.status === 503) {
        isRateLimit = true;
        lastError = new Error(`Google ${response.status}`);
        continue;
      }

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini error ${response.status}: ${errText.slice(0, 200)}`);
      }

      return await response.json();

    } catch (err) {
      clearTimeout(timeout);

      if (err.name === "AbortError") {
        lastError = new Error(`Tiempo agotado en el intento ${attempt + 1}`);
        continue;
      }

      throw err;
    }
  }

  lastError = lastError || new Error("Presupuesto de tiempo agotado");
  throw lastError;
}

// Sube el límite de body a 10 MB (Vercel/Next.js API routes)
export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb",
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "API key no configurada" });
  }

  try {
    const { text, history = [], file, json = false, modelo = "pro", thinkingBudget, presupuestoMs } = req.body;

    const contents = history.map((msg) => {
      if (msg.parts) return msg;
      return { role: msg.role, parts: [{ text: msg.content }] };
    });

    const currentParts = [];
    if (file?.data && file?.mimeType) {
      currentParts.push({
        inlineData: { mimeType: file.mimeType, data: file.data },
      });
    }
    if (text) {
      currentParts.push({ text });
    }
    contents.push({ role: "user", parts: currentParts });

    // Gemini 2.5 Pro consume parte de maxOutputTokens en razonamiento interno
    // ("thinking"): con 8192 las facturas con muchas líneas llegaban truncadas.
    // json:true pide salida application/json nativa (sin markdown).
    const geminiBody = {
      contents,
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 32768,
        ...(json ? { responseMimeType: "application/json" } : {}),
        ...(Number.isInteger(thinkingBudget) ? { thinkingConfig: { thinkingBudget } } : {}),
      },
    };
    const url = GEMINI_BASE + (MODELOS[modelo] || MODELOS.pro) + ":generateContent";

    const presupuesto = Number.isFinite(presupuestoMs) ? Math.max(8000, Math.min(presupuestoMs, 165000)) : 165000;
    const data = await callGeminiWithRetry(apiKey, geminiBody, 3, url, presupuesto);

    // Gemini 2.5 Pro devuelve partes de "thinking" con { thought: true }.
    // Tomamos la primera parte que NO sea thinking para obtener el texto real.
    const candidate = data?.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];
    const responseText = parts.filter((p) => !p.thought).map((p) => p.text || "").join("");

    if (!responseText) {
      throw new Error("Respuesta vacía del modelo.");
    }
    if (candidate?.finishReason === "MAX_TOKENS") {
      // No devolver JSON cortado como si fuera válido.
      return res.status(502).json({
        error: "La respuesta de la IA llegó incompleta (límite de longitud). Introduce los datos manualmente o inténtalo de nuevo.",
        retryable: true,
      });
    }

    return res.status(200).json({ response: responseText });

  } catch (err) {
    console.error("[gemini-proxy] Error tras reintentos:", err.message);

    return res.status(503).json({
      error:
        "El servicio de IA no está disponible en este momento. Por favor, introduce los datos manualmente o inténtalo de nuevo en unos segundos.",
      retryable: true,
    });
  }
}

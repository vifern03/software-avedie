const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models/";
// Modelos estables (https://ai.google.dev/gemini-api/docs/models, consultado 30/09/2026).
// Extracción de facturas (estudio de 30/09/2026 sobre 6 facturas reales de luz y gas,
// con la config de la app: temperature 0, JSON nativo y thinkingBudget 128):
//   gemini-3.8-flash       100% campos · 1,6 s · $0,0045 comparativa 2.0  ← elegido
//   gemini-3.5-flash       100% campos · 1,4 s · $0,0093  (el doble de caro, igual resultado)
//   gemini-2.5-flash       100% campos · 3,2 s · $0,0021  (generación anterior, el doble de lento)
//   gemini-3.5-flash-lite  1,4 s y $0,0020, pero se deja componentes del término fijo
//                          cuando la comercializadora lo parte en varias líneas
//   gemini-3-flash-preview buen resultado, pero es preview y sin tope de razonamiento
//                          se dispara a 88 s y 31.458 tokens
//   gemini-2.5-pro         100% campos · 5,3 s · $0,0081  (lo que se usaba antes)
// El precio de 3.8-flash es promocional hasta el 31/12/2026; en enero se dobla y se
// igualaría con 3.5-flash, momento de revisar esta elección.
// Comparativa 3.0TD / 6.1TD (estudio de 30/09/2026 sobre 3 facturas reales, 15 tandas
// por modelo, con el prompt acotado de extraccion.js):
//   gemini-3.8-flash       100% campos · 3,3 s · $0,0042  ← elegido
//   gemini-3.5-flash       100% campos · 2,8 s · $0,0090  (el doble de caro, igual resultado)
//   gemini-3.1-flash-lite  100% campos · 3,6 s · $0,0015  (solo tras endurecer el prompt)
//   gemini-3.5-flash-lite  toma la base imponible por "otros servicios" · $0,0021
//   gemini-2.5-flash       lee una O por un 0 en el CUPS · 4,3 s · $0,0021
//   gemini-2.5-pro         mismos dos fallos · 7,5 s · $0,0079  (lo que se usaba antes)
// Con cualquier modelo, 1 de cada 6 llamadas tarda más de 7 s y alguna se queda sin
// responder: de ahí la llamada de relevo (relevoMs).
const MODELOS = { pro: "gemini-2.5-pro", flash: "gemini-3.8-flash" };

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

/**
 * Llamada con relevo: si la primera petición no ha contestado en `relevoMs`, se lanza
 * una segunda en paralelo y se devuelve la primera que responda bien. Acota la espera
 * cuando una llamada sale lenta o se queda colgada, a cambio de pagar dos llamadas
 * en esos casos. Si la primera falla antes, el relevo sale de inmediato.
 */
async function callGeminiConRelevo(apiKey, body, url, presupuestoMs, relevoMs) {
  const fin = Date.now() + presupuestoMs;
  const controllers = [];
  const intento = async () => {
    const controller = new AbortController();
    controllers.push(controller);
    const timeout = setTimeout(() => controller.abort(), Math.max(0, fin - Date.now()));
    try {
      const response = await fetch(`${url}?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Gemini error ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  };

  const primera = intento();
  let lanzarRelevo;
  const relevo = new Promise((resolve, reject) => {
    lanzarRelevo = () => { lanzarRelevo = () => {}; intento().then(resolve, reject); };
  });
  const timer = setTimeout(() => lanzarRelevo(), relevoMs);
  primera.catch(() => lanzarRelevo());
  try {
    return await Promise.any([primera, relevo]);
  } catch (err) {
    const e = err.errors?.[0] || err;
    throw e.name === "AbortError" ? new Error("Tiempo agotado con relevo") : e;
  } finally {
    clearTimeout(timer);
    controllers.forEach((c) => c.abort()); // corta la petición que ya no hace falta
  }
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
    const { text, history = [], file, json = false, modelo = "pro", thinkingBudget, presupuestoMs, relevoMs } = req.body;

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
    const data = Number.isFinite(relevoMs)
      ? await callGeminiConRelevo(apiKey, geminiBody, url, presupuesto, Math.max(1000, relevoMs))
      : await callGeminiWithRetry(apiKey, geminiBody, 3, url, presupuesto);

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

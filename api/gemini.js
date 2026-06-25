const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function callGeminiWithRetry(apiKey, body, maxAttempts = 3) {
  let lastError;
  let isRateLimit = false;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      // 429/503 necesitan más tiempo de espera (Gemini tarda ~10-20s en recuperarse)
      const base = isRateLimit ? 10000 : 2000;
      const delay = base * Math.pow(2, attempt - 1) + Math.random() * 1000;
      await sleep(delay);
    }
    isRateLimit = false;

    const controller = new AbortController();
    // 55s por intento — margen suficiente para Gemini 2.5 Pro con thinking
    const timeout = setTimeout(() => controller.abort(), 55000);

    try {
      const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.status === 429 || response.status === 503) {
        isRateLimit = true;
        lastError = new Error(`Google ${response.status} — reintentando...`);
        continue;
      }

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini error ${response.status}: ${errText}`);
      }

      return await response.json();

    } catch (err) {
      clearTimeout(timeout);

      if (err.name === "AbortError") {
        lastError = new Error(`Timeout en intento ${attempt + 1}`);
        continue;
      }

      throw err;
    }
  }

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
    const { text, history = [], file } = req.body;

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

    const geminiBody = {
      contents,
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 8192,
      },
    };

    const data = await callGeminiWithRetry(apiKey, geminiBody);

    // Gemini 2.5 Pro devuelve partes de "thinking" con { thought: true }.
    // Tomamos la primera parte que NO sea thinking para obtener el texto real.
    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    const responseText = parts.find((p) => !p.thought)?.text ?? "";

    if (!responseText) {
      throw new Error("Respuesta vacía del modelo.");
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

import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Endpoint y system prompt compartidos con /api/gemini.js
const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const SYSTEM_PROMPT =
  'Eres el asistente de IA de Grupo Avedie, empresa española de comercialización de energía ' +
  'y servicios. Ayudas a los comerciales y gestores del CRM interno con tareas profesionales: ' +
  'redacción de correos formales, análisis de documentos, traducciones corporativas, revisión ' +
  'y extracción de datos de facturas eléctricas españolas, y consultas generales de negocio. ' +
  'Tienes conocimiento experto del mercado eléctrico español: tarifas de acceso (2.0TD, 3.0TD, ' +
  '6.1), IVA reducido 10% sobre energía y potencia en Península/Baleares, IGIC 7% en Canarias, ' +
  'Impuesto Especial de la Electricidad (IEE/IVPEE 5,11%), código CUPS (20-22 caracteres ES...), ' +
  'períodos de facturación P1-P6, bono social y alquiler de contador. ' +
  'Responde siempre en español con tono profesional, conciso y orientado al cliente empresarial.';

// Plugin que añade /api/gemini como ruta del servidor de desarrollo de Vite.
// Replica exactamente la lógica de /api/gemini.js (Vercel) sin necesitar un proceso aparte.
function geminiDevPlugin(env) {
  return {
    name: 'gemini-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/gemini', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Method Not Allowed' }));
          return;
        }

        const apiKey = env.GEMINI_API_KEY;
        if (!apiKey) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Falta GEMINI_API_KEY en .env o .env.local' }));
          return;
        }

        // Leer body del request (Node.js stream)
        let rawBody = '';
        await new Promise((resolve) => {
          req.on('data', (chunk) => { rawBody += chunk.toString(); });
          req.on('end', resolve);
        });

        try {
          const { text, history = [], file } = JSON.parse(rawBody || '{}');

          const currentParts = [];
          if (text) currentParts.push({ text });
          if (file?.data && file?.mimeType) {
            currentParts.push({ inlineData: { mimeType: file.mimeType, data: file.data } });
          }

          const contents = [
            { role: 'user',  parts: [{ text: SYSTEM_PROMPT }] },
            { role: 'model', parts: [{ text: 'Entendido. Estoy listo para asistirte como asistente de Grupo Avedie.' }] },
            ...history,
            { role: 'user',  parts: currentParts },
          ];

          const geminiRes = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ contents }),
          });

          const data = await geminiRes.json();

          if (!geminiRes.ok) {
            throw new Error(data?.error?.message || `Gemini API ${geminiRes.status}`);
          }

          const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!responseText) throw new Error('Respuesta vacía del modelo.');

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ response: responseText }));
        } catch (err) {
          console.error('[gemini-dev]', err.message);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err.message || 'Error al procesar la solicitud.' }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // loadEnv con prefijo '' carga TODAS las variables (no solo las VITE_)
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react(), geminiDevPlugin(env)],
    server: {
      port: 5180,
      strictPort: true,
    },
  };
});

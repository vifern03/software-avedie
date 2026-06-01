// Vercel Serverless Function — /api/gemini
// La API key vive exclusivamente en process.env.GEMINI_API_KEY (variables de entorno de Vercel).
// Nunca se incluye en el bundle del cliente.

const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const SYSTEM_PROMPT =
  process.env.SYSTEM_PROMPT ||
  'Eres el asistente de IA de Grupo Avedie, empresa española líder en el sector asegurador ' +
  'y financiero. Ayudas a los comerciales y gestores del CRM interno con tareas profesionales: ' +
  'redacción de correos formales, análisis de documentos, traducciones corporativas, revisión ' +
  'de facturas y consultas generales de negocio. Responde siempre en español con tono ' +
  'profesional, conciso y orientado al cliente empresarial.';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('[gemini] Falta GEMINI_API_KEY en las variables de entorno de Vercel.');
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'El servicio de IA no está configurado. Contacta con el administrador.' }));
    return;
  }

  try {
    // Vercel parsea automáticamente el body JSON cuando Content-Type es application/json
    const { text, history = [], file } = req.body || {};

    if (!text && !file) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Se requiere al menos texto o un archivo.' }));
      return;
    }

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

    const geminiData = await geminiRes.json();

    if (!geminiRes.ok) {
      const msg = geminiData?.error?.message || `Gemini API ${geminiRes.status}`;
      console.error('[gemini] API error:', msg);
      throw new Error(msg);
    }

    const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!responseText) throw new Error('Respuesta vacía del modelo.');

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ response: responseText }));
  } catch (err) {
    console.error('[gemini] Error:', err.message || err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: err.message || 'Error al procesar la solicitud con la IA.' }));
  }
}

// Proxy seguro para Gemini 2.0 Flash.
// Usa la REST API directamente (sin SDK) para evitar incompatibilidades de versión.
// La clave API vive exclusivamente en process.env.GEMINI_API_KEY en Netlify.

const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const SYSTEM_PROMPT =
  process.env.SYSTEM_PROMPT ||
  'Eres el asistente de IA de Grupo Avedie, empresa española líder en el sector asegurador ' +
  'y financiero. Ayudas a los comerciales y gestores del CRM interno con tareas profesionales: ' +
  'redacción de correos formales, análisis de documentos, traducciones corporativas, revisión ' +
  'de facturas y consultas generales de negocio. Responde siempre en español con tono ' +
  'profesional, conciso y orientado al cliente empresarial.';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    console.error('Ninguna variable GEMINI_API_KEY / VITE_GEMINI_API_KEY está configurada en Netlify.');
    return {
      statusCode: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'El servicio de IA no está configurado. Contacta con el administrador.' }),
    };
  }

  try {
    const { text, history = [], file } = JSON.parse(event.body || '{}');

    if (!text && !file) {
      return {
        statusCode: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Se requiere al menos texto o un archivo.' }),
      };
    }

    // Construir partes del mensaje actual
    const currentParts = [];
    if (text) currentParts.push({ text });
    if (file?.data && file?.mimeType) {
      currentParts.push({ inlineData: { mimeType: file.mimeType, data: file.data } });
    }

    // Historial completo: system prompt como primer turno + conversación + mensaje actual
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
      console.error('Gemini API error:', msg);
      throw new Error(msg);
    }

    const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!responseText) throw new Error('Respuesta vacía del modelo.');

    return {
      statusCode: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ response: responseText }),
    };
  } catch (err) {
    console.error('gemini-proxy error:', err.message || err);
    return {
      statusCode: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message || 'Error al procesar la solicitud con la IA.' }),
    };
  }
};

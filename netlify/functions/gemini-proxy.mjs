// Proxy seguro para Gemini 1.5 Flash.
// La clave API vive exclusivamente en process.env.GEMINI_API_KEY (variable de entorno
// del servidor Netlify), nunca se expone en el bundle de JavaScript del cliente.
import { GoogleGenerativeAI } from '@google/generative-ai';

const SYSTEM_PROMPT =
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
  // Preflight CORS
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY no está configurada en las variables de entorno de Netlify.');
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

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    // Inyectar contexto de sistema como primer turno del historial
    const fullHistory = [
      { role: 'user',  parts: [{ text: SYSTEM_PROMPT }] },
      { role: 'model', parts: [{ text: 'Entendido. Estoy listo para asistirte como asistente de Grupo Avedie.' }] },
      ...history,
    ];

    const chat = model.startChat({ history: fullHistory });

    // Construir partes del mensaje actual
    const parts = [];
    if (text) parts.push({ text });
    if (file?.data && file?.mimeType) {
      parts.push({ inlineData: { mimeType: file.mimeType, data: file.data } });
    }

    const result      = await chat.sendMessage(parts);
    const responseText = result.response.text();

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
      body: JSON.stringify({ error: 'Error al procesar la solicitud con la IA. Inténtalo de nuevo.' }),
    };
  }
};

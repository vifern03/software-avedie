import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// En desarrollo, /api/gemini y /api/gemini-flash ejecutan los MISMOS handlers
// que Vercel (api/gemini.js y api/gemini-flash.js), para que lo probado en local
// sea lo que corre en producción.
function geminiDevPlugin(env) {
  const adapt = (server, modulePath) => async (req, res) => {
    let raw = '';
    await new Promise((resolve) => { req.on('data', (c) => { raw += c; }); req.on('end', resolve); });
    let body = {};
    try { body = JSON.parse(raw || '{}'); } catch { /* body vacío */ }
    if (!process.env.GEMINI_API_KEY && env.GEMINI_API_KEY) process.env.GEMINI_API_KEY = env.GEMINI_API_KEY;
    const { default: handler } = await server.ssrLoadModule(modulePath);
    const r = {
      status(code) { res.statusCode = code; return r; },
      json(obj) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); return r; },
    };
    await handler({ method: req.method, body }, r);
  };
  return {
    name: 'gemini-dev-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url || '').split('?')[0];
        if (path === '/api/gemini') return adapt(server, '/api/gemini.js')(req, res);
        if (path === '/api/gemini-flash') return adapt(server, '/api/gemini-flash.js')(req, res);
        next();
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

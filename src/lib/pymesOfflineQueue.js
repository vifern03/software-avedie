// Cola local (localStorage) de visitas PYME que no se pudieron subir a
// Supabase en el momento de guardarlas (típicamente por falta de cobertura
// en el móvil del comercial). Los datos y la foto quedan a salvo en el
// dispositivo y se reintenta la subida sola en segundo plano — ver
// flushPymesQueue en DataContext.jsx — hasta que se confirma en Supabase.
const QUEUE_KEY = 'pymes_pending_queue_v1';

export const fileToBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload  = () => resolve(reader.result);
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

export const base64ToBlob = (dataUrl) => {
  const [header, base64] = dataUrl.split(',');
  const mime = header.match(/data:(.*?);base64/)?.[1] || 'application/octet-stream';
  const binary = atob(base64);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
};

// Reduce el peso de la foto (máx. 1600px de lado, JPEG calidad 0.75) para que
// el envío tenga más posibilidades de completarse con mala cobertura y ocupe
// bastante menos sitio si hay que guardarla en la cola local del dispositivo.
export const compressImageFile = (file) => new Promise((resolve) => {
  if (!file?.type?.startsWith('image/')) { resolve(file); return; }
  const MAX = 1600;
  const img = new Image();
  const objectUrl = URL.createObjectURL(file);
  img.onload = () => {
    URL.revokeObjectURL(objectUrl);
    let { width, height } = img;
    if (width > MAX || height > MAX) {
      const scale = MAX / Math.max(width, height);
      width  = Math.round(width  * scale);
      height = Math.round(height * scale);
    }
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);
    canvas.toBlob(blob => resolve(blob || file), 'image/jpeg', 0.75);
  };
  img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(file); };
  img.src = objectUrl;
});

export const readQueue = () => {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
};

// Devuelve false si no se pudo persistir (p.ej. cuota de localStorage
// agotada) — el llamante decide cómo avisar sin perder el intento en curso.
export const writeQueue = (items) => {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(items)); return true; }
  catch { return false; }
};

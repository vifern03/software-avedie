// En móvil (iOS Safari, Chrome Android) window.open() solo se considera un
// resultado directo del toque del usuario si se llama de forma SÍNCRONA
// dentro del gestor del evento. Si se llama después de un `await` (como al
// esperar la descarga bajo demanda de un adjunto), el navegador ya no lo
// reconoce como gesto de usuario y bloquea la pestaña en silencio — sin
// error, sin aviso, el botón se queda "cargando" y nunca se abre nada.
//
// Solución: abrir una pestaña en blanco de forma síncrona en el propio
// onClick (antes de cualquier await) y, una vez resuelta la descarga,
// navegar esa pestaña ya abierta hacia la URL final.

export function openPendingTab() {
  try {
    const tab = window.open('', '_blank');
    if (tab) { try { tab.opener = null; } catch { /* noop */ } }
    return tab;
  } catch {
    return null;
  }
}

export function navigateTab(tab, url) {
  if (!url) { if (tab) tab.close(); return; }
  if (tab) {
    try { tab.location.href = url; return; } catch { /* fallback abajo */ }
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function openBase64InTab(tab, base64) {
  if (!base64) { if (tab) tab.close(); return; }
  const mime = base64.split(';')[0].replace('data:', '');
  const bytes = atob(base64.split(',')[1]);
  const ab = new ArrayBuffer(bytes.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < bytes.length; i++) ia[i] = bytes.charCodeAt(i);
  const blobUrl = URL.createObjectURL(new Blob([ab], { type: mime }));
  navigateTab(tab, blobUrl);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
}

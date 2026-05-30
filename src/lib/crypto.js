// SHA-256 via SubtleCrypto (API nativa del navegador, sin dependencias externas).
// Produce un hash hexadecimal de 64 caracteres.
export async function hashPassword(password) {
  const data   = new TextEncoder().encode(password);
  const buffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Usuarios con los que `user` puede compartir: todos, salvo sus bloqueos. */
export function destinatariosPermitidos(user, users, bloqueos) {
  if (!user) return [];
  const bloqueados = bloqueos?.[user.username] || [];
  return (users || []).filter((u) => u.username !== user.username && !bloqueados.includes(u.username));
}

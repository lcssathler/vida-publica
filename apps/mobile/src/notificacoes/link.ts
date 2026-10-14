/**
 * Link que o notificador manda junto de cada aviso: vidapublica://evento/{id}.
 * Tocar no aviso abre o registro com a fonte.
 */
const LINK_DO_EVENTO = /^vidapublica:\/\/evento\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export function eventoDoLink(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  return LINK_DO_EVENTO.exec(url.trim())?.[1]?.toLowerCase() ?? null;
}

type Objeto = Record<string, unknown>;

function objeto(valor: unknown): Objeto | null {
  return valor && typeof valor === 'object' ? (valor as Objeto) : null;
}

/**
 * O registro que um aviso tocado deve abrir. Os dados chegam em lugares
 * diferentes conforme a plataforma: `content.data` (Android e expo), o
 * `payload` do gatilho no iOS e a `remoteMessage` do FCM no Android.
 */
export function eventoDoAviso(resposta: unknown): string | null {
  const request = objeto(objeto(objeto(resposta)?.notification)?.request);
  const conteudo = objeto(request?.content);
  const gatilho = objeto(request?.trigger);
  const candidatos = [
    objeto(conteudo?.data),
    objeto(gatilho?.payload),
    objeto(objeto(gatilho?.remoteMessage)?.data),
    // RNFirebase (iOS): a própria mensagem remota
    objeto(objeto(resposta)?.data),
  ];
  for (const dados of candidatos) {
    const id = eventoDoLink(dados?.url);
    if (id) return id;
  }
  return null;
}

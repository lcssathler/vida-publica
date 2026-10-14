import { NOMES_CATEGORIAS, type Categoria } from '../feed/rotulos';

/**
 * Links que o notificador manda junto de cada aviso:
 * - vidapublica://evento/{id}: abre o registro com a fonte;
 * - vidapublica://feed?categorias=gastos,campanha: o resumo semanal abre o
 *   feed de quem a pessoa segue com esses filtros (vidapublica://feed, sem
 *   filtro).
 */
const LINK_DO_EVENTO = /^vidapublica:\/\/evento\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export function eventoDoLink(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  return LINK_DO_EVENTO.exec(url.trim())?.[1]?.toLowerCase() ?? null;
}

const LINK_DO_FEED = /^vidapublica:\/\/feed(?:\?categorias=([a-z,]*))?$/;

/** Categorias pedidas no link do feed (só as que existem), ou null se não é o feed. */
export function categoriasDoLink(url: unknown): Categoria[] | null {
  if (typeof url !== 'string') return null;
  const m = LINK_DO_FEED.exec(url.trim());
  if (!m) return null;
  return (m[1] ?? '')
    .split(',')
    .filter((c): c is Categoria => (NOMES_CATEGORIAS as string[]).includes(c));
}

/** Rota do app que o link abre: o registro ou o feed com os filtros. */
export function rotaDoLink(url: unknown): string | null {
  const id = eventoDoLink(url);
  if (id) return `/evento/${id}`;
  const categorias = categoriasDoLink(url);
  if (!categorias) return null;
  return categorias.length > 0 ? `/?categorias=${categorias.join(',')}` : '/';
}

type Objeto = Record<string, unknown>;

function objeto(valor: unknown): Objeto | null {
  return valor && typeof valor === 'object' ? (valor as Objeto) : null;
}

/**
 * A rota que um aviso tocado deve abrir. Os dados chegam em lugares
 * diferentes conforme a plataforma: `content.data` (Android e expo), o
 * `payload` do gatilho no iOS e a `remoteMessage` do FCM no Android.
 */
export function rotaDoAviso(resposta: unknown): string | null {
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
    const rota = rotaDoLink(dados?.url);
    if (rota) return rota;
  }
  return null;
}

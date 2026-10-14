import { StyleSheet } from 'react-native';

/** Nó da árvore do Testing Library 14 (só componentes nativos). */
interface No {
  type: string;
  props: Record<string, unknown>;
  children: (No | string)[];
  queryAll(predicado: (n: No) => boolean): No[];
}

const INTERATIVOS = new Set(['button', 'link', 'checkbox', 'radio', 'switch']);
const ALVO_MINIMO = 48;

function texto(n: No | string): string {
  return typeof n === 'string' ? n : n.children.map(texto).join('');
}

/**
 * Revisão automática de acessibilidade de uma tela renderizada:
 * - todo controle tem papel e nome lido pelo leitor de tela;
 * - todo controle tem alvo de toque de pelo menos 48 pt (altura mínima);
 * - todo campo de texto tem nome;
 * - a tela tem ao menos um título.
 * Devolve a lista de problemas (vazia = ok).
 */
export function auditar(raiz: No): string[] {
  const problemas: string[] = [];
  const papel = (n: No) => (n.props.role ?? n.props.accessibilityRole) as string | undefined;

  for (const n of raiz.queryAll((x) => INTERATIVOS.has(papel(x) ?? ''))) {
    const nome = String(n.props['aria-label'] ?? n.props.accessibilityLabel ?? texto(n)).trim();
    if (!nome) problemas.push(`${papel(n)} sem nome`);
    const estilo = (StyleSheet.flatten(n.props.style as never) ?? {}) as { minHeight?: number; height?: number };
    const altura = Math.max(Number(estilo.minHeight ?? 0), Number(estilo.height ?? 0));
    if (altura < ALVO_MINIMO) problemas.push(`${papel(n)} "${nome}" com alvo de ${altura} pt`);
  }

  // Tocável sem papel: o leitor de tela não sabe que dá para tocar.
  for (const n of raiz.queryAll((x) => typeof x.props.onClick === 'function' && !papel(x))) {
    problemas.push(`elemento tocável sem papel: "${texto(n).slice(0, 40)}"`);
  }

  for (const n of raiz.queryAll((x) => x.type === 'TextInput')) {
    if (!n.props['aria-label'] && !n.props.accessibilityLabel) problemas.push('campo de texto sem nome');
  }

  if (raiz.queryAll((x) => papel(x) === 'heading' || papel(x) === 'header').length === 0) {
    problemas.push('tela sem título (role heading)');
  }
  return problemas;
}

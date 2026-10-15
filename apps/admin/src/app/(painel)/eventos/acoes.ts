'use server';

import { redirect } from 'next/navigation';
import { api, ErroApi } from '../../../lib/api';
import { ROTULO_RECUSA } from '../../../lib/formato';
import type { ResultadoRevisao } from '../../../lib/tipos';
import { itensDoFormulario } from './itens';

/**
 * Publicar ou arquivar os eventos marcados. Cada item leva a versão que o
 * revisor viu (content_hash): se o motor mudou o evento nesse meio-tempo, a
 * API recusa aquele item.
 */
export async function revisar(dados: FormData): Promise<void> {
  const acao = dados.get('acao') === 'arquivar' ? 'arquivar' : 'publicar';
  const voltar = String(dados.get('voltar') ?? '/eventos');
  const itens = itensDoFormulario(dados.getAll('item'));
  const nota = String(dados.get('nota') ?? '').trim();
  if (itens.length === 0) {
    redirect(comMensagem(voltar, 'erro', 'Marque pelo menos um evento.'));
  }
  let mensagem: string;
  let tipo: 'ok' | 'erro' = 'ok';
  try {
    const r = await api<ResultadoRevisao>('/admin/eventos/revisar', {
      metodo: 'POST',
      corpo: { acao, itens, ...(nota ? { nota } : {}) },
    });
    const verbo = acao === 'publicar' ? 'publicado(s)' : 'arquivado(s)';
    mensagem = `${r.revisados.length} ${verbo}.`;
    if (r.recusados.length > 0) {
      tipo = 'erro';
      mensagem += ` Recusados: ${r.recusados
        .map((x) => `${x.id.slice(0, 8)} (${ROTULO_RECUSA[x.motivo] ?? x.motivo})`)
        .join('; ')}.`;
    }
  } catch (erro) {
    tipo = 'erro';
    mensagem = erro instanceof ErroApi ? erro.message : 'Falha ao revisar.';
  }
  redirect(comMensagem(voltar, tipo, mensagem));
}

function comMensagem(caminho: string, tipo: 'ok' | 'erro', texto: string): string {
  // Só caminhos do próprio painel.
  const url = new URL(caminho.startsWith('/') ? caminho : '/eventos', 'http://painel');
  url.searchParams.set(tipo, texto);
  return `${url.pathname}${url.search}`;
}

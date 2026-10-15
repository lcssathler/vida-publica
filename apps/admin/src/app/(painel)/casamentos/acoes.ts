'use server';

import { redirect } from 'next/navigation';
import { api, ErroApi } from '../../../lib/api';

/** Ligar a uma pessoa, criar pessoa nova ou descartar um casamento da fila. */
export async function resolver(dados: FormData): Promise<void> {
  const fonte = String(dados.get('fonte') ?? '');
  const idFonte = String(dados.get('idFonte') ?? '');
  const decisao = String(dados.get('decisao') ?? '');
  const pessoaId = String(dados.get('pessoaId') ?? '');
  const nota = String(dados.get('nota') ?? '').trim();
  const aqui = `/casamentos/${encodeURIComponent(fonte)}/${encodeURIComponent(idFonte)}`;
  if (!['senado', 'camara', 'tse'].includes(fonte)) redirect('/casamentos');
  try {
    await api(`/admin${aqui}`, {
      metodo: 'POST',
      corpo: {
        decisao,
        ...(decisao === 'vincular' ? { pessoaId } : {}),
        ...(nota ? { nota } : {}),
      },
    });
  } catch (erro) {
    const mensagem = erro instanceof ErroApi ? erro.message : 'Falha ao resolver.';
    redirect(`${aqui}?erro=${encodeURIComponent(mensagem)}`);
  }
  const feito =
    decisao === 'descartar'
      ? 'Descartado.'
      : 'Resolvido. Os eventos ganham a pessoa na próxima rodada do worker (resolver-pessoas e eventos).';
  redirect(`/casamentos?ok=${encodeURIComponent(feito)}`);
}

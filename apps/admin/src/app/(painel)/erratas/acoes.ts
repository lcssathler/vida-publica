'use server';

import { redirect } from 'next/navigation';
import { api, ErroApi } from '../../../lib/api';

const UUID = /^[0-9a-f-]{36}$/;

export async function publicarErrata(dados: FormData): Promise<void> {
  const eventoId = String(dados.get('eventoId') ?? '');
  const corpo = {
    titulo: String(dados.get('titulo') ?? '').trim(),
    texto: String(dados.get('texto') ?? '').trim(),
    eventoId: UUID.test(eventoId) ? eventoId : null,
    reporteIds: dados
      .getAll('reporteId')
      .map(String)
      .filter((id) => UUID.test(id)),
    arquivarEvento: dados.get('arquivarEvento') === 'on',
  };
  const voltar = `/erratas/nova${corpo.eventoId ? `?evento=${corpo.eventoId}` : ''}`;
  try {
    await api('/admin/erratas', { metodo: 'POST', corpo });
  } catch (erro) {
    const mensagem = erro instanceof ErroApi ? erro.message : 'Falha ao publicar.';
    redirect(`${voltar}${voltar.includes('?') ? '&' : '?'}erro=${encodeURIComponent(mensagem)}`);
  }
  redirect(`/erratas?ok=${encodeURIComponent('Errata publicada.')}`);
}

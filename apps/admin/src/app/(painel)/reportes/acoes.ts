'use server';

import { redirect } from 'next/navigation';
import { api, ErroApi } from '../../../lib/api';

export async function descartarReporte(dados: FormData): Promise<void> {
  const id = String(dados.get('id') ?? '');
  let destino = `/reportes?ok=${encodeURIComponent('Reporte descartado.')}`;
  try {
    await api(`/admin/reportes/${encodeURIComponent(id)}/descartar`, {
      metodo: 'POST',
      corpo: {},
    });
  } catch (erro) {
    const mensagem = erro instanceof ErroApi ? erro.message : 'Falha ao descartar.';
    destino = `/reportes?erro=${encodeURIComponent(mensagem)}`;
  }
  redirect(destino);
}

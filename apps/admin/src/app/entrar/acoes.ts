'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { api, ErroApi } from '../../lib/api';
import { config, COOKIE_SESSAO } from '../../lib/config';

export async function entrar(dados: FormData): Promise<void> {
  let resposta: { token: string; expiraEm: string };
  try {
    resposta = await api('/admin/entrar', {
      metodo: 'POST',
      semSessao: true,
      corpo: {
        email: String(dados.get('email') ?? ''),
        senha: String(dados.get('senha') ?? ''),
        codigo: String(dados.get('codigo') ?? ''),
      },
    });
  } catch (erro) {
    const mensagem =
      erro instanceof ErroApi ? erro.message : 'Não foi possível entrar agora.';
    redirect(`/entrar?erro=${encodeURIComponent(mensagem)}`);
  }
  (await cookies()).set(COOKIE_SESSAO, resposta.token, {
    httpOnly: true,
    secure: config().cookieSeguro,
    sameSite: 'strict',
    path: '/',
    expires: new Date(resposta.expiraEm),
  });
  redirect('/');
}

export async function sair(): Promise<void> {
  try {
    await api('/admin/sair', { metodo: 'POST' });
  } finally {
    (await cookies()).delete(COOKIE_SESSAO);
  }
  redirect('/entrar');
}

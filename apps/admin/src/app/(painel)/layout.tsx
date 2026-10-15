import type { ReactNode } from 'react';
import { api } from '../../lib/api';
import { sair } from '../entrar/acoes';
import { Menu } from './menu';

export const dynamic = 'force-dynamic';

export default async function Painel({ children }: { children: ReactNode }) {
  // Confere a sessão a cada página: vencida ou encerrada, volta ao login.
  const eu = await api<{ nome: string; email: string }>('/admin/eu');
  return (
    <>
      <header className="topo">
        <span className="marca">Vida Pública · Revisão</span>
        <Menu />
        <form action={sair} className="quem">
          <span>{eu.nome}</span>
          <button type="submit" className="secundario">
            Sair
          </button>
        </form>
      </header>
      <main>{children}</main>
    </>
  );
}

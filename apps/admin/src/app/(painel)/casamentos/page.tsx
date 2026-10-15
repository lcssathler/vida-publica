import Link from 'next/link';
import { api } from '../../../lib/api';
import { quando, ROTULO_CASAMENTO } from '../../../lib/formato';
import type { Casamento } from '../../../lib/tipos';
import { Mensagem } from '../mensagem';

export default async function Casamentos({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; ok?: string; erro?: string }>;
}) {
  const f = await searchParams;
  const status = ['pendente', 'resolvido', 'descartado'].includes(f.status ?? '')
    ? (f.status as string)
    : 'pendente';
  const lista = await api<Casamento[]>(`/admin/casamentos?status=${status}`);
  return (
    <>
      <h1>Casamentos de pessoas</h1>
      <p className="suave">
        Registros das fontes que o worker não conseguiu ligar a uma pessoa com segurança
        (nunca se casa só pelo nome). Ligar cria um vínculo manual, que o worker não
        sobrescreve; na próxima rodada de resolução e do motor, os eventos ganham a pessoa.
      </p>
      <Mensagem ok={f.ok} erro={f.erro} />
      <nav className="linha" aria-label="Situação">
        {['pendente', 'resolvido', 'descartado'].map((s) => (
          <Link key={s} href={`/casamentos?status=${s}`} aria-current={s === status ? 'page' : undefined}>
            {s === 'pendente' ? 'Na fila' : s === 'resolvido' ? 'Resolvidos' : 'Descartados'}
          </Link>
        ))}
      </nav>
      {lista.length === 0 ? (
        <p className="suave">Nada aqui.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th scope="col">Registro</th>
              <th scope="col">Fonte</th>
              <th scope="col">Por que ficou na fila</th>
              <th scope="col">{status === 'pendente' ? 'Na fila desde' : 'Decisão'}</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((c) => (
              <tr key={`${c.fonte}-${c.idFonte}`}>
                <td>
                  <Link href={`/casamentos/${c.fonte}/${encodeURIComponent(c.idFonte)}`}>
                    {c.registro.nome ?? c.idFonte}
                  </Link>
                  {c.registro.nomeCompleto && c.registro.nomeCompleto !== c.registro.nome ? (
                    <div className="suave">{c.registro.nomeCompleto}</div>
                  ) : null}
                </td>
                <td>
                  <span className="etiqueta">
                    {c.fonte} {c.idFonte}
                  </span>
                </td>
                <td>{ROTULO_CASAMENTO[c.motivo] ?? c.motivo}</td>
                <td>
                  {status === 'pendente' ? (
                    quando(c.criadoEm)
                  ) : (
                    <>
                      {c.pessoaNome ?? (status === 'descartado' ? 'descartado' : '—')}
                      <div className="suave">
                        {c.resolvidoPor}, {quando(c.resolvidoEm)}
                      </div>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

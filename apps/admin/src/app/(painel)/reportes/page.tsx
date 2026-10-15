import Link from 'next/link';
import { api } from '../../../lib/api';
import { quando, ROTULO_REPORTE } from '../../../lib/formato';
import type { Reporte } from '../../../lib/tipos';
import { Mensagem } from '../mensagem';
import { descartarReporte } from './acoes';

export default async function Reportes({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; ok?: string; erro?: string }>;
}) {
  const f = await searchParams;
  const status = ['aberto', 'corrigido', 'descartado'].includes(f.status ?? '')
    ? (f.status as string)
    : 'aberto';
  const lista = await api<Reporte[]>(`/admin/reportes?status=${status}`);
  return (
    <>
      <h1>Reportes de erro</h1>
      <p className="suave">
        O que as pessoas reportaram no detalhe de cada evento do app. Só o conteúdo: o
        painel não vê quem reportou. Corrigir é publicar uma errata (e, se o fato estava
        errado, arquivar o evento).
      </p>
      <Mensagem ok={f.ok} erro={f.erro} />
      <nav className="linha" aria-label="Situação">
        {['aberto', 'corrigido', 'descartado'].map((s) => (
          <Link key={s} href={`/reportes?status=${s}`} aria-current={s === status ? 'page' : undefined}>
            {s === 'aberto' ? 'Abertos' : s === 'corrigido' ? 'Corrigidos' : 'Descartados'}
          </Link>
        ))}
      </nav>
      {lista.length === 0 ? (
        <p className="suave">Nada aqui.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th scope="col">Evento</th>
              <th scope="col">Motivo</th>
              <th scope="col">O que a pessoa escreveu</th>
              <th scope="col">Quando</th>
              <th scope="col">
                <span className="so-leitor">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {lista.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link href={`/eventos/${r.eventoId}`}>{r.eventoTitulo}</Link>
                  {r.eventoStatus !== 'publicado' ? (
                    <div className="suave">evento {r.eventoStatus}</div>
                  ) : null}
                </td>
                <td>{ROTULO_REPORTE[r.motivo] ?? r.motivo}</td>
                <td>{r.texto ?? <span className="suave">(sem texto)</span>}</td>
                <td>
                  {quando(r.criadoEm)}
                  {r.resolvidoPor ? (
                    <div className="suave">
                      {r.resolvidoPor}, {quando(r.resolvidoEm)}
                    </div>
                  ) : null}
                </td>
                <td>
                  {r.status === 'aberto' ? (
                    <div className="linha">
                      <Link
                        className="botao"
                        href={`/erratas/nova?evento=${r.eventoId}`}
                      >
                        Publicar errata
                      </Link>
                      <form action={descartarReporte}>
                        <input type="hidden" name="id" value={r.id} />
                        <button type="submit" className="secundario">
                          Descartar
                        </button>
                      </form>
                    </div>
                  ) : r.errataId ? (
                    <Link href="/erratas">errata</Link>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

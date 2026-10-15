import Link from 'next/link';
import { notFound } from 'next/navigation';
import { api, ErroApi } from '../../../../../lib/api';
import { quando, ROTULO_CASAMENTO } from '../../../../../lib/formato';
import type { Casamento, PessoaCandidata } from '../../../../../lib/tipos';
import { Mensagem } from '../../../mensagem';
import { resolver } from '../../acoes';

function Pessoa({ p, pendente }: { p: PessoaCandidata; pendente: boolean }) {
  return (
    <tr>
      <td>
        {pendente ? (
          <input
            type="radio"
            name="pessoaId"
            value={p.id}
            required
            aria-label={`Ligar a ${p.nome}`}
          />
        ) : null}
      </td>
      <td>
        <strong>{p.nome}</strong>
        {p.nomeCivil && p.nomeCivil !== p.nome ? <div className="suave">{p.nomeCivil}</div> : null}
      </td>
      <td className="mono">{p.nascimento ?? '—'}</td>
      <td>
        {p.fontes.map((f) => (
          <span key={f} className="etiqueta">
            {f}
          </span>
        ))}
      </td>
      <td>
        {p.candidaturas.length === 0 ? (
          <span className="suave">nenhuma no TSE</span>
        ) : (
          p.candidaturas.map((x) => <div key={x}>{x}</div>)
        )}
      </td>
    </tr>
  );
}

function Cabecalho() {
  return (
    <thead>
      <tr>
        <th scope="col">
          <span className="so-leitor">Escolher</span>
        </th>
        <th scope="col">Pessoa</th>
        <th scope="col">Nascimento</th>
        <th scope="col">Fontes</th>
        <th scope="col">Candidaturas</th>
      </tr>
    </thead>
  );
}

export default async function CasamentoDetalhe({
  params,
  searchParams,
}: {
  params: Promise<{ fonte: string; id: string }>;
  searchParams: Promise<{ q?: string; erro?: string }>;
}) {
  const { fonte, id } = await params;
  const { q, erro } = await searchParams;
  if (!['senado', 'camara', 'tse'].includes(fonte)) notFound();
  let c: Casamento;
  try {
    c = await api<Casamento>(`/admin/casamentos/${fonte}/${encodeURIComponent(id)}`);
  } catch (falha) {
    if (falha instanceof ErroApi && falha.status === 404) notFound();
    throw falha;
  }
  const busca = q?.trim() || c.registro.nomeCompleto || c.registro.nome || '';
  const achados =
    busca.length >= 3
      ? await api<PessoaCandidata[]>(`/admin/pessoas?q=${encodeURIComponent(busca)}`)
      : [];
  const r = c.registro;
  return (
    <>
      <p>
        <Link href="/casamentos">← Casamentos</Link>
      </p>
      <h1>{r.nome ?? c.idFonte}</h1>
      <Mensagem erro={erro} />
      <dl className="ficha">
        <dt>Fonte</dt>
        <dd>
          <span className="etiqueta">
            {c.fonte} {c.idFonte}
          </span>{' '}
          {r.url ? (
            <a href={r.url} target="_blank" rel="noreferrer noopener">
              página oficial
            </a>
          ) : null}
        </dd>
        <dt>Nome completo</dt>
        <dd>{r.nomeCompleto ?? '—'}</dd>
        <dt>Nascimento</dt>
        <dd className="mono">{r.nascimento ?? 'a fonte não informa'}</dd>
        <dt>UF e partido</dt>
        <dd>
          {r.uf ?? '—'} · {r.partido ?? '—'}
        </dd>
        <dt>Em exercício</dt>
        <dd>{r.emExercicio ? 'sim' : 'não'}</dd>
        <dt>Por que ficou na fila</dt>
        <dd>{ROTULO_CASAMENTO[c.motivo] ?? c.motivo}</dd>
        <dt>Situação</dt>
        <dd>
          {c.status}
          {c.resolvidoPor ? ` · ${c.resolvidoPor}, ${quando(c.resolvidoEm)}` : ''}
          {c.pessoaNome ? ` · ${c.pessoaNome}` : ''}
          {c.nota ? ` · “${c.nota}”` : ''}
        </dd>
      </dl>

      {c.status === 'pendente' ? (
        <form className="linha" method="get">
          <label>
            Procurar pelo nome
            <input type="search" name="q" defaultValue={busca} minLength={3} />
          </label>
          <button type="submit" className="secundario">
            Procurar
          </button>
        </form>
      ) : null}
      <p className="suave">
        Confira nascimento, UF e candidaturas antes de ligar: nunca só pelo nome.
      </p>
      <form action={resolver}>
        <input type="hidden" name="fonte" value={c.fonte} />
        <input type="hidden" name="idFonte" value={c.idFonte} />
        <input type="hidden" name="decisao" value="vincular" />
        {c.candidatos.length > 0 ? (
          <>
            <h2>Candidatos que o worker achou</h2>
            <table>
              <Cabecalho />
              <tbody>
                {c.candidatos.map((p) => (
                  <Pessoa key={p.id} p={p} pendente={c.status === 'pendente'} />
                ))}
              </tbody>
            </table>
          </>
        ) : null}
        {c.status === 'pendente' ? (
          <>
            <h2>Pessoas com nome parecido</h2>
            {achados.length === 0 ? (
              <p className="suave">Ninguém parecido.</p>
            ) : (
              <table>
                <Cabecalho />
                <tbody>
                  {achados.map((p) => (
                    <Pessoa key={p.id} p={p} pendente />
                  ))}
                </tbody>
              </table>
            )}
            {c.candidatos.length + achados.length > 0 ? (
              <div className="linha">
                <label>
                  Por que é a mesma pessoa (fica no registro)
                  <input type="text" name="nota" maxLength={1000} size={60} />
                </label>
                <button type="submit">Ligar à pessoa marcada</button>
              </div>
            ) : null}
          </>
        ) : null}
      </form>

      {c.status === 'pendente' ? (
        <>
          <h2>Ou</h2>
          <form action={resolver} className="linha">
            <input type="hidden" name="fonte" value={c.fonte} />
            <input type="hidden" name="idFonte" value={c.idFonte} />
            <label>
              Nota (obrigatória para descartar)
              <input type="text" name="nota" maxLength={1000} />
            </label>
            <button type="submit" name="decisao" value="nova" className="secundario">
              Pessoa nova (não está em nenhuma outra fonte)
            </button>
            <button type="submit" name="decisao" value="descartar" className="perigo">
              Descartar
            </button>
          </form>
        </>
      ) : null}
    </>
  );
}

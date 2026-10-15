import Link from 'next/link';
import { api } from '../../../lib/api';
import { dinheiro, numero, quando, ROTULO_MOTIVO } from '../../../lib/formato';
import type { EventoRevisao, Pagina } from '../../../lib/tipos';
import { Mensagem } from '../mensagem';
import { revisar } from './acoes';

const POR_PAGINA = 50;

interface Filtros {
  status?: string;
  motivo?: string;
  tipo?: string;
  q?: string;
  pagina?: string;
  ok?: string;
  erro?: string;
}

export default async function Eventos({
  searchParams,
}: {
  searchParams: Promise<Filtros>;
}) {
  const f = await searchParams;
  const status = ['segurado', 'publicado', 'arquivado'].includes(f.status ?? '')
    ? (f.status as string)
    : 'segurado';
  const pagina = Math.max(1, Number(f.pagina) || 1);
  const consulta = new URLSearchParams({ status, pagina: String(pagina) });
  if (f.motivo) consulta.set('motivo', f.motivo);
  if (f.tipo) consulta.set('tipo', f.tipo);
  if (f.q) consulta.set('q', f.q);
  const lista = await api<Pagina<EventoRevisao>>(`/admin/eventos?${consulta}`);
  const ultimaPagina = Math.max(1, Math.ceil(lista.total / POR_PAGINA));
  const aqui = (p: number) => {
    const c = new URLSearchParams(consulta);
    c.set('pagina', String(p));
    return `/eventos?${c}`;
  };

  return (
    <>
      <h1>Eventos {status === 'segurado' ? 'segurados' : `${status}s pelo painel`}</h1>
      <p className="suave">
        Dinheiro acima de R$ 500 mil e eventos de regra nova esperam aqui até alguém
        conferir na fonte. Publicar põe o evento no feed e na fila de avisos (só quem já
        seguia recebe, e nada é reenviado); arquivar tira do app.
      </p>
      <Mensagem ok={f.ok} erro={f.erro} />
      <form className="linha" method="get">
        <label>
          Situação
          <select name="status" defaultValue={status}>
            <option value="segurado">Segurados</option>
            <option value="publicado">Publicados</option>
            <option value="arquivado">Arquivados</option>
          </select>
        </label>
        <label>
          Motivo
          <select name="motivo" defaultValue={f.motivo ?? ''}>
            <option value="">Todos</option>
            {Object.entries(ROTULO_MOTIVO).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tipo
          <input type="text" name="tipo" defaultValue={f.tipo ?? ''} placeholder="repasse" />
        </label>
        <label>
          Título contém
          <input type="search" name="q" defaultValue={f.q ?? ''} />
        </label>
        <button type="submit" className="secundario">
          Filtrar
        </button>
      </form>
      <p>
        {numero(lista.total)} evento(s)
        {status !== 'segurado' && !f.q ? ' revisados no painel (busque pelo título para ver todos)' : ''}.
      </p>

      <form action={revisar}>
        <input type="hidden" name="voltar" value={aqui(pagina)} />
        <table>
          <thead>
            <tr>
              <th scope="col">
                <span className="so-leitor">Marcar</span>
              </th>
              <th scope="col" className="num">
                Valor
              </th>
              <th scope="col">Evento</th>
              <th scope="col">Fato</th>
              <th scope="col">Fonte</th>
              <th scope="col">Situação</th>
            </tr>
          </thead>
          <tbody>
            {lista.itens.map((e) => (
              <tr key={e.id}>
                <td>
                  <input
                    type="checkbox"
                    name="item"
                    value={`${e.id}:${e.contentHash}`}
                    aria-label={`Marcar: ${e.titulo}`}
                  />
                </td>
                <td className="num">{dinheiro(e.valor)}</td>
                <td>
                  <Link href={`/eventos/${e.id}`}>{e.titulo}</Link>
                  <div className="suave">
                    <span className="etiqueta">{e.tipo}</span>{' '}
                    {e.visibilidade === 'seguidores' ? (
                      <span className="etiqueta">só seguidores</span>
                    ) : null}{' '}
                    {e.reportesAbertos > 0 ? (
                      <span className="etiqueta">{e.reportesAbertos} reporte(s)</span>
                    ) : null}
                  </div>
                </td>
                <td>{quando(e.ocorridoEm)}</td>
                <td>
                  {e.fonteUrl ? (
                    <a href={e.fonteUrl} target="_blank" rel="noreferrer noopener">
                      abrir
                    </a>
                  ) : (
                    <span className="aviso erro">sem fonte</span>
                  )}
                </td>
                <td>
                  {e.motivo ? (ROTULO_MOTIVO[e.motivo] ?? e.motivo) : e.status}
                  {e.revisadoPor ? (
                    <div className="suave">
                      {e.revisadoPor}, {quando(e.revisadoEm)}
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {lista.itens.length > 0 ? (
          <div className="acoes-lote linha">
            <label>
              Nota (fica no registro de ações)
              <input type="text" name="nota" maxLength={1000} />
            </label>
            {status === 'segurado' ? (
              <button type="submit" name="acao" value="publicar">
                Publicar marcados
              </button>
            ) : null}
            {status !== 'arquivado' ? (
              <button type="submit" name="acao" value="arquivar" className="perigo">
                Arquivar marcados
              </button>
            ) : null}
          </div>
        ) : null}
      </form>

      <nav className="paginacao" aria-label="Páginas">
        {pagina > 1 ? <Link href={aqui(pagina - 1)}>← Anterior</Link> : null}
        <span>
          Página {pagina} de {ultimaPagina}
        </span>
        {pagina < ultimaPagina ? <Link href={aqui(pagina + 1)}>Próxima →</Link> : null}
      </nav>
    </>
  );
}

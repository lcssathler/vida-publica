import Link from 'next/link';
import { notFound } from 'next/navigation';
import { api, ErroApi } from '../../../../lib/api';
import { dinheiro, quando, ROTULO_MOTIVO } from '../../../../lib/formato';
import type { DetalheEvento } from '../../../../lib/tipos';
import { Mensagem } from '../../mensagem';
import { revisar } from '../acoes';

export default async function Evento({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  const { id } = await params;
  const { ok, erro } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  let e: DetalheEvento;
  try {
    e = await api<DetalheEvento>(`/admin/eventos/${id}`);
  } catch (falha) {
    if (falha instanceof ErroApi && falha.status === 404) notFound();
    throw falha;
  }
  return (
    <>
      <p>
        <Link href="/eventos">← Eventos</Link>
      </p>
      <h1>{e.titulo}</h1>
      <Mensagem ok={ok} erro={erro} />
      {e.resumo ? <p>{e.resumo}</p> : null}
      <dl className="ficha">
        <dt>Situação</dt>
        <dd>
          {e.status}
          {e.motivo ? ` · ${ROTULO_MOTIVO[e.motivo] ?? e.motivo}` : ''}
        </dd>
        <dt>Tipo e regra</dt>
        <dd>
          <span className="etiqueta">{e.tipo}</span> v{e.regraVersao}: {e.regraDescricao}
        </dd>
        <dt>Valor</dt>
        <dd className="mono">{dinheiro(e.valor)}</dd>
        <dt>Fato em</dt>
        <dd>{quando(e.ocorridoEm)}</dd>
        <dt>Fonte</dt>
        <dd>
          {e.fonteUrl ? (
            <a href={e.fonteUrl} target="_blank" rel="noreferrer noopener">
              {e.fonteUrl}
            </a>
          ) : (
            <strong>sem fonte: não pode ser publicado</strong>
          )}
          {e.fonteDadoEm ? <span className="suave"> · dado de {quando(e.fonteDadoEm)}</span> : null}
        </dd>
        <dt>Coletado em</dt>
        <dd>{quando(e.coletadoEm)}</dd>
        <dt>Visibilidade</dt>
        <dd>{e.visibilidade === 'seguidores' ? 'só quem segue um alvo' : 'geral'}</dd>
        <dt>Publicado em</dt>
        <dd>{quando(e.publicadoEm)}</dd>
        <dt>Revisão</dt>
        <dd>
          {e.revisadoPor ? `${e.revisadoPor}, ${quando(e.revisadoEm)}` : 'ainda não revisado'}
        </dd>
        <dt>Reportes abertos</dt>
        <dd>
          {e.reportesAbertos > 0 ? (
            <Link href="/reportes">{e.reportesAbertos}</Link>
          ) : (
            '0'
          )}
        </dd>
      </dl>

      <h2>Envolvidos</h2>
      {e.alvos.length === 0 ? (
        <p className="suave">Nenhum alvo (ninguém recebe aviso deste evento).</p>
      ) : (
        <ul>
          {e.alvos.map((a) => (
            <li key={`${a.tipo}-${a.id}-${a.papel}`}>
              <span className="etiqueta">{a.tipo}</span> {a.nome}
              {a.papel ? <span className="suave"> ({a.papel})</span> : null}
            </li>
          ))}
        </ul>
      )}

      {e.status !== 'arquivado' ? (
        <form action={revisar} className="linha">
          <input type="hidden" name="item" value={`${e.id}:${e.contentHash}`} />
          <input type="hidden" name="voltar" value={`/eventos/${e.id}`} />
          <label>
            Nota (fica no registro de ações)
            <input type="text" name="nota" maxLength={1000} />
          </label>
          {e.status === 'segurado' && e.fonteUrl ? (
            <button type="submit" name="acao" value="publicar">
              Conferi na fonte: publicar
            </button>
          ) : null}
          <button type="submit" name="acao" value="arquivar" className="perigo">
            Arquivar (tira do app)
          </button>
        </form>
      ) : null}
      <p>
        <Link className="botao secundario" href={`/erratas/nova?evento=${e.id}`}>
          Publicar errata sobre este evento
        </Link>
      </p>

      <h2>Dados do evento</h2>
      <pre>{JSON.stringify(e.payload, null, 2)}</pre>

      <h2>Erratas</h2>
      {e.erratas.length === 0 ? (
        <p className="suave">Nenhuma.</p>
      ) : (
        <ul>
          {e.erratas.map((x) => (
            <li key={x.id}>
              <strong>{x.titulo}</strong> · {quando(x.publicadaEm)} · {x.publicadaPor}
              <div>{x.texto}</div>
            </li>
          ))}
        </ul>
      )}

      <h2>Histórico no painel</h2>
      {e.acoes.length === 0 ? (
        <p className="suave">Nenhuma ação.</p>
      ) : (
        <ul>
          {e.acoes.map((a) => (
            <li key={a.id}>
              {quando(a.criadaEm)} · {a.admin} · {a.acao}
              {typeof a.detalhe.nota === 'string' ? ` · “${a.detalhe.nota}”` : ''}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

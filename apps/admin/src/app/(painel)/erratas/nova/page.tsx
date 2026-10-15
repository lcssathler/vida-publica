import Link from 'next/link';
import { api } from '../../../../lib/api';
import { quando, ROTULO_REPORTE } from '../../../../lib/formato';
import type { DetalheEvento, Reporte } from '../../../../lib/tipos';
import { Mensagem } from '../../mensagem';
import { publicarErrata } from '../acoes';

export default async function NovaErrata({
  searchParams,
}: {
  searchParams: Promise<{ evento?: string; erro?: string }>;
}) {
  const f = await searchParams;
  const eventoId = f.evento && /^[0-9a-f-]{36}$/.test(f.evento) ? f.evento : null;
  const evento = eventoId ? await api<DetalheEvento>(`/admin/eventos/${eventoId}`) : null;
  const reportes = eventoId
    ? (await api<Reporte[]>('/admin/reportes?status=aberto')).filter(
        (r) => r.eventoId === eventoId,
      )
    : [];
  return (
    <>
      <p>
        <Link href="/erratas">← Erratas</Link>
      </p>
      <h1>Nova errata</h1>
      <Mensagem erro={f.erro} />
      {evento ? (
        <p>
          Sobre o evento <Link href={`/eventos/${evento.id}`}>{evento.titulo}</Link> (
          {quando(evento.ocorridoEm)}, {evento.status}).
        </p>
      ) : (
        <p className="suave">
          Errata geral (sem evento). Para corrigir um evento, abra-o e use “Publicar
          errata”.
        </p>
      )}
      <form action={publicarErrata} style={{ display: 'grid', gap: 12, maxWidth: 720 }}>
        {evento ? <input type="hidden" name="eventoId" value={evento.id} /> : null}
        <label>
          Título (o que estava errado, em uma linha)
          <input type="text" name="titulo" minLength={5} maxLength={200} required />
        </label>
        <label>
          Texto (o que estava errado, o que foi feito e a fonte certa)
          <textarea name="texto" minLength={10} maxLength={4000} required />
        </label>
        <p className="suave">
          Sem adjetivos. Nunca CPF, nem nome de doador pessoa física com até R$ 10 mil:
          a API recusa texto com algo parecido com CPF.
        </p>
        {evento && evento.status !== 'arquivado' ? (
          <label className="marcar">
            <input type="checkbox" name="arquivarEvento" />O fato estava errado: arquivar o
            evento (sai do app; a errata fica)
          </label>
        ) : null}
        {reportes.length > 0 ? (
          <fieldset>
            <legend>Reportes resolvidos por esta errata</legend>
            {reportes.map((r) => (
              <label key={r.id} className="marcar">
                <input type="checkbox" name="reporteId" value={r.id} defaultChecked />
                {ROTULO_REPORTE[r.motivo] ?? r.motivo}: {r.texto ?? '(sem texto)'} ·{' '}
                {quando(r.criadoEm)}
              </label>
            ))}
          </fieldset>
        ) : null}
        <div>
          <button type="submit">Publicar errata</button>
        </div>
      </form>
    </>
  );
}

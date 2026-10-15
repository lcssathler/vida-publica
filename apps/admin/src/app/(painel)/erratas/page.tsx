import Link from 'next/link';
import { api } from '../../../lib/api';
import { quando } from '../../../lib/formato';
import type { Errata, Pagina } from '../../../lib/tipos';
import { Mensagem } from '../mensagem';

export default async function Erratas({
  searchParams,
}: {
  searchParams: Promise<{ pagina?: string; ok?: string; erro?: string }>;
}) {
  const f = await searchParams;
  const pagina = Math.max(1, Number(f.pagina) || 1);
  const lista = await api<Pagina<Errata>>(`/admin/erratas?pagina=${pagina}`);
  return (
    <>
      <h1>Erratas</h1>
      <p className="suave">
        Públicas: aparecem no app (página de erratas e no detalhe do evento corrigido).
        Não se editam nem se apagam; uma correção da errata é outra errata.
      </p>
      <Mensagem ok={f.ok} erro={f.erro} />
      <p>
        <Link className="botao" href="/erratas/nova">
          Nova errata
        </Link>
      </p>
      {lista.itens.length === 0 ? (
        <p className="suave">Nenhuma errata publicada.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th scope="col">Errata</th>
              <th scope="col">Sobre</th>
              <th scope="col">Publicada</th>
            </tr>
          </thead>
          <tbody>
            {lista.itens.map((x) => (
              <tr key={x.id}>
                <td>
                  <strong>{x.titulo}</strong>
                  <div>{x.texto}</div>
                </td>
                <td>
                  {x.eventoId ? (
                    <Link href={`/eventos/${x.eventoId}`}>{x.eventoTitulo}</Link>
                  ) : null}
                  {x.pessoaNome ? <div>{x.pessoaNome}</div> : null}
                </td>
                <td>
                  {quando(x.publicadaEm)}
                  <div className="suave">{x.publicadaPor}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <nav className="paginacao" aria-label="Páginas">
        {pagina > 1 ? <Link href={`/erratas?pagina=${pagina - 1}`}>← Anterior</Link> : null}
        {pagina * 50 < lista.total ? (
          <Link href={`/erratas?pagina=${pagina + 1}`}>Próxima →</Link>
        ) : null}
      </nav>
    </>
  );
}

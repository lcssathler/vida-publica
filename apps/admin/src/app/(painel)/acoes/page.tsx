import Link from 'next/link';
import { api } from '../../../lib/api';
import { quando } from '../../../lib/formato';
import type { Acao, Pagina } from '../../../lib/tipos';

function linkDoAlvo(a: Acao) {
  if (a.alvoTipo === 'evento') return `/eventos/${a.alvoId}`;
  if (a.alvoTipo === 'casamento') {
    const [fonte, ...id] = a.alvoId.split(':');
    return `/casamentos/${fonte}/${encodeURIComponent(id.join(':'))}`;
  }
  if (a.alvoTipo === 'errata') return '/erratas';
  return null;
}

export default async function Acoes({
  searchParams,
}: {
  searchParams: Promise<{ pagina?: string }>;
}) {
  const pagina = Math.max(1, Number((await searchParams).pagina) || 1);
  const lista = await api<Pagina<Acao>>(`/admin/acoes?pagina=${pagina}`);
  return (
    <>
      <h1>Registro de ações</h1>
      <p className="suave">Tudo o que o painel mudou: quem, quando e o quê. Só cresce.</p>
      <table>
        <thead>
          <tr>
            <th scope="col">Quando</th>
            <th scope="col">Quem</th>
            <th scope="col">Ação</th>
            <th scope="col">Alvo</th>
            <th scope="col">Detalhe</th>
          </tr>
        </thead>
        <tbody>
          {lista.itens.map((a) => {
            const href = linkDoAlvo(a);
            return (
              <tr key={a.id}>
                <td>{quando(a.criadaEm)}</td>
                <td>{a.admin}</td>
                <td>
                  <span className="etiqueta">{a.acao}</span>
                </td>
                <td>
                  {href ? <Link href={href}>{a.alvoId}</Link> : a.alvoId}
                </td>
                <td className="mono">{JSON.stringify(a.detalhe)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <nav className="paginacao" aria-label="Páginas">
        {pagina > 1 ? <Link href={`/acoes?pagina=${pagina - 1}`}>← Anterior</Link> : null}
        {pagina * 100 < lista.total ? (
          <Link href={`/acoes?pagina=${pagina + 1}`}>Próxima →</Link>
        ) : null}
      </nav>
    </>
  );
}

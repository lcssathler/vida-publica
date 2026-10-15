import Link from 'next/link';
import { api } from '../../lib/api';
import { dinheiro, numero, ROTULO_MOTIVO } from '../../lib/formato';
import type { Resumo } from '../../lib/tipos';

export default async function Inicio() {
  const resumo = await api<Resumo>('/admin/resumo');
  const porMotivo = new Map<string, number>();
  for (const s of resumo.segurados) {
    porMotivo.set(s.motivo, (porMotivo.get(s.motivo) ?? 0) + s.eventos);
  }
  return (
    <>
      <h1>Resumo da revisão</h1>
      <div className="cartoes">
        {[...porMotivo].map(([motivo, n]) => (
          <Link key={motivo} className="cartao" href={`/eventos?motivo=${motivo}`}>
            <div className="numero">{numero(n)}</div>
            <div>segurados: {ROTULO_MOTIVO[motivo] ?? motivo}</div>
          </Link>
        ))}
        {porMotivo.size === 0 ? (
          <div className="cartao">
            <div className="numero">0</div>
            <div>eventos segurados</div>
          </div>
        ) : null}
        <Link className="cartao" href="/casamentos">
          <div className="numero">{numero(resumo.casamentosPendentes)}</div>
          <div>casamentos de pessoas na fila</div>
        </Link>
        <Link className="cartao" href="/reportes">
          <div className="numero">{numero(resumo.reportesAbertos)}</div>
          <div>reportes de erro abertos</div>
        </Link>
        <Link className="cartao" href="/erratas">
          <div className="numero">{numero(resumo.erratas)}</div>
          <div>erratas publicadas</div>
        </Link>
      </div>

      <h2>Segurados por tipo</h2>
      {resumo.segurados.length === 0 ? (
        <p className="suave">Nenhum evento segurado.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th scope="col">Motivo</th>
              <th scope="col">Tipo</th>
              <th scope="col" className="num">
                Eventos
              </th>
              <th scope="col" className="num">
                Soma dos valores
              </th>
            </tr>
          </thead>
          <tbody>
            {resumo.segurados.map((s) => (
              <tr key={`${s.motivo}-${s.tipo}`}>
                <td>{ROTULO_MOTIVO[s.motivo] ?? s.motivo}</td>
                <td>
                  <Link href={`/eventos?motivo=${s.motivo}&tipo=${s.tipo}`}>{s.tipo}</Link>
                </td>
                <td className="num">{numero(s.eventos)}</td>
                <td className="num">{dinheiro(s.valor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

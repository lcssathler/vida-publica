import { api } from '../../../lib/api';
import { numero, quando } from '../../../lib/formato';
import type { AlertaFonte, SaudeFonte } from '../../../lib/tipos';

function horasDesde(iso: string | null): string {
  if (!iso) return 'nunca';
  const horas = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  return horas < 1 ? `${Math.round(horas * 60)} min` : `${numero(Math.round(horas * 10) / 10)} h`;
}

export default async function Fontes() {
  const { fontes, alertas } = await api<{ fontes: SaudeFonte[]; alertas: AlertaFonte[] }>(
    '/admin/fontes',
  );
  const atrasadas = fontes.filter((f) => f.ativo && f.atrasado).length;
  return (
    <>
      <h1>Saúde das fontes</h1>
      <p className="suave">
        Cada coleta (e cada tipo do motor de eventos) tem um prazo máximo sem execução bem-sucedida.
        Passou do prazo, o vigia do worker abre um alerta e avisa (log, Sentry e healthchecks.io,
        quando configurados); a coleta voltou, o alerta fecha.
      </p>
      <p className={atrasadas ? 'aviso erro' : 'aviso'} role="status">
        {atrasadas
          ? `${atrasadas} de ${fontes.length} fora do prazo.`
          : `Todas as ${fontes.length} dentro do prazo.`}
      </p>
      <table>
        <thead>
          <tr>
            <th scope="col">Job</th>
            <th scope="col" className="num">
              Prazo
            </th>
            <th scope="col">Última coleta bem-sucedida</th>
            <th scope="col">Situação</th>
          </tr>
        </thead>
        <tbody>
          {fontes.map((f) => (
            <tr key={f.job}>
              <td>
                <span className="etiqueta">{f.job}</span>
                <div className="suave">{f.descricao}</div>
              </td>
              <td className="num">{numero(f.prazoHoras)} h</td>
              <td>
                {quando(f.ultimoSucesso)}
                <div className="suave">há {horasDesde(f.ultimoSucesso)}</div>
              </td>
              <td>
                {!f.ativo ? (
                  'desligado'
                ) : f.atrasado ? (
                  <strong>fora do prazo</strong>
                ) : (
                  'no prazo'
                )}
                {f.alertaDesde ? (
                  <div className="suave">alerta aberto em {quando(f.alertaDesde)}</div>
                ) : null}
                {f.ultimaFalha ? (
                  <div className="suave">
                    falhou em {quando(f.ultimaFalha)}: {f.erro}
                  </div>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2>Alertas recentes</h2>
      {alertas.length === 0 ? (
        <p className="suave">Nenhum.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th scope="col">Alerta</th>
              <th scope="col">Aberto</th>
              <th scope="col">Resolvido</th>
            </tr>
          </thead>
          <tbody>
            {alertas.map((a) => (
              <tr key={`${a.chave}-${a.abertoEm}`}>
                <td>
                  <span className="etiqueta">{a.chave}</span>
                </td>
                <td>{quando(a.abertoEm)}</td>
                <td>{a.resolvidoEm ? quando(a.resolvidoEm) : 'aberto'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { PostgresUsuariosRepositorio } from '../../src/auth/postgres-usuarios.repositorio';
import { hashRefresh } from '../../src/auth/tokens';
import { PostgresContaRepositorio } from '../../src/conta/postgres-conta.repositorio';
import { Db } from '../../src/db/db';
import { Relogio } from '../../src/notificacoes/enviador';
import { EnviadorFalso } from '../../src/notificacoes/enviador-falso';
import { CONFIG_FILA_PADRAO } from '../../src/notificacoes/fila.service';
import { horaLocal, instanteLocal } from '../../src/notificacoes/horario';
import { PostgresDispositivosRepositorio } from '../../src/notificacoes/postgres-dispositivos.repositorio';
import { PostgresResumoRepositorio } from '../../src/notificacoes/postgres-resumo.repositorio';
import { ResumoService } from '../../src/notificacoes/resumo.service';
import { PostgresSeguindoRepositorio } from '../../src/seguir/postgres-seguindo.repositorio';
import { dbDeTeste, Semente } from './banco';

class RelogioFixo extends Relogio {
  constructor(public instante: Date) {
    super();
  }
  agora(): Date {
    return new Date(this.instante);
  }
}

const SP = 'America/Sao_Paulo';
const MIN = 60_000;

/** Segunda-feira (data local) da semana de `instante`, e a seguinte. */
function semanas(instante: Date) {
  const l = horaLocal(instante, SP);
  const dow = new Date(Date.UTC(l.ano, l.mes - 1, l.dia)).getUTCDay() || 7;
  const segunda = new Date(Date.UTC(l.ano, l.mes - 1, l.dia - (dow - 1)));
  const iso = segunda.toISOString().slice(0, 10);
  const proxima = (h: number) =>
    instanteLocal(
      segunda.getUTCFullYear(),
      segunda.getUTCMonth() + 1,
      segunda.getUTCDate() + 7,
      h * 60,
      SP,
    );
  return { semana: iso, proximaAs: proxima };
}

describe('PostgresResumoRepositorio (integração)', () => {
  let api: Db;
  let notify: Db;
  let semente: Semente;
  const criados: string[] = [];
  let partido: string;
  let t0: Date;

  beforeAll(async () => {
    api = dbDeTeste();
    notify = new Db(
      new Pool({
        connectionString: process.env.VP_NOTIFY_TEST_DATABASE_URL,
        max: 2,
      }),
    );
    semente = new Semente();
    partido = await semente.partido();
    const [{ agora }] = await semente.db.query<{ agora: Date }>(
      'SELECT now() AS agora',
    );
    t0 = agora;
    // A fila começou um minuto antes: o que foi publicado antes não entra.
    await semente.db.query('DELETE FROM app.notificacao_cursor');
    await semente.db.query(
      `INSERT INTO app.notificacao_cursor (nome, iniciado_em, publicado_ate)
       VALUES ('eventos', $1, $1)`,
      [new Date(t0.getTime() - MIN)],
    );
  });

  afterAll(async () => {
    await api.query('DELETE FROM app.usuario WHERE id = ANY($1::uuid[])', [
      criados,
    ]);
    await semente.db.query('DELETE FROM app.notificacao_cursor');
    await semente.limpar();
    await notify.fechar();
    await api.fechar();
  });

  async function conta(prefs: Record<string, unknown> = {}, aparelho = true) {
    const s = await new PostgresUsuariosRepositorio(api).criarAnonimo(
      'android',
      hashRefresh(randomUUID()),
      new Date(Date.now() + 86_400_000),
    );
    criados.push(s.usuarioId);
    await new PostgresSeguindoRepositorio(api).seguir(s.usuarioId, {
      tipo: 'partido',
      id: partido,
    });
    if (Object.keys(prefs).length) {
      await new PostgresContaRepositorio(api).salvarPreferencias(
        s.usuarioId,
        prefs,
      );
    }
    if (aparelho) {
      await new PostgresDispositivosRepositorio(api).registrar(
        s.sessaoId,
        `tok-${randomUUID()}-${'x'.repeat(20)}`,
        'android',
      );
    }
    return s.usuarioId;
  }

  async function dinheiro(tipo: string, valor: number, publicadoEm: Date) {
    const id = await semente.evento({
      tipo,
      valor,
      ocorridoEm: t0.toISOString(),
      alvos: [{ tipo: 'partido', id: partido }],
    });
    await semente.db.query(
      'UPDATE feed.evento SET publicado_em = $2 WHERE id = $1',
      [id, publicadoEm],
    );
    return id;
  }

  it('resume o dinheiro da semana anterior, uma vez, respeitando as preferências', async () => {
    const comResumo = await conta();
    const desligado = await conta({ resumoSemanal: false });
    const semAparelho = await conta({}, false);
    const publicado = new Date(t0.getTime() + MIN);
    await dinheiro('repasse', 100_000, publicado);
    await dinheiro('repasse', 1_100_000, publicado);
    await dinheiro('doacao', 5_000, publicado);
    // Antes do início da fila: não entra.
    await dinheiro('repasse', 999_999, new Date(t0.getTime() - 2 * MIN));
    // Segurado: nunca.
    await semente.evento({
      tipo: 'repasse',
      valor: 3_000_000,
      status: 'segurado',
      ocorridoEm: t0.toISOString(),
      alvos: [{ tipo: 'partido', id: partido }],
    });

    const { semana, proximaAs } = semanas(t0);
    const repo = new PostgresResumoRepositorio(notify);
    const nossos = (d: Array<{ usuarioId: string }>) =>
      d.filter((x) => criados.includes(x.usuarioId)).map((x) => x.usuarioId);

    // Segunda seguinte às 08:59: ainda não; às 09:00: os três.
    expect(
      nossos(
        await repo.devidos(
          new Date(proximaAs(9).getTime() - MIN),
          540,
          1000,
          [],
        ),
      ),
    ).toEqual([]);
    const devidos = await repo.devidos(proximaAs(9), 540, 1000, []);
    expect(nossos(devidos).sort()).toEqual(
      [comResumo, desligado, semAparelho].sort(),
    );
    expect(devidos.find((d) => d.usuarioId === comResumo)).toMatchObject({
      semana,
      fuso: SP,
    });

    const enviador = new EnviadorFalso();
    const relogio = new RelogioFixo(
      new Date(proximaAs(9).getTime() + 30 * MIN),
    );
    const servico = new ResumoService(
      repo,
      enviador,
      relogio,
      CONFIG_FILA_PADRAO,
      {
        hora: '09:00',
      },
    );
    await servico.ciclo();
    const linhas = await notify.query<{
      usuario_id: string;
      status: string;
      motivo: string | null;
      conteudo: { totais: unknown[]; excedentes: number };
      corpo: string | null;
      url: string | null;
      dispositivos: number | null;
    }>(
      `SELECT usuario_id, status, motivo, conteudo, corpo, url, dispositivos
         FROM app.resumo_semanal WHERE usuario_id = ANY($1::uuid[]) AND semana = $2`,
      [criados, semana],
    );
    const de = (u: string) => linhas.find((l) => l.usuario_id === u)!;
    expect(de(comResumo)).toMatchObject({
      status: 'enviado',
      dispositivos: 1,
      url: 'vidapublica://feed?categorias=gastos,campanha',
      conteudo: {
        excedentes: 0,
        totais: [
          { tipo: 'doacao', registros: 1, valor: 5000 },
          { tipo: 'repasse', registros: 2, valor: 1_200_000 },
        ],
      },
    });
    expect(de(comResumo).corpo).toBe(
      'Dinheiro de quem você segue: 2 repasses de partido (R$ 1,2 mi); 1 dia de doações (R$ 5 mil). Toque para ver no feed.',
    );
    expect(de(desligado)).toMatchObject({
      status: 'descartado',
      motivo: 'desligado',
    });
    expect(de(semAparelho)).toMatchObject({
      status: 'descartado',
      motivo: 'sem_dispositivo',
    });

    // De novo: nada a gerar nem a enviar.
    const enviados = enviador.enviados.length;
    relogio.instante = new Date(relogio.instante.getTime() + 60 * MIN);
    expect(await servico.ciclo()).toMatchObject({ gerados: {}, enviados: 0 });
    expect(enviador.enviados).toHaveLength(enviados);
    expect(nossos(await repo.devidos(relogio.agora(), 540, 1000, []))).toEqual(
      [],
    );
  });

  it('a API não enxerga o resumo', async () => {
    await expect(api.query('SELECT 1 FROM app.resumo_semanal')).rejects.toThrow(
      /permission denied/,
    );
  });
});

import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { PostgresUsuariosRepositorio } from '../../src/auth/postgres-usuarios.repositorio';
import { hashRefresh } from '../../src/auth/tokens';
import { PostgresContaRepositorio } from '../../src/conta/postgres-conta.repositorio';
import { Db } from '../../src/db/db';
import { Relogio } from '../../src/notificacoes/enviador';
import { EnviadorFalso } from '../../src/notificacoes/enviador-falso';
import {
  CONFIG_FILA_PADRAO,
  FilaService,
} from '../../src/notificacoes/fila.service';
import { horaLocal } from '../../src/notificacoes/horario';
import { PostgresDispositivosRepositorio } from '../../src/notificacoes/postgres-dispositivos.repositorio';
import { PostgresFilaRepositorio } from '../../src/notificacoes/postgres-fila.repositorio';
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

const MIN = 60_000;

/**
 * Fila contra o banco: a API (vp_api) cria contas, segue alvos, grava
 * preferências e aparelhos; o notificador (vp_notify) enfileira e envia pelo
 * adaptador falso; o dono do banco grava os eventos fictícios.
 */
describe('PostgresFilaRepositorio (integração)', () => {
  let api: Db;
  let notify: Db;
  let semente: Semente;
  let relogio: RelogioFixo;
  let enviador: EnviadorFalso;
  let servico: FilaService;
  const criados: string[] = [];
  let pessoa: string;
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
    pessoa = await semente.pessoa();
    partido = await semente.partido();
    // Cada execução começa do zero: sem cursor, nada é retroativo.
    await semente.db.query('DELETE FROM app.notificacao_cursor');
    const [{ agora }] = await semente.db.query<{ agora: Date }>(
      'SELECT now() AS agora',
    );
    t0 = agora;
    relogio = new RelogioFixo(new Date(t0.getTime() + MIN));
    enviador = new EnviadorFalso();
    servico = new FilaService(
      new PostgresFilaRepositorio(notify),
      enviador,
      relogio,
      CONFIG_FILA_PADRAO,
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

  async function conta(
    seguir: Array<{ tipo: 'pessoa' | 'partido'; id: string }>,
    token: string | null = `tok-${randomUUID()}-${'x'.repeat(30)}`,
  ) {
    const sessao = await new PostgresUsuariosRepositorio(api).criarAnonimo(
      'android',
      hashRefresh(randomUUID()),
      new Date(Date.now() + 86_400_000),
    );
    criados.push(sessao.usuarioId);
    for (const alvo of seguir) {
      await new PostgresSeguindoRepositorio(api).seguir(sessao.usuarioId, alvo);
    }
    if (token) {
      await new PostgresDispositivosRepositorio(api).registrar(
        sessao.sessaoId,
        token,
        'android',
      );
    }
    return sessao;
  }

  /** Evento publicado no instante dado (o dono do banco ajusta publicado_em). */
  async function evento(
    publicadoEm: Date,
    dados: Parameters<Semente['evento']>[0] = {
      ocorridoEm: t0.toISOString(),
    },
  ) {
    const id = await semente.evento({
      alvos: [{ tipo: 'pessoa', id: pessoa }],
      ...dados,
    });
    await semente.db.query(
      `UPDATE feed.evento SET publicado_em = $2 WHERE id = $1 AND status = 'publicado'`,
      [id, publicadoEm],
    );
    return id;
  }

  async function avisos(usuarioId: string) {
    return notify.query<{
      evento_id: string;
      status: string;
      motivo: string | null;
      titulo: string | null;
      corpo: string | null;
      dispositivos: number | null;
      enviar_apos: Date;
    }>(
      `SELECT evento_id, status, motivo, titulo, corpo, dispositivos, enviar_apos
         FROM app.notificacao WHERE usuario_id = $1 ORDER BY id`,
      [usuarioId],
    );
  }

  it('enfileira, envia uma vez, respeita teto, silêncio e tokens inválidos', async () => {
    const seguidora = await conta([{ tipo: 'pessoa', id: pessoa }]);
    const doPartido = await conta([{ tipo: 'partido', id: partido }]);
    const comTeto = await conta([{ tipo: 'pessoa', id: pessoa }]);
    await new PostgresContaRepositorio(api).salvarPreferencias(
      comTeto.usuarioId,
      { maxPorDia: 1 },
    );
    const desligada = await conta([{ tipo: 'pessoa', id: pessoa }]);
    await new PostgresContaRepositorio(api).salvarPreferencias(
      desligada.usuarioId,
      { notificacoes: false },
    );
    const emSilencio = await conta([{ tipo: 'pessoa', id: pessoa }]);
    const hora = Math.floor(
      horaLocal(relogio.agora(), 'America/Sao_Paulo').minutos / 60,
    );
    const hh = (h: number) => `${String(h % 24).padStart(2, '0')}:00`;
    await new PostgresContaRepositorio(api).salvarPreferencias(
      emSilencio.usuarioId,
      { silencioInicio: hh(hora), silencioFim: hh(hora + 2) },
    );
    const tokenInvalido = await conta(
      [{ tipo: 'pessoa', id: pessoa }],
      `invalido-${randomUUID()}-${'x'.repeat(20)}`,
    );

    // Já publicado antes da primeira execução: nunca vira aviso.
    await evento(t0);
    const inicial = await servico.ciclo();
    expect(inicial.enfileiramento.inicial).toBe(true);

    const publicado = new Date(t0.getTime() + 2 * MIN);
    const voto = await evento(publicado);
    const segundo = await evento(publicado);
    const doPartidoId = await evento(publicado, {
      ocorridoEm: t0.toISOString(),
      alvos: [{ tipo: 'partido', id: partido }],
      visibilidade: 'seguidores',
    });
    await evento(publicado, {
      ocorridoEm: t0.toISOString(),
      status: 'segurado',
    });
    await evento(publicado, { ocorridoEm: t0.toISOString(), fonteUrl: null });
    await evento(publicado, {
      ocorridoEm: t0.toISOString(),
      tipo: 'repasse',
      valor: 1000,
    });

    relogio.instante = new Date(t0.getTime() + 3 * MIN);
    const ciclo = await servico.ciclo();
    // 2 eventos × 4 contas que seguem a pessoa (a desligada fica de fora) + 1 do partido
    expect(ciclo.enfileiramento.enfileiradas).toBeGreaterThanOrEqual(9);

    const daSeguidora = await avisos(seguidora.usuarioId);
    expect(daSeguidora.map((a) => [a.evento_id, a.status])).toEqual([
      [voto, 'enviada'],
      [segundo, 'enviada'],
    ]);
    expect(daSeguidora[0]).toMatchObject({
      motivo: null,
      dispositivos: 1,
      corpo: 'Resumo fictício Toque para ver a fonte.',
    });
    expect(daSeguidora[0].titulo).toMatch(/^Evento fictício /);
    expect(
      enviador.enviados.some(
        (e) => e.mensagem.dados.url === `vidapublica://evento/${voto}`,
      ),
    ).toBe(true);

    expect(
      (await avisos(doPartido.usuarioId)).map((a) => [a.evento_id, a.status]),
    ).toEqual([[doPartidoId, 'enviada']]);
    expect(
      (await avisos(comTeto.usuarioId)).map((a) => [a.status, a.motivo]),
    ).toEqual([
      ['enviada', null],
      ['resumo', 'teto'],
    ]);
    expect(await avisos(desligada.usuarioId)).toEqual([]);
    const silencio = await avisos(emSilencio.usuarioId);
    expect(silencio.map((a) => [a.status, a.motivo])).toEqual([
      ['pendente', 'silencio'],
      ['pendente', 'silencio'],
    ]);
    expect(silencio[0].enviar_apos.getTime()).toBeGreaterThan(
      relogio.instante.getTime(),
    );
    expect(
      (await avisos(tokenInvalido.usuarioId)).map((a) => [a.status, a.motivo]),
    ).toEqual([
      ['descartada', 'sem_dispositivo'],
      ['descartada', 'sem_dispositivo'],
    ]);
    await expect(
      new PostgresDispositivosRepositorio(api).daSessao(tokenInvalido.sessaoId),
    ).resolves.toBeNull();

    // Rodar de novo não enfileira nem envia nada a mais.
    const enviados = enviador.enviados.length;
    relogio.instante = new Date(t0.getTime() + 4 * MIN);
    const repetido = await servico.ciclo();
    expect(repetido.envio.enviadas).toBe(0);
    expect(enviador.enviados).toHaveLength(enviados);
    expect(await avisos(seguidora.usuarioId)).toHaveLength(2);

    // Passado o silêncio, sai.
    relogio.instante = new Date(silencio[0].enviar_apos);
    await servico.enviar();
    expect((await avisos(emSilencio.usuarioId)).map((a) => a.status)).toEqual([
      'enviada',
      'enviada',
    ]);
  });

  it('um notificador por usuário de cada vez', async () => {
    const { usuarioId } = await conta([{ tipo: 'pessoa', id: pessoa }]);
    const outraConexao = new Db(
      new Pool({
        connectionString: process.env.VP_NOTIFY_TEST_DATABASE_URL,
        max: 1,
      }),
    );
    const repo = new PostgresFilaRepositorio(notify);
    const outro = new PostgresFilaRepositorio(outraConexao);
    let dentro: unknown;
    const primeiro = repo.comUsuario(usuarioId, async () => {
      dentro = await outro.comUsuario(usuarioId, () => Promise.resolve('x'));
      return 'ok';
    });
    await expect(primeiro).resolves.toBe('ok');
    expect(dentro).toBeNull();
    // Solto, o outro consegue.
    await expect(
      outro.comUsuario(usuarioId, () => Promise.resolve('x')),
    ).resolves.toBe('x');
    await outraConexao.fechar();
  });
});

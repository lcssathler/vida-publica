import { randomUUID } from 'node:crypto';
import { hashRefresh } from '../../src/auth/tokens';
import { PostgresUsuariosRepositorio } from '../../src/auth/postgres-usuarios.repositorio';
import { Db } from '../../src/db/db';
import { dbDeTeste } from './banco';

const daqui = (dias: number) => new Date(Date.now() + dias * 86_400_000);
const hash = () => hashRefresh(randomUUID());

describe('PostgresUsuariosRepositorio (integração)', () => {
  let db: Db;
  let repo: PostgresUsuariosRepositorio;
  const criados: string[] = [];

  beforeAll(() => {
    db = dbDeTeste();
    repo = new PostgresUsuariosRepositorio(db);
  });

  afterAll(async () => {
    await db.query('DELETE FROM app.usuario WHERE id = ANY($1::uuid[])', [
      criados,
    ]);
    await db.fechar();
  });

  async function anonimo(refresh = hash()) {
    const sessao = await repo.criarAnonimo('android', refresh, daqui(60));
    criados.push(sessao.usuarioId);
    return sessao;
  }

  it('cria usuário anônimo com sessão ativa', async () => {
    const sessao = await anonimo();
    await expect(
      repo.sessaoAtiva(sessao.sessaoId, sessao.usuarioId),
    ).resolves.toBe(true);
    await expect(repo.sessaoAtiva(sessao.sessaoId, randomUUID())).resolves.toBe(
      false,
    );
  });

  it('rotaciona e detecta reuso, revogando a sessão', async () => {
    const h1 = hash();
    const sessao = await anonimo(h1);
    const h2 = hash();
    await expect(repo.rotacionar(h1, h2, daqui(60))).resolves.toEqual({
      status: 'ok',
      ...sessao,
    });
    await expect(repo.rotacionar(h1, hash(), daqui(60))).resolves.toEqual({
      status: 'reusado',
    });
    await expect(repo.rotacionar(h2, hash(), daqui(60))).resolves.toEqual({
      status: 'invalido',
    });
    const [linha] = await db.query<{ motivo_revogacao: string }>(
      'SELECT motivo_revogacao FROM app.sessao WHERE id = $1',
      [sessao.sessaoId],
    );
    expect(linha.motivo_revogacao).toBe('reuso');
  });

  it('duas renovações simultâneas com o mesmo token: só uma passa', async () => {
    const h1 = hash();
    await anonimo(h1);
    const resultados = await Promise.all([
      repo.rotacionar(h1, hash(), daqui(60)),
      repo.rotacionar(h1, hash(), daqui(60)),
    ]);
    expect(resultados.map((r) => r.status).sort()).toEqual(['ok', 'reusado']);
  });

  it('refresh vencido é inválido sem revogar a sessão', async () => {
    const sessao = await anonimo();
    const vencido = hash();
    await db.query(
      `INSERT INTO app.refresh_token (hash, sessao_id, criado_em, expira_em)
       VALUES ($1, $2, now() - interval '2 days', now() - interval '1 day')`,
      [vencido, sessao.sessaoId],
    );
    await expect(repo.rotacionar(vencido, hash(), daqui(60))).resolves.toEqual({
      status: 'invalido',
    });
    await expect(
      repo.sessaoAtiva(sessao.sessaoId, sessao.usuarioId),
    ).resolves.toBe(true);
  });

  it('novo refresh após login descarta os não usados da sessão', async () => {
    const antigo = hash();
    const sessao = await anonimo(antigo);
    const novo = hash();
    await repo.novoRefresh(sessao.sessaoId, novo, daqui(60));
    await expect(repo.rotacionar(antigo, hash(), daqui(60))).resolves.toEqual({
      status: 'invalido',
    });
    await expect(
      repo.rotacionar(novo, hash(), daqui(60)),
    ).resolves.toMatchObject({ status: 'ok' });
  });

  it('vincula identidade uma vez e funde conta anônima', async () => {
    const dono = await anonimo();
    const sujeito = `sujeito-${randomUUID()}`;
    await repo.vincularIdentidade(dono.usuarioId, 'google', sujeito);
    await expect(repo.usuarioDaIdentidade('google', sujeito)).resolves.toBe(
      dono.usuarioId,
    );
    await expect(repo.temIdentidade(dono.usuarioId)).resolves.toBe(true);

    const outro = await anonimo();
    // Vincular a mesma identidade a outro usuário não rouba a identidade.
    await repo.vincularIdentidade(outro.usuarioId, 'google', sujeito);
    await expect(repo.usuarioDaIdentidade('google', sujeito)).resolves.toBe(
      dono.usuarioId,
    );

    await repo.moverSessao(
      outro.sessaoId,
      outro.usuarioId,
      dono.usuarioId,
      true,
    );
    await expect(
      repo.sessaoAtiva(outro.sessaoId, dono.usuarioId),
    ).resolves.toBe(true);
    const restantes = await db.query(
      'SELECT 1 FROM app.usuario WHERE id = $1',
      [outro.usuarioId],
    );
    expect(restantes).toHaveLength(0);
  });

  it('revoga sessão ao sair', async () => {
    const sessao = await anonimo();
    await repo.revogarSessao(sessao.sessaoId, 'saida');
    await expect(
      repo.sessaoAtiva(sessao.sessaoId, sessao.usuarioId),
    ).resolves.toBe(false);
  });
});

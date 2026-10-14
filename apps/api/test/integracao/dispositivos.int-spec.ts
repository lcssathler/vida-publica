import { randomUUID } from 'node:crypto';
import { PostgresUsuariosRepositorio } from '../../src/auth/postgres-usuarios.repositorio';
import { hashRefresh } from '../../src/auth/tokens';
import { PostgresContaRepositorio } from '../../src/conta/postgres-conta.repositorio';
import { Db } from '../../src/db/db';
import { PostgresDispositivosRepositorio } from '../../src/notificacoes/postgres-dispositivos.repositorio';
import { dbDeTeste } from './banco';

describe('PostgresDispositivosRepositorio (integração)', () => {
  let db: Db;
  let repo: PostgresDispositivosRepositorio;
  let usuarios: PostgresUsuariosRepositorio;
  const criados: string[] = [];

  beforeAll(() => {
    db = dbDeTeste();
    repo = new PostgresDispositivosRepositorio(db);
    usuarios = new PostgresUsuariosRepositorio(db);
  });

  afterAll(async () => {
    await db.query('DELETE FROM app.usuario WHERE id = ANY($1::uuid[])', [
      criados,
    ]);
    await db.fechar();
  });

  async function sessao() {
    const s = await usuarios.criarAnonimo(
      'android',
      hashRefresh(randomUUID()),
      new Date(Date.now() + 86_400_000),
    );
    criados.push(s.usuarioId);
    return s;
  }

  const token = () => `fcm:${randomUUID()}-${'x'.repeat(24)}`;

  it('um token por sessão; o mesmo token muda de sessão', async () => {
    const a = await sessao();
    const b = await sessao();
    const t1 = token();
    await repo.registrar(a.sessaoId, t1, 'android');
    await repo.registrar(a.sessaoId, token(), 'ios');
    await expect(repo.daSessao(a.sessaoId)).resolves.toMatchObject({
      plataforma: 'ios',
    });
    const t2 = token();
    await repo.registrar(a.sessaoId, t2, 'android');
    await repo.registrar(b.sessaoId, t2, 'android');
    await expect(repo.daSessao(a.sessaoId)).resolves.toBeNull();
    await expect(repo.daSessao(b.sessaoId)).resolves.not.toBeNull();
    await expect(repo.remover(b.sessaoId)).resolves.toBe(true);
    await expect(repo.remover(b.sessaoId)).resolves.toBe(false);
  });

  it('o banco recusa token fora do formato', async () => {
    const a = await sessao();
    await expect(
      repo.registrar(a.sessaoId, 'curto', 'android'),
    ).rejects.toThrow();
    await expect(
      repo.registrar(a.sessaoId, `${token()} espaço`, 'android'),
    ).rejects.toThrow();
  });

  it('sair, reuso do refresh e excluir a conta apagam o token', async () => {
    const saiu = await sessao();
    await repo.registrar(saiu.sessaoId, token(), 'android');
    await usuarios.revogarSessao(saiu.sessaoId, 'saida');
    await expect(repo.daSessao(saiu.sessaoId)).resolves.toBeNull();

    const refresh = randomUUID();
    const s = await usuarios.criarAnonimo(
      'android',
      hashRefresh(refresh),
      new Date(Date.now() + 86_400_000),
    );
    criados.push(s.usuarioId);
    await repo.registrar(s.sessaoId, token(), 'android');
    await usuarios.rotacionar(
      hashRefresh(refresh),
      hashRefresh(randomUUID()),
      new Date(Date.now() + 86_400_000),
    );
    await expect(
      usuarios.rotacionar(
        hashRefresh(refresh),
        hashRefresh(randomUUID()),
        new Date(Date.now() + 86_400_000),
      ),
    ).resolves.toEqual({ status: 'reusado' });
    await expect(repo.daSessao(s.sessaoId)).resolves.toBeNull();

    const excluiu = await sessao();
    await repo.registrar(excluiu.sessaoId, token(), 'android');
    await new PostgresContaRepositorio(db).excluir(excluiu.usuarioId);
    const linhas = await db.query(
      'SELECT 1 FROM app.dispositivo WHERE sessao_id = $1',
      [excluiu.sessaoId],
    );
    expect(linhas).toEqual([]);
  });

  it('a API não enxerga a fila de avisos', async () => {
    await expect(db.query('SELECT 1 FROM app.notificacao')).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      db.query('SELECT 1 FROM app.notificacao_cursor'),
    ).rejects.toThrow(/permission denied/);
  });
});

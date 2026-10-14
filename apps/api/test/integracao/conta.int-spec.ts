import { randomUUID } from 'node:crypto';
import { PostgresUsuariosRepositorio } from '../../src/auth/postgres-usuarios.repositorio';
import { hashRefresh } from '../../src/auth/tokens';
import { PREFERENCIAS_PADRAO } from '../../src/conta/conta.repositorio';
import { PostgresContaRepositorio } from '../../src/conta/postgres-conta.repositorio';
import { Db } from '../../src/db/db';
import { PostgresSeguindoRepositorio } from '../../src/seguir/postgres-seguindo.repositorio';
import { dbDeTeste, Semente } from './banco';

describe('PostgresContaRepositorio (integração)', () => {
  let db: Db;
  let semente: Semente;
  let repo: PostgresContaRepositorio;
  let usuarios: PostgresUsuariosRepositorio;
  const criados: string[] = [];

  beforeAll(() => {
    db = dbDeTeste();
    semente = new Semente();
    repo = new PostgresContaRepositorio(db);
    usuarios = new PostgresUsuariosRepositorio(db);
  });

  afterAll(async () => {
    await db.query('DELETE FROM app.usuario WHERE id = ANY($1::uuid[])', [
      criados,
    ]);
    await semente.limpar();
    await db.fechar();
  });

  async function anonimo() {
    const sessao = await usuarios.criarAnonimo(
      'ios',
      hashRefresh(randomUUID()),
      new Date(Date.now() + 86_400_000),
    );
    criados.push(sessao.usuarioId);
    return sessao;
  }

  it('preferências: padrões, depois só os campos alterados', async () => {
    const { usuarioId } = await anonimo();
    await expect(repo.preferencias(usuarioId)).resolves.toEqual(
      PREFERENCIAS_PADRAO,
    );
    const primeira = await repo.salvarPreferencias(usuarioId, {
      uf: 'BA',
      silencioFim: '08:15',
    });
    expect(primeira).toEqual({
      ...PREFERENCIAS_PADRAO,
      uf: 'BA',
      silencioFim: '08:15',
    });
    const segunda = await repo.salvarPreferencias(usuarioId, {
      notificacoes: false,
      fuso: 'America/Manaus',
    });
    expect(segunda).toEqual({
      ...PREFERENCIAS_PADRAO,
      uf: 'BA',
      silencioFim: '08:15',
      notificacoes: false,
      fuso: 'America/Manaus',
    });
    await expect(repo.preferencias(usuarioId)).resolves.toEqual(segunda);
  });

  it('resumo com identidades, seguidos e sessões', async () => {
    const { usuarioId } = await anonimo();
    await usuarios.vincularIdentidade(usuarioId, 'google', `s-${randomUUID()}`);
    const pessoa = await semente.pessoa();
    await new PostgresSeguindoRepositorio(db).seguir(usuarioId, {
      tipo: 'pessoa',
      id: pessoa,
    });
    await expect(repo.resumo(usuarioId)).resolves.toMatchObject({
      usuarioId,
      identidades: ['google'],
      seguindo: 1,
      sessoesAtivas: 1,
    });
    await expect(repo.resumo(randomUUID())).resolves.toBeNull();
  });

  it('exclusão apaga tudo em cascata e derruba a sessão', async () => {
    const { usuarioId, sessaoId } = await anonimo();
    await repo.salvarPreferencias(usuarioId, { uf: 'SP' });
    await usuarios.vincularIdentidade(usuarioId, 'apple', `s-${randomUUID()}`);
    await expect(repo.excluir(usuarioId)).resolves.toBe(true);
    await expect(usuarios.sessaoAtiva(sessaoId, usuarioId)).resolves.toBe(
      false,
    );
    for (const tabela of [
      'app.preferencias',
      'app.identidade',
      'app.sessao',
      'app.seguindo',
    ]) {
      const linhas = await db.query(
        `SELECT 1 FROM ${tabela} WHERE usuario_id = $1`,
        [usuarioId],
      );
      expect(linhas).toEqual([]);
    }
    await expect(repo.excluir(usuarioId)).resolves.toBe(false);
  });
});

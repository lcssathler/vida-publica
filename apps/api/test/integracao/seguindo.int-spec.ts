import { randomUUID } from 'node:crypto';
import { PostgresUsuariosRepositorio } from '../../src/auth/postgres-usuarios.repositorio';
import { hashRefresh } from '../../src/auth/tokens';
import { Db } from '../../src/db/db';
import { PostgresSeguindoRepositorio } from '../../src/seguir/postgres-seguindo.repositorio';
import { dbDeTeste, Semente } from './banco';

describe('PostgresSeguindoRepositorio (integração)', () => {
  let db: Db;
  let semente: Semente;
  let repo: PostgresSeguindoRepositorio;
  let usuarios: PostgresUsuariosRepositorio;
  const criados: string[] = [];
  const tema = `Tema fictício ${randomUUID().slice(0, 8)}`;
  let pessoa: string;
  let partido: string;
  let proposicao: string;

  beforeAll(async () => {
    db = dbDeTeste();
    semente = new Semente();
    repo = new PostgresSeguindoRepositorio(db);
    usuarios = new PostgresUsuariosRepositorio(db);
    pessoa = await semente.pessoa('Fulana Fictícia');
    partido = await semente.partido();
    proposicao = await semente.proposicao([tema]);
  });

  afterAll(async () => {
    await db.query('DELETE FROM app.usuario WHERE id = ANY($1::uuid[])', [
      criados,
    ]);
    await semente.limpar();
    await db.fechar();
  });

  async function usuario() {
    const sessao = await usuarios.criarAnonimo(
      null,
      hashRefresh(randomUUID()),
      new Date(Date.now() + 86_400_000),
    );
    criados.push(sessao.usuarioId);
    return sessao;
  }

  it('confere que o alvo existe no canon', async () => {
    await expect(repo.existe({ tipo: 'pessoa', id: pessoa })).resolves.toBe(
      true,
    );
    await expect(repo.existe({ tipo: 'partido', id: partido })).resolves.toBe(
      true,
    );
    await expect(
      repo.existe({ tipo: 'proposicao', id: proposicao }),
    ).resolves.toBe(true);
    await expect(repo.existe({ tipo: 'assunto', id: tema })).resolves.toBe(
      true,
    );
    await expect(
      repo.existe({ tipo: 'pessoa', id: randomUUID() }),
    ).resolves.toBe(false);
    await expect(
      repo.existe({ tipo: 'assunto', id: 'Tema que não existe' }),
    ).resolves.toBe(false);
  });

  it('segue, lista com nomes do canon e deixa de seguir', async () => {
    const { usuarioId } = await usuario();
    await expect(
      repo.seguir(usuarioId, { tipo: 'pessoa', id: pessoa }),
    ).resolves.toBe(true);
    await expect(
      repo.seguir(usuarioId, { tipo: 'pessoa', id: pessoa }),
    ).resolves.toBe(false);
    await repo.seguir(usuarioId, { tipo: 'partido', id: partido });
    await repo.seguir(usuarioId, { tipo: 'proposicao', id: proposicao });
    await repo.seguir(usuarioId, { tipo: 'assunto', id: tema });

    const itens = await repo.listar(usuarioId);
    const porTipo = Object.fromEntries(itens.map((i) => [i.tipo, i]));
    expect(porTipo.pessoa.nome).toBe('Fulana Fictícia');
    expect(porTipo.partido.detalhe).toMatch(/^Partido Fictício/);
    expect(porTipo.proposicao).toMatchObject({
      nome: 'PL 1/10001',
      detalhe: 'Ementa fictícia',
    });
    expect(porTipo.assunto.nome).toBe(tema);
    await expect(repo.contar(usuarioId)).resolves.toBe(4);

    await expect(
      repo.deixar(usuarioId, { tipo: 'partido', id: partido }),
    ).resolves.toBe(true);
    await expect(
      repo.deixar(usuarioId, { tipo: 'partido', id: partido }),
    ).resolves.toBe(false);
    await expect(repo.contar(usuarioId)).resolves.toBe(3);
  });

  it('fusão leva o que a conta anônima seguia, sem duplicar', async () => {
    const destino = await usuario();
    const origem = await usuario();
    await repo.seguir(destino.usuarioId, { tipo: 'pessoa', id: pessoa });
    await repo.seguir(origem.usuarioId, { tipo: 'pessoa', id: pessoa });
    await repo.seguir(origem.usuarioId, { tipo: 'assunto', id: tema });

    await usuarios.moverSessao(
      origem.sessaoId,
      origem.usuarioId,
      destino.usuarioId,
      true,
    );
    const itens = await repo.listar(destino.usuarioId);
    expect(itens.map((i) => i.tipo).sort()).toEqual(['assunto', 'pessoa']);
    await expect(repo.contar(origem.usuarioId)).resolves.toBe(0);
  });

  it('lista assuntos com o número de proposições', async () => {
    const assuntos = await repo.assuntos();
    expect(assuntos).toContainEqual({ nome: tema, proposicoes: 1 });
  });
});

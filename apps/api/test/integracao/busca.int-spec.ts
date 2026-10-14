import { randomUUID } from 'node:crypto';
import { PostgresUsuariosRepositorio } from '../../src/auth/postgres-usuarios.repositorio';
import { hashRefresh } from '../../src/auth/tokens';
import { PostgresBuscaRepositorio } from '../../src/busca/postgres-busca.repositorio';
import { Db } from '../../src/db/db';
import { PostgresSeguindoRepositorio } from '../../src/seguir/postgres-seguindo.repositorio';
import { dbDeTeste, Semente } from './banco';

/** Palavra inventada só com letras: isola os registros deste teste. */
function marcaUnica(): string {
  return Array.from(randomUUID().replace(/-/g, '').slice(0, 8), (ch) =>
    String.fromCharCode(97 + (parseInt(ch, 16) % 26)),
  ).join('');
}

describe('PostgresBuscaRepositorio (integração)', () => {
  let db: Db;
  let semente: Semente;
  let repo: PostgresBuscaRepositorio;
  let usuarioId: string;
  const marca = `zq${marcaUnica()}`;
  let pessoa: string;
  let proposta: string;
  const tema = `Ação Fictícia ${marca}`;

  beforeAll(async () => {
    db = dbDeTeste();
    semente = new Semente();
    repo = new PostgresBuscaRepositorio(db);
    const sessao = await new PostgresUsuariosRepositorio(db).criarAnonimo(
      null,
      hashRefresh(randomUUID()),
      new Date(Date.now() + 86_400_000),
    );
    usuarioId = sessao.usuarioId;
    pessoa = await semente.pessoa(`Conceição ${marca} Araújo`);
    await semente.pessoa(`Outra Pessoa ${marca}`);
    proposta = (
      await semente.proposicaoComFonte([tema], {
        numero: 4321,
        ementa: `Institui as reformas tributárias ${marca} da saúde`,
      })
    ).id;
    await new PostgresSeguindoRepositorio(db).seguir(usuarioId, {
      tipo: 'pessoa',
      id: pessoa,
    });
  });

  afterAll(async () => {
    await db.query('DELETE FROM app.usuario WHERE id = $1', [usuarioId]);
    await semente.limpar();
    await db.fechar();
  });

  const c = (texto: string, limite = 5) => ({ usuarioId, texto, limite });

  it('acha pessoa sem acento e marca quem o usuário segue', async () => {
    const achadas = await repo.pessoas(c(`conceicao ${marca}`));
    expect(achadas[0]).toMatchObject({ id: pessoa, seguindo: true });
    const porSobrenome = await repo.pessoas(c(`${marca} araujo`));
    expect(porSobrenome.map((p) => p.id)).toContain(pessoa);
  });

  it('proposta por texto com radicais do português e por prefixo', async () => {
    // "reforma tributaria" (singular, sem acento) acha "reformas tributárias".
    const porTexto = await repo.propostas(c(`reforma tributaria ${marca}`));
    expect(porTexto.map((p) => p.id)).toEqual([proposta]);
    const porPrefixo = await repo.propostas(c(`saude ${marca.slice(0, 5)}`));
    expect(porPrefixo.map((p) => p.id)).toEqual([proposta]);
    await expect(repo.propostas(c(`aposentadoria ${marca}`))).resolves.toEqual(
      [],
    );
  });

  it('proposta pela identificação', async () => {
    // Ano fictício (10001) não é ano válido na busca: só sigla e número.
    const achadas = await repo.propostas(c('pl4321', 50));
    expect(achadas.map((p) => p.identificacao)).toContain('PL 4321/10001');
  });

  it('assunto sem acento', async () => {
    const achados = await repo.assuntos(c(`acao ficticia ${marca}`));
    expect(achados).toEqual([{ nome: tema, proposicoes: 1, seguindo: false }]);
  });

  it('partido pela sigla', async () => {
    const sigla = `Z${marcaUnica().slice(0, 5).toUpperCase()}`;
    const id = await semente.partido(sigla);
    const achados = await repo.partidos(c(sigla.toLowerCase()));
    expect(achados[0]).toMatchObject({ id, sigla, seguindo: false });
  });
});

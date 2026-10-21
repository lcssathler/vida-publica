import { randomUUID } from 'node:crypto';
import { PostgresUsuariosRepositorio } from '../../src/auth/postgres-usuarios.repositorio';
import { hashRefresh } from '../../src/auth/tokens';
import { Db } from '../../src/db/db';
import { ConsultaFeed } from '../../src/feed/feed.repositorio';
import { PostgresFeedRepositorio } from '../../src/feed/postgres-feed.repositorio';
import { PostgresSeguindoRepositorio } from '../../src/seguir/postgres-seguindo.repositorio';
import { dbDeTeste, Semente } from './banco';

describe('PostgresFeedRepositorio (integração)', () => {
  let db: Db;
  let semente: Semente;
  let feed: PostgresFeedRepositorio;
  let seguindo: PostgresSeguindoRepositorio;
  let usuarios: PostgresUsuariosRepositorio;
  const criados: string[] = [];
  // Tema único: isola os eventos deste teste dos que já estão no banco.
  const tema = `Tema do feed ${randomUUID().slice(0, 8)}`;
  const outroTema = `Outro tema ${randomUUID().slice(0, 8)}`;
  let candidata: string;
  let partido: string;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    db = dbDeTeste();
    semente = new Semente();
    feed = new PostgresFeedRepositorio(db);
    seguindo = new PostgresSeguindoRepositorio(db);
    usuarios = new PostgresUsuariosRepositorio(db);
    candidata = await semente.pessoa('Candidata Fictícia');
    partido = await semente.partido();
    const assunto = { tipo: 'assunto', id: tema };

    ids.geral3 = await semente.evento({
      ocorridoEm: '2001-01-03T12:00:00Z',
      alvos: [assunto, { tipo: 'partido', id: partido }],
      valor: 1234.56,
      payload: { votos: 3 },
    });
    // Dois eventos no mesmo instante: o cursor desempata pelo id.
    ids.geral2a = await semente.evento({
      ocorridoEm: '2001-01-02T12:00:00.123456Z',
      alvos: [assunto],
    });
    ids.geral2b = await semente.evento({
      ocorridoEm: '2001-01-02T12:00:00.123456Z',
      alvos: [assunto],
    });
    ids.geral1 = await semente.evento({
      ocorridoEm: '2001-01-01T12:00:00Z',
      alvos: [assunto, { tipo: 'assunto', id: outroTema }],
    });
    ids.seguidores = await semente.evento({
      ocorridoEm: '2001-01-04T12:00:00Z',
      visibilidade: 'seguidores',
      alvos: [assunto, { tipo: 'pessoa', id: candidata, papel: 'candidato' }],
    });
    ids.segurado = await semente.evento({
      ocorridoEm: '2001-01-05T12:00:00Z',
      status: 'segurado',
      alvos: [assunto],
    });
    ids.arquivado = await semente.evento({
      ocorridoEm: '2001-01-05T12:00:00Z',
      status: 'arquivado',
      alvos: [assunto],
    });
    ids.futuro = await semente.evento({
      ocorridoEm: '2099-12-31T12:00:00Z',
      alvos: [assunto],
    });
    ids.semFonte = await semente.evento({
      ocorridoEm: '2001-01-05T12:00:00Z',
      fonteUrl: null,
      alvos: [assunto],
    });
  });

  afterAll(async () => {
    await db.query('DELETE FROM app.usuario WHERE id = ANY($1::uuid[])', [
      criados,
    ]);
    await semente.limpar();
    await db.fechar();
  });

  async function usuario(): Promise<string> {
    const { usuarioId } = await usuarios.criarAnonimo(
      null,
      hashRefresh(randomUUID()),
      new Date(Date.now() + 86_400_000),
    );
    criados.push(usuarioId);
    return usuarioId;
  }

  const consulta = (
    usuarioId: string,
    extra: Partial<ConsultaFeed> = {},
  ): ConsultaFeed => ({
    usuarioId,
    escopo: 'todos',
    tipos: [],
    assuntos: [tema],
    alvo: null,
    depoisDe: null,
    limite: 20,
    ...extra,
  });

  it('só publicado com fonte; "seguidores" escondido de quem não segue', async () => {
    const u = await usuario();
    const { eventos, proximo } = await feed.pagina(consulta(u));
    const [primeiroMesmoInstante, segundoMesmoInstante] = [
      ids.geral2a,
      ids.geral2b,
    ].sort((a, b) => (a < b ? 1 : -1));
    expect(eventos.map((e) => e.id)).toEqual([
      ids.geral3,
      primeiroMesmoInstante,
      segundoMesmoInstante,
      ids.geral1,
    ]);
    expect(proximo).toBeNull();
  });

  it('quem segue um alvo vê o evento "seguidores"', async () => {
    const u = await usuario();
    await seguindo.seguir(u, { tipo: 'pessoa', id: candidata });
    const { eventos } = await feed.pagina(consulta(u));
    expect(eventos[0].id).toBe(ids.seguidores);
    expect(eventos[0].alvos).toContainEqual({
      tipo: 'pessoa',
      id: candidata,
      papel: 'candidato',
      nome: 'Candidata Fictícia',
      seguindo: true,
      // Candidata sem cadastro na Câmara nem no Senado: sem foto oficial.
      foto: null,
    });
    await expect(feed.evento(ids.seguidores, u)).resolves.not.toBeNull();
    await expect(
      feed.evento(ids.seguidores, await usuario()),
    ).resolves.toBeNull();
  });

  it('escopo seguindo traz só eventos de alvos seguidos', async () => {
    const u = await usuario();
    await seguindo.seguir(u, { tipo: 'partido', id: partido });
    const { eventos } = await feed.pagina(consulta(u, { escopo: 'seguindo' }));
    expect(eventos.map((e) => e.id)).toEqual([ids.geral3]);
    const nada = await feed.pagina(
      consulta(await usuario(), { escopo: 'seguindo' }),
    );
    expect(nada.eventos).toEqual([]);
  });

  it('seguir o assunto põe os eventos dele no feed seguindo', async () => {
    const u = await usuario();
    await seguindo.seguir(u, { tipo: 'assunto', id: outroTema });
    const { eventos } = await feed.pagina(
      consulta(u, { escopo: 'seguindo', assuntos: [] }),
    );
    expect(eventos.map((e) => e.id)).toEqual([ids.geral1]);
  });

  it('pagina por cursor sem pular nem repetir, mesmo no mesmo instante', async () => {
    const u = await usuario();
    const vistos: string[] = [];
    let depoisDe: ConsultaFeed['depoisDe'] = null;
    for (let i = 0; i < 10; i++) {
      const pagina = await feed.pagina(consulta(u, { limite: 1, depoisDe }));
      vistos.push(...pagina.eventos.map((e) => e.id));
      if (!pagina.proximo) break;
      depoisDe = pagina.proximo;
    }
    expect(vistos).toHaveLength(4);
    expect(new Set(vistos).size).toBe(4);
    expect(depoisDe?.ocorridoEm).toMatch(/2001-01-02 12:00:00\.123456\+00/);
  });

  it('data muito à frente fica fora da lista, mas o detalhe abre', async () => {
    const u = await usuario();
    const { eventos } = await feed.pagina(consulta(u));
    expect(eventos.map((e) => e.id)).not.toContain(ids.futuro);
    await expect(feed.evento(ids.futuro, u)).resolves.not.toBeNull();
  });

  it('filtra por tipo e por alvo', async () => {
    const u = await usuario();
    const deOutroTipo = await feed.pagina(consulta(u, { tipos: ['doacao'] }));
    expect(deOutroTipo.eventos).toEqual([]);
    const doTipo = await feed.pagina(consulta(u, { tipos: ['voto_nominal'] }));
    expect(doTipo.eventos).toHaveLength(4);
    const doPartido = await feed.pagina(
      consulta(u, { assuntos: [], alvo: { tipo: 'partido', id: partido } }),
    );
    expect(doPartido.eventos.map((e) => e.id)).toEqual([ids.geral3]);
  });

  it('detalhe traz fonte, regra, valor e payload; nunca o que não é publicado', async () => {
    const u = await usuario();
    const evento = await feed.evento(ids.geral3, u);
    expect(evento).toMatchObject({
      tipo: 'voto_nominal',
      valor: 1234.56,
      payload: { votos: 3 },
      fonte: { url: 'https://exemplo.gov.br/fonte' },
      regra: { versao: 99, descricao: 'Regra fictícia dos testes da API' },
    });
    expect(evento?.fonte.dadoEm).toBeInstanceOf(Date);
    for (const escondido of [ids.segurado, ids.arquivado, ids.semFonte]) {
      await expect(feed.evento(escondido, u)).resolves.toBeNull();
    }
  });
});

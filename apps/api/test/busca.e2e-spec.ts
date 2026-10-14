import request from 'supertest';
import { AppDeTeste, criarApp } from './fakes/app';

interface Resultado {
  q: string;
  pessoas: Array<{ nome: string }>;
  partidos: unknown[];
  propostas: Array<{ identificacao: string }>;
  assuntos: Array<{ nome: string }>;
}

describe('/busca (e2e)', () => {
  let t: AppDeTeste;
  const http = () => request(t.app.getHttpServer());

  beforeAll(async () => {
    t = await criarApp();
    t.busca.pessoasCadastradas.push(
      { id: '1', nome: 'Fulana da Saúde', detalhe: null, seguindo: false },
      { id: '2', nome: 'Beltrano', detalhe: null, seguindo: false },
    );
    t.busca.propostasCadastradas.push({
      id: '3',
      identificacao: 'PL 1/2026',
      ementa: 'Dispõe sobre a saúde',
      situacao: null,
      seguindo: false,
    });
    t.busca.assuntosCadastrados.push({
      nome: 'Saúde',
      proposicoes: 1,
      seguindo: false,
    });
  });

  afterAll(async () => {
    await t.app.close();
  });

  it('busca em todos os grupos, sem acento', async () => {
    const { authorization } = await t.anonimo();
    const r = (
      await http()
        .get('/busca')
        .query({ q: 'saude' })
        .set('authorization', authorization)
        .expect(200)
    ).body as Resultado;
    expect(r.q).toBe('saude');
    expect(r.pessoas.map((p) => p.nome)).toEqual(['Fulana da Saúde']);
    expect(r.propostas.map((p) => p.identificacao)).toEqual(['PL 1/2026']);
    expect(r.assuntos.map((a) => a.nome)).toEqual(['Saúde']);
    expect(t.busca.consultas.at(-1)?.limite).toBe(5);
  });

  it('um grupo só, com limite maior', async () => {
    const { authorization } = await t.anonimo();
    const r = (
      await http()
        .get('/busca')
        .query({ q: 'saude', tipo: 'pessoa', limite: 30 })
        .set('authorization', authorization)
        .expect(200)
    ).body as Resultado;
    expect(r.pessoas).toHaveLength(1);
    expect(r.propostas).toEqual([]);
    expect(t.busca.consultas.at(-1)?.limite).toBe(30);
  });

  it('valida a consulta', async () => {
    const { authorization } = await t.anonimo();
    for (const query of [
      {},
      { q: 'a' },
      { q: 'x'.repeat(101) },
      { q: 'saude', tipo: 'vereador' },
      { q: 'saude', limite: 30 },
    ]) {
      await http()
        .get('/busca')
        .query(query)
        .set('authorization', authorization)
        .expect(400);
    }
    await http().get('/busca').query({ q: 'saude' }).expect(401);
  });
});

import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppDeTeste, criarApp } from './fakes/app';

interface Pagina {
  itens: Array<{ id: string; fonte: { url: string } }>;
  proximoCursor: string | null;
}

describe('/feed (e2e)', () => {
  let t: AppDeTeste;
  const http = () => request(t.app.getHttpServer());
  const candidato = randomUUID();
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    t = await criarApp();
    t.seguindo.cadastrar({ tipo: 'pessoa', id: candidato }, 'Candidato');
    const saude = { tipo: 'assunto' as const, id: 'Saúde' };
    ids.antigo = t.feed.adicionar({
      ocorridoEm: new Date('2026-01-01'),
      alvos: [saude],
    });
    ids.novo = t.feed.adicionar({
      ocorridoEm: new Date('2026-02-01'),
      tipo: 'despesa_mensal',
    });
    ids.seguidores = t.feed.adicionar({
      ocorridoEm: new Date('2026-03-01'),
      tipo: 'doacao',
      visibilidade: 'seguidores',
      alvos: [{ tipo: 'pessoa', id: candidato, papel: 'candidato' }],
    });
    ids.segurado = t.feed.adicionar({
      ocorridoEm: new Date('2026-04-01'),
      status: 'segurado',
    });
  });

  afterAll(async () => {
    await t.app.close();
  });

  it('exige token', async () => {
    await http().get('/feed').expect(401);
  });

  it('feed geral pagina por cursor e nunca mostra segurado nem "seguidores" sem seguir', async () => {
    const { authorization } = await t.anonimo();
    const p1 = (
      await http()
        .get('/feed?escopo=todos&limite=1')
        .set('authorization', authorization)
        .expect(200)
    ).body as Pagina;
    expect(p1.itens.map((i) => i.id)).toEqual([ids.novo]);
    expect(p1.itens[0].fonte.url).toMatch(/^https:/);
    const p2 = (
      await http()
        .get('/feed')
        .query({ escopo: 'todos', limite: 1, cursor: p1.proximoCursor })
        .set('authorization', authorization)
        .expect(200)
    ).body as Pagina;
    expect(p2.itens.map((i) => i.id)).toEqual([ids.antigo]);
    expect(p2.proximoCursor).toBeNull();
  });

  it('seguindo o candidato, o evento "seguidores" aparece', async () => {
    const { authorization } = await t.anonimo();
    await http()
      .put(`/seguindo/pessoa/${candidato}`)
      .set('authorization', authorization)
      .expect(200);
    const feed = (
      await http().get('/feed').set('authorization', authorization).expect(200)
    ).body as Pagina;
    expect(feed.itens.map((i) => i.id)).toEqual([ids.seguidores]);
    await http()
      .get(`/eventos/${ids.seguidores}`)
      .set('authorization', authorization)
      .expect(200);
  });

  it('filtra por tipo (vírgula ou repetido) e por assunto', async () => {
    const { authorization } = await t.anonimo();
    const porTipo = (
      await http()
        .get('/feed?escopo=todos&tipo=despesa_mensal,voto_nominal')
        .set('authorization', authorization)
        .expect(200)
    ).body as Pagina;
    expect(porTipo.itens).toHaveLength(2);
    const porAssunto = (
      await http()
        .get('/feed')
        .query({ escopo: 'todos', assunto: 'Saúde' })
        .set('authorization', authorization)
        .expect(200)
    ).body as Pagina;
    expect(porAssunto.itens.map((i) => i.id)).toEqual([ids.antigo]);
  });

  it('400 para tipo desconhecido, cursor forjado e limite alto', async () => {
    const { authorization } = await t.anonimo();
    for (const query of [
      'tipo=fofoca',
      'cursor=forjado',
      'limite=500',
      'escopo=amigos',
    ]) {
      await http()
        .get(`/feed?${query}`)
        .set('authorization', authorization)
        .expect(400);
    }
  });

  it('detalhe: 404 para segurado, "seguidores" sem seguir e id inexistente', async () => {
    const { authorization } = await t.anonimo();
    for (const id of [ids.segurado, ids.seguidores, randomUUID()]) {
      await http()
        .get(`/eventos/${id}`)
        .set('authorization', authorization)
        .expect(404);
    }
    await http()
      .get('/eventos/nao-e-uuid')
      .set('authorization', authorization)
      .expect(400);
  });
});

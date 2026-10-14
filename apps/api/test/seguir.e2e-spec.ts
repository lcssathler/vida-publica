import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppDeTeste, criarApp } from './fakes/app';

describe('/seguindo (e2e)', () => {
  let t: AppDeTeste;
  const http = () => request(t.app.getHttpServer());
  const pessoa = randomUUID();

  beforeAll(async () => {
    t = await criarApp();
    t.seguindo.cadastrar(
      { tipo: 'pessoa', id: pessoa },
      'Fulana de Tal',
      'Deputada · SP',
    );
    t.seguindo.cadastrar({ tipo: 'partido', id: '21' }, 'PT');
    t.seguindo.cadastrar(
      { tipo: 'assunto', id: 'Meio Ambiente e Desenvolvimento Sustentável' },
      'Meio Ambiente e Desenvolvimento Sustentável',
    );
  });

  afterAll(async () => {
    await t.app.close();
  });

  it('exige token', async () => {
    await http().get('/seguindo').expect(401);
  });

  it('segue, lista e deixa de seguir', async () => {
    const { authorization } = await t.anonimo();
    const primeiro = await http()
      .put(`/seguindo/pessoa/${pessoa}`)
      .set('authorization', authorization)
      .expect(200);
    expect(primeiro.body).toEqual({ seguindo: true, novo: true });
    const repetido = await http()
      .put(`/seguindo/pessoa/${pessoa}`)
      .set('authorization', authorization)
      .expect(200);
    expect(repetido.body).toEqual({ seguindo: true, novo: false });
    await http()
      .put(
        `/seguindo/assunto/${encodeURIComponent('Meio Ambiente e Desenvolvimento Sustentável')}`,
      )
      .set('authorization', authorization)
      .expect(200);

    const lista = await http()
      .get('/seguindo')
      .set('authorization', authorization)
      .expect(200);
    expect(lista.body).toMatchObject({
      itens: [
        {
          tipo: 'assunto',
          id: 'Meio Ambiente e Desenvolvimento Sustentável',
        },
        { tipo: 'pessoa', id: pessoa, nome: 'Fulana de Tal' },
      ],
    });

    await http()
      .delete(`/seguindo/pessoa/${pessoa}`)
      .set('authorization', authorization)
      .expect(204);
    const depois = await http()
      .get('/seguindo')
      .set('authorization', authorization)
      .expect(200);
    expect((depois.body as { itens: unknown[] }).itens).toHaveLength(1);
  });

  it('404 para alvo inexistente e 400 para id malformado', async () => {
    const { authorization } = await t.anonimo();
    await http()
      .put(`/seguindo/pessoa/${randomUUID()}`)
      .set('authorization', authorization)
      .expect(404);
    await http()
      .put('/seguindo/partido/PT')
      .set('authorization', authorization)
      .expect(400);
    await http()
      .put('/seguindo/vereador/1')
      .set('authorization', authorization)
      .expect(400);
  });

  it('o que a conta anônima seguia passa para a conta do login', async () => {
    const a = await t.anonimo();
    await http()
      .post('/auth/entrar/google')
      .set('authorization', a.authorization)
      .send({ token: 'valido-token-teste:seguir-e2e' })
      .expect(200);
    await http()
      .put('/seguindo/partido/21')
      .set('authorization', a.authorization)
      .expect(200);

    const b = await t.anonimo();
    await http()
      .put(`/seguindo/pessoa/${pessoa}`)
      .set('authorization', b.authorization)
      .expect(200);
    const login = await http()
      .post('/auth/entrar/google')
      .set('authorization', b.authorization)
      .send({ token: 'valido-token-teste:seguir-e2e' })
      .expect(200);
    const acesso = (login.body as { acesso: { token: string } }).acesso.token;

    const lista = await http()
      .get('/seguindo')
      .set('authorization', `Bearer ${acesso}`)
      .expect(200);
    const itens = (lista.body as { itens: Array<{ tipo: string }> }).itens;
    expect(itens.map((i) => i.tipo).sort()).toEqual(['partido', 'pessoa']);
  });

  it('lista assuntos', async () => {
    const { authorization } = await t.anonimo();
    const resposta = await http()
      .get('/assuntos')
      .set('authorization', authorization)
      .expect(200);
    expect(resposta.body).toMatchObject({
      itens: [{ nome: 'Meio Ambiente e Desenvolvimento Sustentável' }],
    });
  });
});

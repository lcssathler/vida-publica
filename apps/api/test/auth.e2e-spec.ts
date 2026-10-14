import request from 'supertest';
import { AppDeTeste, criarApp } from './fakes/app';

interface Par {
  usuarioId: string;
  acesso: { token: string; expiraEm: string };
  refresh: { token: string; expiraEm: string };
}

describe('/auth (e2e)', () => {
  let t: AppDeTeste;
  const http = () => request(t.app.getHttpServer());

  beforeAll(async () => {
    t = await criarApp();
  });

  afterAll(async () => {
    await t.app.close();
  });

  async function anonimo(): Promise<Par> {
    const resposta = await http()
      .post('/auth/anonimo')
      .send({ plataforma: 'android' })
      .expect(201);
    return resposta.body as Par;
  }

  it('cria conta anônima e acessa rota protegida com o token', async () => {
    const par = await anonimo();
    expect(par.refresh.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    await http()
      .post('/auth/sair')
      .set('authorization', `Bearer ${par.acesso.token}`)
      .expect(204);
  });

  it('rota protegida sem token responde 401', async () => {
    await http().post('/auth/sair').expect(401);
    await http()
      .post('/auth/sair')
      .set('authorization', 'Bearer abc.def.ghi')
      .expect(401);
  });

  it('/health continua público', async () => {
    await http().get('/health').expect(200);
  });

  it('valida a plataforma', async () => {
    const resposta = await http()
      .post('/auth/anonimo')
      .send({ plataforma: 'symbian' })
      .expect(400);
    expect(resposta.body).toMatchObject({
      campos: [{ campo: 'plataforma' }],
    });
  });

  it('renova, e reuso do refresh encerra a sessão', async () => {
    const par = await anonimo();
    const novo = (
      await http()
        .post('/auth/renovar')
        .send({ refresh: par.refresh.token })
        .expect(200)
    ).body as Par;
    expect(novo.usuarioId).toBe(par.usuarioId);

    const reuso = await http()
      .post('/auth/renovar')
      .send({ refresh: par.refresh.token })
      .expect(401);
    expect((reuso.body as { message: string }).message).toMatch(/já usado/);

    // A sessão caiu: até o token de acesso novo deixa de valer.
    await http()
      .post('/auth/sair')
      .set('authorization', `Bearer ${novo.acesso.token}`)
      .expect(401);
  });

  it('depois de sair, o token de acesso não vale mais', async () => {
    const par = await anonimo();
    const auth = `Bearer ${par.acesso.token}`;
    await http().post('/auth/sair').set('authorization', auth).expect(204);
    await http().post('/auth/sair').set('authorization', auth).expect(401);
  });

  it('login Google vincula e, em outro aparelho, entra na mesma conta', async () => {
    const a = await anonimo();
    const loginA = await http()
      .post('/auth/entrar/google')
      .set('authorization', `Bearer ${a.acesso.token}`)
      .send({ token: 'valido-token-teste:sub-e2e' })
      .expect(200);
    expect(loginA.body).toMatchObject({
      usuarioId: a.usuarioId,
      contaExistente: false,
    });

    const b = await anonimo();
    const loginB = await http()
      .post('/auth/entrar/google')
      .set('authorization', `Bearer ${b.acesso.token}`)
      .send({ token: 'valido-token-teste:sub-e2e' })
      .expect(200);
    expect(loginB.body).toMatchObject({
      usuarioId: a.usuarioId,
      contaExistente: true,
    });
  });

  it('token de provedor inválido responde 403 e provedor desconhecido 400', async () => {
    const par = await anonimo();
    const auth = `Bearer ${par.acesso.token}`;
    await http()
      .post('/auth/entrar/apple')
      .set('authorization', auth)
      .send({ token: 'forjado-mas-comprido' })
      .expect(403);
    await http()
      .post('/auth/entrar/facebook')
      .set('authorization', auth)
      .send({ token: 'valido-token-teste:x' })
      .expect(400);
  });
});

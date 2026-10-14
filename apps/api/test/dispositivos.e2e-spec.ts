import request from 'supertest';
import { AppDeTeste, criarApp } from './fakes/app';

const TOKEN = `fcm-teste:${'A1b2_C3d4-'.repeat(12)}`;

describe('/dispositivo (e2e)', () => {
  let t: AppDeTeste;
  const http = () => request(t.app.getHttpServer());

  beforeAll(async () => {
    t = await criarApp();
  });

  afterAll(async () => {
    await t.app.close();
  });

  async function sessao() {
    const resposta = await http().post('/auth/anonimo').send({}).expect(201);
    const corpo = resposta.body as {
      acesso: { token: string };
      refresh: { token: string };
    };
    return {
      authorization: `Bearer ${corpo.acesso.token}`,
      refresh: corpo.refresh.token,
    };
  }

  it('exige token de acesso', async () => {
    await http().get('/dispositivo').expect(401);
    await http().put('/dispositivo').send({ token: TOKEN }).expect(401);
    await http().delete('/dispositivo').expect(401);
  });

  it('registra só o token e a plataforma, troca e apaga', async () => {
    const { authorization } = await sessao();
    await http()
      .get('/dispositivo')
      .set('authorization', authorization)
      .expect(200, { registrado: false, plataforma: null });
    await http()
      .put('/dispositivo')
      .set('authorization', authorization)
      .send({ token: TOKEN, plataforma: 'android' })
      .expect(204);
    await http()
      .get('/dispositivo')
      .set('authorization', authorization)
      .expect(200, { registrado: true, plataforma: 'android' });
    await http()
      .put('/dispositivo')
      .set('authorization', authorization)
      .send({ token: `${TOKEN}-2`, plataforma: 'ios' })
      .expect(204);
    expect(t.dispositivos.tokens()).toContain(`${TOKEN}-2`);
    expect(t.dispositivos.tokens()).not.toContain(TOKEN);
    await http()
      .delete('/dispositivo')
      .set('authorization', authorization)
      .expect(204);
    await http()
      .get('/dispositivo')
      .set('authorization', authorization)
      .expect(200, { registrado: false, plataforma: null });
  });

  it('recusa token malformado, plataforma desconhecida e campo a mais', async () => {
    const { authorization } = await sessao();
    for (const corpo of [
      {},
      { token: 'curto', plataforma: 'android' },
      { token: `${TOKEN} com espaço`, plataforma: 'android' },
      { token: TOKEN, plataforma: 'web' },
      { token: TOKEN, plataforma: 'android', modelo: 'Pixel' },
    ]) {
      await http()
        .put('/dispositivo')
        .set('authorization', authorization)
        .send(corpo)
        .expect(400);
    }
  });

  it('o mesmo token em outra sessão sai da anterior', async () => {
    const a = await sessao();
    const b = await sessao();
    for (const s of [a, b]) {
      await http()
        .put('/dispositivo')
        .set('authorization', s.authorization)
        .send({ token: `${TOKEN}-unico`, plataforma: 'android' })
        .expect(204);
    }
    await http()
      .get('/dispositivo')
      .set('authorization', a.authorization)
      .expect(200, { registrado: false, plataforma: null });
    expect(
      t.dispositivos.tokens().filter((x) => x === `${TOKEN}-unico`),
    ).toHaveLength(1);
  });

  it('sair, reuso do refresh e excluir a conta apagam o token', async () => {
    const registrar = async (authorization: string, token: string) =>
      http()
        .put('/dispositivo')
        .set('authorization', authorization)
        .send({ token, plataforma: 'android' })
        .expect(204);

    const saiu = await sessao();
    await registrar(saiu.authorization, `${TOKEN}-saiu`);
    await http()
      .post('/auth/sair')
      .set('authorization', saiu.authorization)
      .expect(204);

    const vazou = await sessao();
    await registrar(vazou.authorization, `${TOKEN}-vazou`);
    await http()
      .post('/auth/renovar')
      .send({ refresh: vazou.refresh })
      .expect(200);
    await http()
      .post('/auth/renovar')
      .send({ refresh: vazou.refresh })
      .expect(401);

    const excluiu = await sessao();
    await registrar(excluiu.authorization, `${TOKEN}-excluiu`);
    await http()
      .delete('/conta')
      .set('authorization', excluiu.authorization)
      .expect(204);

    const restantes = t.dispositivos.tokens();
    for (const fim of ['saiu', 'vazou', 'excluiu']) {
      expect(restantes).not.toContain(`${TOKEN}-${fim}`);
    }
  });
});

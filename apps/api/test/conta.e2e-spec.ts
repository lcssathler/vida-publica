import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppDeTeste, criarApp } from './fakes/app';

describe('/conta (e2e)', () => {
  let t: AppDeTeste;
  const http = () => request(t.app.getHttpServer());

  beforeAll(async () => {
    t = await criarApp();
  });

  afterAll(async () => {
    await t.app.close();
  });

  it('mostra a conta anônima com as preferências padrão', async () => {
    const { authorization, usuarioId } = await t.anonimo();
    const resposta = await http()
      .get('/conta')
      .set('authorization', authorization)
      .expect(200);
    expect(resposta.body).toMatchObject({
      usuarioId,
      anonima: true,
      identidades: [],
      seguindo: 0,
      sessoesAtivas: 1,
      preferencias: {
        uf: null,
        notificacoes: true,
        maxPorDia: 5,
        silencioInicio: '22:00',
        silencioFim: '07:00',
        fuso: 'America/Sao_Paulo',
      },
    });
  });

  it('altera só os campos enviados e valida', async () => {
    const { authorization } = await t.anonimo();
    const alterada = await http()
      .patch('/conta/preferencias')
      .set('authorization', authorization)
      .send({ uf: 'MG', silencioInicio: '23:30' })
      .expect(200);
    expect(alterada.body).toMatchObject({
      uf: 'MG',
      silencioInicio: '23:30',
      silencioFim: '07:00',
      notificacoes: true,
    });
    for (const corpo of [
      {},
      { uf: 'XX' },
      { silencioInicio: '25:00' },
      { maxPorDia: 0 },
      { fuso: 'Europe/Lisbon' },
      { email: 'alguem@exemplo.com' },
    ]) {
      await http()
        .patch('/conta/preferencias')
        .set('authorization', authorization)
        .send(corpo)
        .expect(400);
    }
    const lida = await http()
      .get('/conta/preferencias')
      .set('authorization', authorization)
      .expect(200);
    expect(lida.body).toMatchObject({ uf: 'MG' });
  });

  it('exclui a conta: o token deixa de valer e o refresh também', async () => {
    const resposta = await http().post('/auth/anonimo').send({}).expect(201);
    const { acesso, refresh, usuarioId } = resposta.body as {
      usuarioId: string;
      acesso: { token: string };
      refresh: { token: string };
    };
    const authorization = `Bearer ${acesso.token}`;
    const pessoa = randomUUID();
    t.seguindo.cadastrar({ tipo: 'pessoa', id: pessoa }, 'Fulana');
    await http()
      .put(`/seguindo/pessoa/${pessoa}`)
      .set('authorization', authorization)
      .expect(200);

    await http()
      .delete('/conta')
      .set('authorization', authorization)
      .expect(204);

    await http().get('/conta').set('authorization', authorization).expect(401);
    await http()
      .post('/auth/renovar')
      .send({ refresh: refresh.token })
      .expect(401);
    expect(t.usuarios.usuarios.has(usuarioId)).toBe(false);
    expect(t.seguindo.seguidos.has(usuarioId)).toBe(false);
  });
});

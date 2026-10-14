import request from 'supertest';
import { Limites } from '../src/limite/politicas';
import { AppDeTeste, criarApp } from './fakes/app';

describe('limite de requisições (e2e)', () => {
  let t: AppDeTeste;
  const http = () => request(t.app.getHttpServer());

  beforeAll(async () => {
    t = await criarApp([
      [
        Limites,
        new Limites({
          usuario: { max: 3, janelaMs: 60_000, por: 'usuario' },
          ip: { max: 5, janelaMs: 60_000, por: 'ip' },
          contas: { max: 3, janelaMs: 600_000, por: 'ip' },
          busca: { max: 1, janelaMs: 60_000, por: 'usuario' },
        }),
      ],
    ]);
  });

  afterAll(async () => {
    await t.app.close();
  });

  it('conta por usuário nas rotas autenticadas, não por IP', async () => {
    const a = await t.anonimo();
    const b = await t.anonimo();
    for (let i = 0; i < 3; i++) {
      const r = await http()
        .get('/seguindo')
        .set('authorization', a.authorization)
        .expect(200);
      expect(r.headers['ratelimit-remaining']).toBe(String(2 - i));
    }
    const recusada = await http()
      .get('/seguindo')
      .set('authorization', a.authorization)
      .expect(429);
    expect(Number(recusada.headers['retry-after'])).toBeGreaterThan(0);
    // Outro usuário, mesmo IP: segue livre.
    await http()
      .get('/seguindo')
      .set('authorization', b.authorization)
      .expect(200);
  });

  it('limita a criação de contas por IP e deixa a saúde de fora', async () => {
    // Duas contas já foram criadas no teste anterior; a terceira ainda passa.
    await http().post('/auth/anonimo').send({}).expect(201);
    await http().post('/auth/anonimo').send({}).expect(429);
    for (let i = 0; i < 10; i++) await http().get('/health').expect(200);
  });
});

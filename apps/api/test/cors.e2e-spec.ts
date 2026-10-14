import request from 'supertest';
import { opcoesCors } from '../src/comum/cors';
import { validateEnv } from '../src/config/env';
import { AppDeTeste, criarApp } from './fakes/app';

const ORIGEM = 'http://localhost:8081';

describe('CORS (e2e)', () => {
  let t: AppDeTeste;
  const http = () => request(t.app.getHttpServer());

  beforeAll(async () => {
    t = await criarApp([], (app) => {
      const cors = opcoesCors([ORIGEM]);
      if (cors) app.enableCors(cors);
    });
  });

  afterAll(async () => {
    await t.app.close();
  });

  it('desligado quando não há origens configuradas', () => {
    expect(opcoesCors([])).toBeNull();
  });

  it('responde ao preflight da origem permitida com Authorization', async () => {
    const resposta = await http()
      .options('/feed')
      .set('Origin', ORIGEM)
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'authorization')
      .expect(204);
    expect(resposta.headers['access-control-allow-origin']).toBe(ORIGEM);
    expect(resposta.headers['access-control-allow-headers']).toMatch(
      /Authorization/,
    );
  });

  it('expõe Retry-After e RateLimit-* para o app tratar o 429', async () => {
    const resposta = await http()
      .post('/auth/anonimo')
      .set('Origin', ORIGEM)
      .send({})
      .expect(201);
    expect(resposta.headers['access-control-expose-headers']).toMatch(
      /Retry-After/,
    );
    expect(resposta.headers['access-control-expose-headers']).toMatch(
      /RateLimit-Reset/,
    );
  });

  it('não libera outra origem', async () => {
    const resposta = await http()
      .post('/auth/anonimo')
      .set('Origin', 'https://outro.exemplo')
      .send({});
    expect(resposta.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('a configuração aceita lista de URLs e recusa texto inválido', () => {
    const base = {
      DATABASE_URL: 'postgres://vp_api:x@127.0.0.1:5433/vida_publica',
      JWT_SECRET: 'x'.repeat(32),
    };
    expect(
      validateEnv({ ...base, CORS_ORIGENS: `${ORIGEM}, http://127.0.0.1:8081` })
        .CORS_ORIGENS,
    ).toEqual([ORIGEM, 'http://127.0.0.1:8081']);
    expect(() => validateEnv({ ...base, CORS_ORIGENS: 'qualquer' })).toThrow(
      /CORS_ORIGENS/,
    );
  });
});

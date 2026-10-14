import { validateEnv } from './env';

const obrigatorias = {
  DATABASE_URL: 'postgres://vp_api:x@127.0.0.1:5433/vida_publica',
  JWT_SECRET: 'x'.repeat(32),
};

describe('validateEnv', () => {
  it('aplica valores padrão quando só o obrigatório é informado', () => {
    expect(validateEnv(obrigatorias)).toEqual({
      ...obrigatorias,
      NODE_ENV: 'development',
      PORT: 3000,
      LOG_LEVEL: 'info',
      DB_POOL_MAX: 10,
      JWT_ACESSO_MINUTOS: 15,
      REFRESH_DIAS: 60,
      APPLE_CLIENT_IDS: [],
      GOOGLE_CLIENT_IDS: [],
      LIMITE_POR_MINUTO: 120,
      LIMITE_IP_POR_MINUTO: 30,
      LIMITE_CONTAS_POR_IP: 10,
      TRUST_PROXY: 0,
      CORS_ORIGENS: [],
    });
  });

  it('converte a porta de texto para número', () => {
    expect(validateEnv({ ...obrigatorias, PORT: '8080' }).PORT).toBe(8080);
  });

  it('rejeita porta inválida com mensagem clara', () => {
    expect(() => validateEnv({ ...obrigatorias, PORT: '99999' })).toThrow(
      /Configuração inválida: PORT/,
    );
  });

  it('rejeita ambiente desconhecido', () => {
    expect(() => validateEnv({ ...obrigatorias, NODE_ENV: 'staging' })).toThrow(
      /NODE_ENV/,
    );
  });

  it('exige banco e segredo dos tokens', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL.*JWT_SECRET/);
  });

  it('rejeita segredo curto', () => {
    expect(() => validateEnv({ ...obrigatorias, JWT_SECRET: 'curto' })).toThrow(
      /JWT_SECRET/,
    );
  });

  it('separa as audiências dos provedores', () => {
    const env = validateEnv({
      ...obrigatorias,
      GOOGLE_CLIENT_IDS:
        'a.apps.googleusercontent.com, b.apps.googleusercontent.com',
    });
    expect(env.GOOGLE_CLIENT_IDS).toEqual([
      'a.apps.googleusercontent.com',
      'b.apps.googleusercontent.com',
    ]);
  });
});

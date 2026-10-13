import { validateEnv } from './env';

describe('validateEnv', () => {
  it('aplica valores padrão quando nada é informado', () => {
    expect(validateEnv({})).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      LOG_LEVEL: 'info',
    });
  });

  it('converte a porta de texto para número', () => {
    expect(validateEnv({ PORT: '8080' }).PORT).toBe(8080);
  });

  it('rejeita porta inválida com mensagem clara', () => {
    expect(() => validateEnv({ PORT: '99999' })).toThrow(
      /Configuração inválida: PORT/,
    );
  });

  it('rejeita ambiente desconhecido', () => {
    expect(() => validateEnv({ NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });
});

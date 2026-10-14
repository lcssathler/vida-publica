import { SignJWT } from 'jose';
import { configDeTeste } from '../../test/fakes/config';
import { hashRefresh, TokenInvalido, Tokens } from './tokens';

describe('Tokens', () => {
  const tokens = new Tokens(configDeTeste({ JWT_ACESSO_MINUTOS: '15' }));
  const id = { usuarioId: 'u-1', sessaoId: 's-1' };

  it('emite token de acesso curto que volta a identificar usuário e sessão', async () => {
    const agora = new Date();
    const acesso = await tokens.acesso(id, agora);
    expect(acesso.expiraEm.getTime() - agora.getTime()).toBe(15 * 60_000);
    await expect(tokens.verificarAcesso(acesso.token)).resolves.toEqual(id);
  });

  it('recusa token vencido', async () => {
    const acesso = await tokens.acesso(id, new Date(Date.now() - 60 * 60_000));
    await expect(tokens.verificarAcesso(acesso.token)).rejects.toBeInstanceOf(
      TokenInvalido,
    );
  });

  it('recusa token assinado com outro segredo', async () => {
    const outro = new Tokens(configDeTeste({ JWT_SECRET: 'y'.repeat(40) }));
    const acesso = await outro.acesso(id);
    await expect(tokens.verificarAcesso(acesso.token)).rejects.toBeInstanceOf(
      TokenInvalido,
    );
  });

  it('recusa token sem sessão', async () => {
    const segredo = new TextEncoder().encode(process.env.JWT_SECRET);
    const semSessao = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('vida-publica-api')
      .setAudience('vida-publica-app')
      .setSubject('u-1')
      .setExpirationTime('5m')
      .sign(segredo);
    await expect(tokens.verificarAcesso(semSessao)).rejects.toBeInstanceOf(
      TokenInvalido,
    );
  });

  it('gera refresh aleatório e guarda só o hash', () => {
    const a = tokens.refresh();
    const b = tokens.refresh();
    expect(a.token).not.toBe(b.token);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.hash).toBe(hashRefresh(a.token));
    expect(a.hash).not.toContain(a.token);
  });
});

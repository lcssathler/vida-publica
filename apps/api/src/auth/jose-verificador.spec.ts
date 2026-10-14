import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  JWTVerifyGetKey,
  SignJWT,
} from 'jose';
import { ConfigProvedor, JoseVerificador } from './jose-verificador';
import {
  IdentidadeInvalida,
  ProvedorDesligado,
} from './verificador-identidade';

describe('JoseVerificador', () => {
  let chavePrivada: CryptoKey;
  let chaves: JWTVerifyGetKey;
  let verificador: JoseVerificador;

  const google = (extra: Partial<ConfigProvedor> = {}): ConfigProvedor => ({
    emissores: ['https://accounts.google.com'],
    audiencias: ['app-teste.apps.googleusercontent.com'],
    chaves,
    ...extra,
  });

  beforeAll(async () => {
    const par = await generateKeyPair('RS256');
    chavePrivada = par.privateKey;
    const jwk = {
      ...(await exportJWK(par.publicKey)),
      kid: 'k1',
      alg: 'RS256',
    };
    chaves = createLocalJWKSet({ keys: [jwk] });
    verificador = new JoseVerificador({
      google: google(),
      apple: google({ audiencias: [] }),
    });
  });

  function token(
    claims: { iss?: string; aud?: string; sub?: string } = {},
    expira = '5m',
  ): Promise<string> {
    const jwt = new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(claims.iss ?? 'https://accounts.google.com')
      .setAudience(claims.aud ?? 'app-teste.apps.googleusercontent.com')
      .setIssuedAt()
      .setExpirationTime(expira);
    if (claims.sub !== '') jwt.setSubject(claims.sub ?? 'sujeito-123');
    return jwt.sign(chavePrivada);
  }

  it('devolve o sujeito de um token válido', async () => {
    await expect(verificador.verificar('google', await token())).resolves.toBe(
      'sujeito-123',
    );
  });

  it.each([
    ['outra audiência', { aud: 'outro-app' }],
    ['outro emissor', { iss: 'https://evil.example' }],
    ['sem sujeito', { sub: '' }],
  ])('recusa token com %s', async (_caso, claims) => {
    await expect(
      verificador.verificar('google', await token(claims)),
    ).rejects.toBeInstanceOf(IdentidadeInvalida);
  });

  it('recusa token vencido', async () => {
    const vencido = await token({}, '-10m');
    await expect(
      verificador.verificar('google', vencido),
    ).rejects.toBeInstanceOf(IdentidadeInvalida);
  });

  it('recusa texto que não é token', async () => {
    await expect(
      verificador.verificar('google', 'nao-e-um-token-jwt'),
    ).rejects.toBeInstanceOf(IdentidadeInvalida);
  });

  it('avisa quando o provedor não está configurado', async () => {
    await expect(
      verificador.verificar('apple', await token()),
    ).rejects.toBeInstanceOf(ProvedorDesligado);
  });
});

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (
  senha: string,
  sal: Buffer,
  tamanho: number,
  opcoes: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

// scrypt (node:crypto, sem binário nativo). N = 2^15 leva ~100 ms: caro para
// quem tenta adivinhar, barato para um login por expediente.
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const TAMANHO = 32;

/** Hash da senha no formato scrypt$N$r$p$sal$hash (base64url). */
export async function hashSenha(senha: string): Promise<string> {
  const sal = randomBytes(16);
  const hash = await scryptAsync(senha.normalize('NFC'), sal, TAMANHO, SCRYPT);
  return [
    'scrypt',
    SCRYPT.N,
    SCRYPT.r,
    SCRYPT.p,
    sal.toString('base64url'),
    hash.toString('base64url'),
  ].join('$');
}

export async function conferirSenha(
  senha: string,
  guardado: string,
): Promise<boolean> {
  const partes = guardado.split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false;
  const [, n, r, p, sal, hash] = partes;
  const esperado = Buffer.from(hash, 'base64url');
  const obtido = await scryptAsync(
    senha.normalize('NFC'),
    Buffer.from(sal, 'base64url'),
    esperado.length,
    { N: Number(n), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem },
  );
  return obtido.length === esperado.length && timingSafeEqual(obtido, esperado);
}

/**
 * Hash de senha inexistente, para que um e-mail desconhecido leve o mesmo
 * tempo que uma senha errada (sem revelar quem tem conta).
 */
export const HASH_FICTICIO =
  'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

/** Senha inicial aleatória, legível (sem 0/O, 1/l). */
export function senhaAleatoria(tamanho = 20): string {
  const alfabeto = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(tamanho);
  return [...bytes].map((b) => alfabeto[b % alfabeto.length]).join('');
}

// ---------------------------------------------------------------------------
// TOTP (RFC 6238): HMAC-SHA1, 6 dígitos, passo de 30 s. É o que os apps de
// autenticação (Google Authenticator, Aegis, 1Password) usam por padrão.

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32(bytes: Buffer): string {
  let bits = 0;
  let valor = 0;
  let saida = '';
  for (const byte of bytes) {
    valor = (valor << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      saida += BASE32[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) saida += BASE32[(valor << (5 - bits)) & 31];
  return saida;
}

export function deBase32(texto: string): Buffer {
  const limpo = texto.replace(/=+$/, '').toUpperCase();
  let bits = 0;
  let valor = 0;
  const bytes: number[] = [];
  for (const c of limpo) {
    const i = BASE32.indexOf(c);
    if (i < 0) throw new Error('base32 inválido');
    valor = (valor << 5) | i;
    bits += 5;
    if (bits >= 8) {
      bytes.push((valor >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export const PASSO_TOTP = 30;

/** Novo segredo de 2FA (160 bits, em base32). */
export function segredoTotp(): string {
  return base32(randomBytes(20));
}

export function passoTotp(agora: Date): number {
  return Math.floor(agora.getTime() / 1000 / PASSO_TOTP);
}

export function codigoTotp(segredo: string, passo: number): string {
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(passo));
  const hmac = createHmac('sha1', deBase32(segredo)).update(contador).digest();
  const deslocamento = hmac[hmac.length - 1] & 15;
  const numero = (hmac.readUInt32BE(deslocamento) & 0x7fffffff) % 1_000_000;
  return String(numero).padStart(6, '0');
}

/**
 * Confere o código no passo atual e no vizinho de cada lado (relógios com até
 * 30 s de diferença). Devolve o passo aceito, ou null. Quem chama recusa um
 * passo igual ou anterior ao último aceito (o mesmo código não vale duas vezes).
 */
export function conferirTotp(
  segredo: string,
  codigo: string,
  agora: Date,
): number | null {
  if (!/^\d{6}$/.test(codigo)) return null;
  const atual = passoTotp(agora);
  for (const passo of [atual - 1, atual, atual + 1]) {
    const esperado = Buffer.from(codigoTotp(segredo, passo));
    if (timingSafeEqual(esperado, Buffer.from(codigo))) return passo;
  }
  return null;
}

/** Endereço otpauth:// que os apps de autenticação leem por QR code. */
export function uriTotp(segredo: string, email: string): string {
  const rotulo = encodeURIComponent(`Vida Pública:${email}`);
  return `otpauth://totp/${rotulo}?secret=${segredo}&issuer=${encodeURIComponent('Vida Pública')}&algorithm=SHA1&digits=6&period=${PASSO_TOTP}`;
}

// ---------------------------------------------------------------------------
// Cifra do segredo do 2FA no banco: AES-256-GCM com a chave do ambiente.
// ADMIN_TOTP_CHAVE é um segredo aleatório (32+ caracteres, como os outros do
// cofre); a chave de 32 bytes é o SHA-256 dele. Formato v1.<iv>.<tag>.<cifrado>.

export function lerChave(segredo: string): Buffer {
  if (segredo.length < 32) {
    throw new Error('ADMIN_TOTP_CHAVE precisa ter 32 caracteres ou mais');
  }
  return createHash('sha256').update(segredo).digest();
}

export function cifrar(texto: string, chave: Buffer): string {
  const iv = randomBytes(12);
  const cifra = createCipheriv('aes-256-gcm', chave, iv);
  const cifrado = Buffer.concat([cifra.update(texto, 'utf8'), cifra.final()]);
  return [
    'v1',
    iv.toString('base64url'),
    cifra.getAuthTag().toString('base64url'),
    cifrado.toString('base64url'),
  ].join('.');
}

export function decifrar(guardado: string, chave: Buffer): string {
  const [versao, iv, tag, cifrado] = guardado.split('.');
  if (versao !== 'v1' || !iv || !tag || !cifrado) {
    throw new Error('segredo cifrado em formato desconhecido');
  }
  const decifra = createDecipheriv(
    'aes-256-gcm',
    chave,
    Buffer.from(iv, 'base64url'),
  );
  decifra.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decifra.update(Buffer.from(cifrado, 'base64url')),
    decifra.final(),
  ]).toString('utf8');
}

// ---------------------------------------------------------------------------

/** Token de sessão do painel (256 bits) e o hash que vai ao banco. */
export function tokenSessao(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

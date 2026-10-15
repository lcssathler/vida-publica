import { Pool } from 'pg';
import { Db } from '../db/db';
import {
  cifrar,
  hashSenha,
  lerChave,
  segredoTotp,
  senhaAleatoria,
  uriTotp,
} from './cripto';
import { PostgresContasAdminRepositorio } from './postgres-contas.repositorio';

const USO = `Uso: node dist/admin/admin-cli.js <comando> <email> [nome]
  criar <email> <nome>  cria a conta do painel e mostra, uma única vez, a senha
                        inicial e o segredo do 2FA (QR code: o endereço otpauth)
  redefinir <email>     senha e 2FA novos (encerra as sessões abertas)
  desativar <email>     a conta não entra mais (encerra as sessões abertas)
Precisa de DATABASE_URL (usuário vp_admin) e ADMIN_TOTP_CHAVE.`;

/**
 * Contas do painel. Não há cadastro pela web: quem administra o servidor cria
 * cada conta por este comando, e a senha e o segredo do 2FA aparecem só aqui.
 */
async function main(): Promise<number> {
  const [comando, email, ...resto] = process.argv.slice(2);
  const url = process.env.DATABASE_URL;
  const chave = process.env.ADMIN_TOTP_CHAVE;
  if (!comando || !email || !url || !chave) {
    process.stderr.write(`${USO}\n`);
    return 2;
  }
  if (!/^[^@\s]+@[^@\s]+$/.test(email)) {
    process.stderr.write('E-mail inválido.\n');
    return 2;
  }
  const db = new Db(new Pool({ connectionString: url, max: 1 }));
  const contas = new PostgresContasAdminRepositorio(db);
  const chaveTotp = lerChave(chave);
  try {
    if (comando === 'desativar') {
      const ok = await contas.desativar(email);
      process.stdout.write(
        ok ? 'Conta desativada.\n' : 'Conta não encontrada.\n',
      );
      return ok ? 0 : 1;
    }
    const senha = senhaAleatoria();
    const segredo = segredoTotp();
    const dados = {
      senhaHash: await hashSenha(senha),
      totpSegredo: cifrar(segredo, chaveTotp),
    };
    if (comando === 'criar') {
      const nome = resto.join(' ').trim();
      if (!nome) {
        process.stderr.write(`${USO}\n`);
        return 2;
      }
      await contas.criar({ email, nome, ...dados });
    } else if (comando === 'redefinir') {
      if (!(await contas.redefinir(email, dados))) {
        process.stdout.write('Conta não encontrada.\n');
        return 1;
      }
    } else {
      process.stderr.write(`${USO}\n`);
      return 2;
    }
    process.stdout.write(
      [
        `Conta: ${email.toLowerCase()}`,
        `Senha inicial: ${senha}`,
        `Segredo do 2FA: ${segredo}`,
        `Endereço para o app de autenticação: ${uriTotp(segredo, email.toLowerCase())}`,
        'Guarde num cofre de senhas: nada disto aparece de novo.',
        '',
      ].join('\n'),
    );
    return 0;
  } finally {
    await db.fechar();
  }
}

main().then(
  (codigo) => {
    process.exitCode = codigo;
  },
  (erro: unknown) => {
    process.stderr.write(`${String(erro)}\n`);
    process.exitCode = 1;
  },
);

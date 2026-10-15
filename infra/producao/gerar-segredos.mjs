#!/usr/bin/env node
// Gera os segredos de produção (senhas aleatórias) e escreve na saída padrão
// um JSON { app: {...}, banco: {...} } para gravar no AWS Secrets Manager sem
// passar por arquivo (veja infra/producao/README.md). As senhas dos usuários do
// banco vão nos dois: o banco as cria, a aplicação as usa.
//
//   node infra/producao/gerar-segredos.mjs --email-acme equipe@exemplo.org
//
// Opcionais, acrescentados depois no segredo da aplicação: VP_FCM_CREDENCIAIS_JSON,
// VP_SENTRY_DSN, VP_HEALTHCHECKS_PING_KEY, VP_APPLE_CLIENT_IDS, VP_GOOGLE_CLIENT_IDS
// (e VP_SENTRY_DSN/VP_HEALTHCHECKS_PING_KEY também no do banco).
import { randomBytes } from 'node:crypto';

const segredo = () => randomBytes(32).toString('base64url');
const args = process.argv.slice(2);
const email = args[args.indexOf('--email-acme') + 1];
if (!args.includes('--email-acme') || !email || !email.includes('@')) {
  process.stderr.write('Uso: node gerar-segredos.mjs --email-acme <email para o Let\'s Encrypt>\n');
  process.exit(2);
}

const usuarios = {
  VP_INGEST_DB_PASSWORD: segredo(),
  VP_API_DB_PASSWORD: segredo(),
  VP_ADMIN_DB_PASSWORD: segredo(),
  VP_NOTIFY_DB_PASSWORD: segredo(),
};

const saida = {
  app: {
    ...usuarios,
    VP_API_JWT_SECRET: segredo(),
    VP_ADMIN_TOTP_CHAVE: segredo(),
    // A mesma chave do HMAC do CPF em todo lugar que grava hash: nunca trocar
    // depois da primeira coleta (os hashes deixariam de casar).
    VP_CPF_HASH_KEY: segredo(),
    ACME_EMAIL: email,
  },
  banco: {
    ...usuarios,
    POSTGRES_PASSWORD: segredo(),
    // Sem esta frase o backup não abre: guarde uma cópia fora da AWS também.
    VP_BACKUP_CIFRA: segredo(),
  },
};

process.stdout.write(`${JSON.stringify(saida)}\n`);

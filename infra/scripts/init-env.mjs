#!/usr/bin/env node
// Gera infra/.env com senhas aleatórias para o ambiente local.
// Não sobrescreve um .env existente. Nenhuma senha é versionada.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const infraDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(infraDir, '.env');
const template = join(infraDir, '.env.example');

if (existsSync(target)) {
  console.log('infra/.env já existe; nada foi alterado.');
  process.exit(0);
}

const secret = () => randomBytes(24).toString('base64url');

const content = readFileSync(template, 'utf8')
  .split('\n')
  .map((line) => (/^[A-Z0-9_]+=\s*$/.test(line) ? `${line.trim()}${secret()}` : line))
  .join('\n');

writeFileSync(target, content, { mode: 0o600 });
console.log('infra/.env criado com senhas aleatórias.');

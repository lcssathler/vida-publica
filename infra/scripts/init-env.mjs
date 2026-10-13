#!/usr/bin/env node
// Gera ou completa infra/.env com senhas aleatórias para o ambiente local.
// Nunca altera valores existentes; só acrescenta variáveis que faltam.
// Nenhuma senha é versionada.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const infraDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(infraDir, '.env');
const template = join(infraDir, '.env.example');

const secret = () => randomBytes(24).toString('base64url');
const keyOf = (line) => /^([A-Z0-9_]+)=/.exec(line)?.[1];

// Linha do modelo com valor vazio recebe um segredo aleatório.
const fill = (line) => (/^[A-Z0-9_]+=\s*$/.test(line) ? `${line.trim()}${secret()}` : line);

const templateLines = readFileSync(template, 'utf8').split('\n');

if (!existsSync(target)) {
  writeFileSync(target, templateLines.map(fill).join('\n'), { mode: 0o600 });
  console.log('infra/.env criado com senhas aleatórias.');
  process.exit(0);
}

const current = readFileSync(target, 'utf8');
const existing = new Set(current.split('\n').map(keyOf).filter(Boolean));
const missing = templateLines.filter((line) => keyOf(line) && !existing.has(keyOf(line)));

if (missing.length === 0) {
  console.log('infra/.env já está completo; nada foi alterado.');
  process.exit(0);
}

const separator = current.endsWith('\n') ? '' : '\n';
writeFileSync(target, `${current}${separator}${missing.map(fill).join('\n')}\n`);
console.log(`infra/.env completado com: ${missing.map(keyOf).join(', ')}.`);

# API

API do Vida Pública em NestJS 12. Monólito modular: cada pasta em `src/` é um módulo com fronteira própria.

## Rodar localmente

Na raiz do repositório:

```bash
pnpm install
```

```bash
pnpm --filter @vida-publica/api run start:dev
```

A API sobe em `http://localhost:3000`. Em desenvolvimento, a documentação OpenAPI fica em `/docs` (desligada em produção).

## Verificações

```bash
pnpm --filter @vida-publica/api run lint
```

```bash
pnpm --filter @vida-publica/api run typecheck
```

```bash
pnpm --filter @vida-publica/api run test
```

Os testes usam Vitest. Os decorators do NestJS são compilados pelo próprio TypeScript (sem binários nativos), configurado em `vitest.config.mts`.

## Configuração

Variáveis de ambiente validadas na subida (`src/config/env.ts`). A API não sobe se alguma estiver inválida.

| Variável | Padrão | Descrição |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development`, `test` ou `production` |
| `PORT` | `3000` | Porta HTTP |
| `LOG_LEVEL` | `info` | Nível dos logs estruturados (pino) |

## Imagem Docker

Na raiz do repositório:

```bash
docker build -f apps/api/Dockerfile -t vida-publica-api .
```

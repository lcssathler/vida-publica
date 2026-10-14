# API

API do Vida Pública em NestJS 12. Monólito modular: cada pasta em `src/` é um módulo com fronteira própria, com portas e adaptadores: o serviço depende de uma classe abstrata (a porta, como `UsuariosRepositorio`) e o módulo liga o adaptador (Postgres em produção, memória nos testes).

## Módulos

| Módulo | Rotas | O que faz |
| --- | --- | --- |
| `auth` | `POST /auth/anonimo`, `/auth/renovar`, `/auth/sair`, `/auth/entrar/{apple,google}` | Conta anônima por aparelho, token de acesso JWT curto (15 min), refresh token rotativo com detecção de reuso, login Apple e Google |
| `seguir` | `GET /seguindo`, `PUT`/`DELETE /seguindo/{tipo}/{id}`, `GET /assuntos` | Seguir pessoa, partido, proposta e assunto (os mesmos alvos de `feed.evento_alvo`), até 500 itens |
| `feed` | `GET /feed`, `GET /eventos/{id}` | Feed de eventos publicados com cursor e filtros por tipo e assunto; detalhe com fonte e regra |
| `perfis` | `GET /pessoas/{id}`, `/pessoas/{id}/eventos`, `/pessoas/{id}/doadores`, `GET /partidos/{id}`, `/partidos/{id}/eventos` | Perfis de pessoa e partido por categoria (votos, presença, gastos, propostas, campanha, eleições), com doadores de campanha |
| `propostas` | `GET /propostas/{id}` | Proposta com autores, temas e linha do tempo (tramitações, votações com placar e eventos do feed) |
| `health` | `GET /health` | Saúde da API |

Toda rota exige `Authorization: Bearer <token de acesso>`, salvo as marcadas com `@Publico()` (saúde, criação de conta anônima e renovação). A guarda confere também se a sessão continua ativa.

### Autenticação

1. Na primeira abertura, o app chama `POST /auth/anonimo` e guarda o refresh token no armazenamento seguro do aparelho.
2. O token de acesso vale 15 minutos. `POST /auth/renovar` troca o refresh por um par novo; o antigo deixa de valer. Apresentar de novo um refresh já usado encerra a sessão inteira (sinal de vazamento).
3. `POST /auth/entrar/apple` ou `/google` com o token de identidade do provedor: se a identidade é nova, fica vinculada à conta do aparelho; se já pertence a outra conta, a sessão passa para ela e a conta anônima é fundida nela.
4. No banco ficam só o hash SHA-256 do refresh token e o identificador opaco (`sub`) do provedor: nenhum e-mail ou nome.

## Rodar localmente

Na raiz do repositório:

```bash
pnpm install
```

```bash
pnpm --filter @vida-publica/api run start:dev
```

A API sobe em `http://localhost:3000`. Em desenvolvimento, a documentação OpenAPI fica em `/docs` (desligada em produção).

### Feed

O feed lê `feed.evento` (gerado pelo worker) e cumpre o contrato da Fase 4:

- só eventos com `status = 'publicado'` e com fonte (`fonte_url`); segurados e arquivados nunca saem da API;
- `visibilidade = 'seguidores'` (em campanha, os eventos de candidatos) só para quem segue algum alvo do evento (`feed.evento_alvo`);
- `escopo=seguindo` (padrão) traz os eventos de alvos seguidos; `escopo=todos`, o feed geral;
- filtros: `tipo` (um dos 15 tipos, repetido ou separado por vírgula) e `assunto` (tema oficial, repetido: temas têm vírgula no nome);
- ordem por `(ocorrido_em, id)` decrescente; `proximoCursor` é opaco e preserva os microssegundos, então a página seguinte começa exatamente onde a anterior parou;
- a lista mostra fatos até depois de amanhã (pauta marcada entra); datas mais à frente, como erro de digitação na fonte ou mês de despesa ainda aberto, não ficam presas no topo, mas o detalhe abre.

Cada evento traz `fonte` (`url`, `dadoEm`, `coletadoEm`), a versão da regra (e a descrição dela no detalhe), `payload` do tipo e os alvos com nome e se o usuário os segue.

### Perfis

- Pessoa: nome, foto oficial com crédito (Câmara ou Senado), mandatos, filiações, partido atual, candidaturas, cota parlamentar dos dois anos mais recentes e a contagem de eventos por categoria. As categorias agrupam os 15 tipos do feed e seguem as mesmas regras de visibilidade (a de campanha aparece para quem segue).
- `GET /pessoas/{id}/eventos?categoria=` e `GET /partidos/{id}/eventos?categoria=`: a linha do tempo do perfil, com cursor.
- `GET /pessoas/{id}/doadores?ano=`: receitas da candidatura pela prestação de contas vigente, por origem; doadores com CNPJ (partidos, outros candidatos, plataformas) pelo nome; **doador pessoa física nomeado só acima de R$ 10 mil** somados na candidatura, o resto somado em "outras"; CPF nunca. Os nomes vêm da visão `canon.tse_doador_pessoa_fisica`, que agrupa pelo hash do CPF sem entregá-lo e só preenche o nome acima do limite.
- Partido: número, nome, sucessor e antecessores, parlamentares em exercício filiados, repasses a candidatos por ano, fonte e esfera, e a contagem de eventos por categoria.

### Propostas

`GET /propostas/{id}` traz os dados da proposta (ementa, situação, regime, órgão, inteiro teor, autores ligados à pessoa quando são parlamentares da própria casa, temas, proposta principal, fonte) e a linha do tempo completa, do mais recente ao mais antigo:

- `tramitacao`: todas as etapas do canon, com hora de Brasília convertida para instante; `eventoId` liga a etapa ao evento publicado que o motor gerou para ela (relator, parecer, envio, mudança de regime...);
- `votacao`: votações da Câmara e do Senado sobre a proposta, com resultado, placar (sim, não, abstenção, outros) quando nominal e a fonte;
- `evento`: eventos publicados e visíveis da proposta que não são etapa nem voto individual (pauta e proposta parada).

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

Os testes usam Vitest. Os decorators do NestJS são compilados pelo próprio TypeScript (sem binários nativos), configurado em `vitest.config.mts`. Os testes unitários e e2e trocam os adaptadores de banco por versões em memória (`test/fakes`).

Os adaptadores Postgres têm testes de integração em `test/integracao`, contra um banco descartável já migrado, com o usuário `vp_api` (no CI, o banco do job `infra`):

```bash
VP_API_TEST_DATABASE_URL=postgres://vp_api:<senha>@127.0.0.1:5433/vida_publica_test VP_API_TEST_OWNER_URL=postgres://vp_owner:<senha>@127.0.0.1:5433/vida_publica_test pnpm --filter @vida-publica/api run test:int
```

`VP_API_TEST_OWNER_URL` (dono do banco) só grava os dados fictícios de `canon` e `feed` que os testes usam e apaga ao final; a API em si conecta sempre como `vp_api`.

## Configuração

Variáveis de ambiente validadas na subida (`src/config/env.ts`). A API não sobe se alguma estiver inválida.

| Variável | Padrão | Descrição |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development`, `test` ou `production` |
| `PORT` | `3000` | Porta HTTP |
| `LOG_LEVEL` | `info` | Nível dos logs estruturados (pino) |
| `DATABASE_URL` | obrigatória | Postgres com o usuário `vp_api` (lê `canon` e `feed`, escreve em `app`) |
| `DB_POOL_MAX` | `10` | Conexões no pool |
| `JWT_SECRET` | obrigatória | Segredo HMAC dos tokens de acesso (32+ caracteres; no compose, `VP_API_JWT_SECRET`) |
| `JWT_ACESSO_MINUTOS` | `15` | Validade do token de acesso |
| `REFRESH_DIAS` | `60` | Validade do refresh token |
| `APPLE_CLIENT_IDS` | vazio | Bundle ids aceitos como audiência do token da Apple; vazio desliga o login Apple |
| `GOOGLE_CLIENT_IDS` | vazio | Client ids OAuth aceitos como audiência do token do Google; vazio desliga o login Google |

## Imagem Docker

Na raiz do repositório:

```bash
docker build -f apps/api/Dockerfile -t vida-publica-api .
```

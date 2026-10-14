# API

API do Vida Pública em NestJS 12. Monólito modular: cada pasta em `src/` é um módulo com fronteira própria, com portas e adaptadores: o serviço depende de uma classe abstrata (a porta, como `UsuariosRepositorio`) e o módulo liga o adaptador (Postgres em produção, memória nos testes).

## Módulos

| Módulo | Rotas | O que faz |
| --- | --- | --- |
| `auth` | `POST /auth/anonimo`, `/auth/renovar`, `/auth/sair`, `/auth/entrar/{apple,google}` | Conta anônima por aparelho, token de acesso JWT curto (15 min), refresh token rotativo com detecção de reuso, login Apple e Google |
| `seguir` | `GET /seguindo`, `PUT`/`DELETE /seguindo/{tipo}/{id}`, `GET /assuntos` | Seguir pessoa, partido, proposta e assunto (os mesmos alvos de `feed.evento_alvo`), até 500 itens |
| `feed` | `GET /feed`, `GET /eventos/{id}` | Feed de eventos publicados com cursor e filtros por tipo e assunto; detalhe com fonte e regra |
| `perfis` | `GET /pessoas/{id}`, `/pessoas/{id}/eventos`, `/pessoas/{id}/doadores`, `GET /partidos/{id}`, `/partidos/{id}/eventos`, `GET /parlamentares?uf=` | Perfis de pessoa e partido por categoria (votos, presença, gastos, propostas, campanha, eleições), com doadores de campanha; parlamentares em exercício por estado |
| `propostas` | `GET /propostas/{id}` | Proposta com autores, temas e linha do tempo (tramitações, votações com placar e eventos do feed) |
| `busca` | `GET /busca?q=&tipo=&limite=` | Busca em português, sem acento: pessoas, partidos, propostas e assuntos |
| `conta` | `GET /conta`, `GET`/`PATCH /conta/preferencias`, `DELETE /conta` | Conta, preferências (estado, notificações, silêncio, teto diário, fuso) e exclusão definitiva |
| `limite` | (guarda global) | Limite de requisições por usuário e por IP |
| `notificacoes` | `GET`/`PUT`/`DELETE /dispositivo` | Registro do aparelho que recebe avisos (token do FCM e plataforma, por sessão); a fila e o envio rodam no notificador, outro processo |
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
- `GET /parlamentares?uf=SP`: senadores e deputados federais em exercício no estado (situação da própria Câmara e do Senado), com cargo, partido, foto oficial com crédito e se o usuário já segue. É a lista de "quem seguir" do onboarding do app.
- Partido: número, nome, sucessor e antecessores, parlamentares em exercício filiados, repasses a candidatos por ano, fonte e esfera, e a contagem de eventos por categoria.

### Propostas

`GET /propostas/{id}` traz os dados da proposta (ementa, situação, regime, órgão, inteiro teor, autores ligados à pessoa quando são parlamentares da própria casa, temas, proposta principal, fonte) e a linha do tempo completa, do mais recente ao mais antigo:

- `tramitacao`: todas as etapas do canon, com hora de Brasília convertida para instante; `eventoId` liga a etapa ao evento publicado que o motor gerou para ela (relator, parecer, envio, mudança de regime...);
- `votacao`: votações da Câmara e do Senado sobre a proposta, com resultado, placar (sim, não, abstenção, outros) quando nominal e a fonte;
- `evento`: eventos publicados e visíveis da proposta que não são etapa nem voto individual (pauta e proposta parada).

### Busca

`GET /busca?q=` procura em quatro grupos (até 5 de cada; com `tipo=pessoa|partido|proposicao|assunto`, até 50 de um grupo só), sem acento e sem diferenciar maiúsculas (`canon.normaliza`, com `unaccent`):

- pessoas por trigramas no nome de exibição e no nome civil: o nome inteiro parecido pesa mais que palavras soltas, e quem está em exercício e quem é candidato na eleição em curso sobem um pouco;
- partidos pela sigla (exata ou começo) ou pelo nome, os em atividade primeiro, com o sucessor dos extintos;
- propostas pela identificação ("PL 2338/2023", "pl2338", "PEC 45/19") ou por busca textual com radicais do português na identificação, apelido, ementa e palavras-chave, com a última palavra como prefixo (acha enquanto digita);
- assuntos (temas oficiais) por trecho ou semelhança.

Cada resultado diz se o usuário já segue. Os índices estão na migração `busca`; as consultas repetem as mesmas expressões para usá-los.

### Conta e limite de requisições

- `GET /conta`: logins vinculados (vazio = anônima), quantos itens segue, sessões ativas e preferências.
- `PATCH /conta/preferencias`: altera só os campos enviados (`uf`, `notificacoes`, `resumoSemanal`, `maxPorDia`, `silencioInicio`, `silencioFim`, `fuso`); campo desconhecido é recusado. Sem alteração, valem os padrões (notificações ligadas, até 5 por dia, silêncio das 22:00 às 07:00, horário de Brasília). O CEP do onboarding é convertido em estado no aparelho e nunca chega à API.
- `DELETE /conta`: exclusão definitiva, em cascata no banco (sessões, refresh tokens, logins, o que segue, preferências); o token de acesso cai na hora, porque a guarda confere a sessão.
- Limite de requisições (guarda global, depois da autenticação): por usuário nas rotas autenticadas (120/min; busca 30/min), por IP nas públicas (30/min) e contas anônimas novas por IP (10 a cada 10 min). Respostas trazem `RateLimit-Limit`, `RateLimit-Remaining` e `RateLimit-Reset`; acima do limite, 429 com `Retry-After`. `/health` fica de fora. O contador é em memória (uma instância); com mais de uma, troca-se o adaptador `ContadorRequisicoes` por um compartilhado. Atrás de balanceador, `TRUST_PROXY` diz quantos proxies confiar para ler o IP real.

### Notificações

O registro do aparelho é da API; a fila e o envio são do **notificador**, um processo separado com o mesmo código (`src/notificacoes/notificador.ts`) e outro usuário do banco (`vp_notify`): o envio fica separado da gravação dos eventos e de quem atende o app, como pede a referência técnica (fila em tabela do Postgres atrás de uma porta, trocável por RabbitMQ ou SQS).

- `PUT /dispositivo` (`{ token, plataforma: "android" | "ios" }`): grava só o token de envio do FCM e a plataforma, um por sessão (refazer troca o anterior; o mesmo token em outra sessão sai de lá). `DELETE /dispositivo` apaga. Sair (`/auth/sair`), refresh reapresentado e exclusão da conta apagam o token junto com a sessão.
- **Enfileirar:** a cada rodada, o notificador lê os eventos publicados desde a anterior (`feed.evento.publicado_em`, relendo 2 h antes do cursor para pegar transações demoradas do motor; o cursor fica em `app.notificacao_cursor`) e grava em `app.notificacao` um aviso por usuário e evento (chave única: rodar de novo não reenvia) para quem já seguia um alvo do evento quando ele foi publicado (`feed.evento_alvo` × `app.seguindo`) e não desligou os avisos. Só eventos publicados e com fonte; segurados e arquivados nunca. A visibilidade "seguidores" fica coberta porque só entra quem segue um alvo. A primeira rodada só marca o instante: a carga inicial e o que já estava publicado não geram aviso, e quem passa a seguir depois não recebe o passado. Fato com mais de 7 dias na publicação (dado que chegou atrasado) ou marcado para depois de amanhã também não.
- **Que tipos viram push:** votos (`voto_nominal`, `voto_contra_orientacao`), `pauta`, `tramitacao`, `mudanca_regime`, `ausencia`, `troca_partido`, `situacao_candidatura` e `resultado`. Dinheiro e despesas (`despesa_mensal`, `repasse`, `doacao`, `fundo_recebido`) vão para o resumo semanal; `presenca` e `proposta_parada` ficam só no feed.
- **Enviar:** por usuário, travado para os outros notificadores (`pg_try_advisory_xact_lock`), na ordem da fila:
  - avisos desligados, evento despublicado depois ou alvo deixado de seguir: descartado;
  - horário de silêncio no fuso da conta (início igual ao fim desliga): o aviso espera o fim do silêncio (`enviar_apos`) e sai na primeira rodada depois dele;
  - teto diário (`maxPorDia`, contado desde a meia-noite no fuso da conta): o que passa do teto não é enviado e fica com status `resumo`, para o resumo semanal;
  - só aparelhos de sessões ativas; sem aparelho, descartado sem gastar o teto; token que o FCM diz inválido é apagado; falha passageira tenta de novo depois de 1, 2, 4 e 8 minutos e desiste na 5ª.
- **Texto:** o título do evento (o mesmo do feed, factual e sem adjetivos, gerado pelo motor), o resumo cortado na palavra e "Toque para ver a fonte."; os dados levam `url: vidapublica://evento/{id}`, que abre o registro com a fonte no app. Doador pessoa física nunca é nomeado (doações não viram push e o motor não nomeia) e um texto com algo parecido com CPF não sai. O texto enviado fica gravado no aviso.
- **Adaptadores** (porta `Enviador`):
  - **FCM HTTP v1** (`enviador-fcm.ts`), para Android e iOS: uma mensagem por token, com `notification` (título e corpo), `data` (`url`, `eventoId`), canal `avisos` no Android e `apns` com prioridade 5. O token de acesso OAuth 2.0 vem de um JWT assinado com a chave da conta de serviço (`jose`, sem binário nativo), trocado no Google e reaproveitado até 5 minutos antes de vencer. Respostas: `UNREGISTERED` (404), `SENDER_ID_MISMATCH` e `INVALID_ARGUMENT` citando o token → token inválido, apagado de `app.dispositivo`; 429, 5xx, falha de rede e 401 (renova o token de acesso) → nova tentativa; o resto → falha registrada no log, sem a chave nem o token;
  - **falso** (`enviador-falso.ts`): registra cada envio no log, com só o começo do token. É o que roda sem credenciais.
- **Credenciais do FCM** nunca no repositório: a conta de serviço do Firebase vem de `FCM_CREDENCIAIS_JSON` (o JSON numa linha; no compose, `VP_FCM_CREDENCIAIS_JSON` do `infra/.env`) ou de `FCM_CREDENCIAIS_ARQUIVO` (caminho de um arquivo fora do git). Sem nenhuma, o adaptador real fica desligado e o notificador usa o falso. Credencial malformada derruba a subida com o nome do campo, nunca com o conteúdo. `FCM_VALIDAR_APENAS=true` manda tudo com `validate_only` (o FCM confere credenciais, mensagem e token sem entregar).

- **Resumo semanal** (`resumo.service.ts`, tabela `app.resumo_semanal`, um por usuário e semana): na segunda-feira, a partir das 09:00 no fuso de cada conta (`NOTIF_RESUMO_HORA`), um aviso com o dinheiro e as despesas de quem a pessoa segue (`despesa_mensal`, `repasse`, `doacao`, `fundo_recebido`) publicados na semana anterior (segunda a domingo, no fuso), só contagens e somas por tipo (nenhum nome; doador pessoa física nem aparece no feed), mais quantos avisos passaram do teto diário naquela semana. Valem as mesmas regras da fila: só publicados e com fonte, depois do início da fila (a carga inicial não entra) e de a pessoa passar a seguir. Resumo ou avisos desligados: não sai (`descartado`); semana sem nada: `vazio`, sem aviso; horário de silêncio: espera o fim; não conta no teto diário. O texto é factual ("Resumo da semana de 12/10 a 18/10" / "Dinheiro de quem você segue: 2 repasses de partido (R$ 1,2 mi); 1 dia de doações (R$ 5 mil). Toque para ver no feed.") e o link `vidapublica://feed?categorias=gastos,campanha` abre o feed de quem a pessoa segue com esses filtros.

Rodar com o compose (`docker compose -f infra/docker-compose.yml run --rm notificador node dist/notificacoes/notificador.js <comando>`):

| Comando | O que faz |
| --- | --- |
| `ciclo` | Fila (enfileira os recém-publicados e envia o que estiver na vez) e resumo semanal; imprime as contagens |
| `enfileirar` / `enviar` | Só uma das etapas da fila |
| `resumo` | Só o resumo semanal: grava os devidos e envia os que estiverem na vez |
| `continuo` | Um ciclo a cada `NOTIF_INTERVALO_SEGUNDOS`; erro num ciclo vai para o log e o próximo tenta de novo (é o comando do serviço `notificador` no compose) |
| `testar-fcm <token> [android\|ios] [--entregar]` | Aviso de teste para um token pelo FCM, sem banco: por padrão só valida (`validate_only`); com `--entregar`, chega ao aparelho |

`--agora=<ISO>` (recusado no `continuo`) faz o relógio de uma rodada avulsa começar no instante dado, para conferir, por exemplo, o resumo de segunda-feira sem esperar por ela.

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
VP_API_TEST_DATABASE_URL=postgres://vp_api:<senha>@127.0.0.1:5433/vida_publica_test VP_NOTIFY_TEST_DATABASE_URL=postgres://vp_notify:<senha>@127.0.0.1:5433/vida_publica_test VP_API_TEST_OWNER_URL=postgres://vp_owner:<senha>@127.0.0.1:5433/vida_publica_test pnpm --filter @vida-publica/api run test:int
```

`VP_API_TEST_OWNER_URL` (dono do banco) só grava os dados fictícios de `canon` e `feed` que os testes usam e apaga ao final; a API em si conecta sempre como `vp_api`, e o notificador como `vp_notify`.

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
| `LIMITE_POR_MINUTO` | `120` | Requisições por usuário por minuto (a busca tem um quarto disso) |
| `LIMITE_IP_POR_MINUTO` | `30` | Requisições por IP por minuto nas rotas públicas |
| `LIMITE_CONTAS_POR_IP` | `10` | Contas anônimas novas por IP a cada 10 minutos |
| `TRUST_PROXY` | `0` | Proxies confiáveis à frente da API (para ler o IP real em `X-Forwarded-For`) |
| `CORS_ORIGENS` | vazio | Origens aceitas por CORS, separadas por vírgula (só a versão web do app no desenvolvimento, ex.: `http://localhost:8081`; no compose, `VP_API_CORS_ORIGENS`). Vazio desliga: o app nativo não usa CORS. `Retry-After` e `RateLimit-*` ficam expostos |

O notificador valida as próprias variáveis (`src/notificacoes/env-notificador.ts`): `NODE_ENV`, `LOG_LEVEL`, `DATABASE_URL` (usuário `vp_notify`), `DB_POOL_MAX` (padrão 4) e:

| Variável | Padrão | Descrição |
| --- | --- | --- |
| `NOTIF_INTERVALO_SEGUNDOS` | `60` | Intervalo entre ciclos no modo contínuo |
| `NOTIF_MARGEM_MINUTOS` | `120` | Releitura antes do cursor (publicações de transações demoradas do motor) |
| `NOTIF_FRESCOR_DIAS` | `7` | Fato mais antigo que isso quando foi publicado não vira aviso |
| `NOTIF_LOTE` | `200` | Usuários por consulta da fila |
| `NOTIF_MAX_TENTATIVAS` | `5` | Tentativas de envio antes de desistir |
| `NOTIF_RESUMO_HORA` | `09:00` | Hora local de segunda-feira em que sai o resumo da semana anterior |
| `FCM_CREDENCIAIS_JSON` | vazio | Conta de serviço do Firebase (JSON). Vazio, com `FCM_CREDENCIAIS_ARQUIVO` também vazio: adaptador falso |
| `FCM_CREDENCIAIS_ARQUIVO` | vazio | Caminho da conta de serviço, fora do repositório |
| `FCM_VALIDAR_APENAS` | `false` | `true`: o FCM só valida (`validate_only`), sem entregar |

## Imagem Docker

Na raiz do repositório:

```bash
docker build -f apps/api/Dockerfile -t vida-publica-api .
```

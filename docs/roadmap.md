# Roadmap

O MVP é entregue em 10 fases. A Fase 0 constrói a base que serve tanto ao MVP quanto ao produto final: repositório seguro, CI obrigatória, infraestrutura local reproduzível, esquema do banco e esqueletos dos três serviços. As fases seguintes entregam funcionalidade em branches curtas, cada uma integrada à `main` por pull request com testes passando.

Estimativa total do MVP: 10 a 13 semanas com 1 ou 2 pessoas desenvolvendo.

## Como ler este roadmap

- Cada linha de tabela é **uma branch** e **um pull request**.
- Uma fase só termina quando o critério de saída é cumprido.
- Itens marcados com `[x]` já estão na `main`.

## Fase 0 — Fundação

Objetivo: qualquer pessoa clona o repositório, roda um comando e tem o ambiente completo; nada entra na `main` sem CI verde.

| | Branch | Entrega |
| --- | --- | --- |
| [x] | `chore/bootstrap-repo` | Licença, regras de contribuição, política de segurança, `.gitignore` que bloqueia segredos e dados brutos, roadmap e arquitetura |
| [x] | `ci/pipeline-base` | GitHub Actions: varredura de segredos (gitleaks), lint e testes por pacote; checks obrigatórios na `main` |
| [x] | `infra/local-stack` | Docker Compose com PostgreSQL 16 e RustFS (S3); senhas locais geradas por script, nenhuma versionada |
| [x] | `db/schema-base` | Migrações com dbmate; esquemas `raw`, `canon`, `feed`, `app`; papéis separados para worker, API e admin; tabelas `raw_object` e `job_run` |
| [x] | `api/skeleton` | NestJS com configuração validada, `/health`, logs estruturados, OpenAPI, testes e Dockerfile |
| [x] | `ingest/skeleton` | Worker Python com portas de armazenamento (S3) e banco, execução idempotente de jobs, testes e Dockerfile |
| [x] | `mobile/skeleton` | Expo + Expo Router, tokens do design "Protocolo", fontes, testes |

**Critério de saída:** `docker compose up` sobe banco, armazenamento, API e worker; CI verde é obrigatória para merge.

## Fase 1 — Dados canônicos

Objetivo: saber quem é quem, em todas as fontes, sem casar pessoas só pelo nome.

| | Branch | Entrega |
| --- | --- | --- |
| [x] | `ingest/camara-deputados` | Deputados em exercício e detalhe (inclui identificadores) |
| [x] | `ingest/senado-senadores` | Senadores em exercício |
| [x] | `ingest/tse-candidaturas` | Candidaturas 2026 e histórico de eleições anteriores |
| [x] | `ingest/partidos` | Partidos, números, siglas, fusões e renomeações |
| [x] | `canon/resolucao-pessoas` | Casamento entre fontes por CPF (só hash), depois nome civil + data de nascimento; fila de revisão para casos incertos |
| [x] | `canon/mandatos-filiacoes` | Mandatos e histórico de partido por pessoa |

**Critério de saída:** 95% ou mais dos parlamentares casados sem erro, conferidos por amostragem.

**Resultado (13/10/2026):** 648/648 deputados da legislatura 57 e 81/81 senadores em exercício ligados às suas candidaturas no TSE. Conferência completa (não amostral): datas de nascimento iguais em todos os deputados e nenhum casamento errado. 7 suplentes do Senado que nunca assumiram ficaram na fila de revisão.

## Fase 2 — Atividade legislativa

| | Branch | Entrega |
| --- | --- | --- |
| [x] | `ingest/camara-votacoes` | Votações nominais, votos e orientações de bancada |
| [x] | `ingest/senado-votacoes` | Votações com votos e motivo de ausência |
| [x] | `ingest/agenda-pauta` | Agenda e pauta da Câmara e do Senado |
| [x] | `ingest/proposicoes` | Propostas, tramitações e temas oficiais |
| [x] | `ingest/presenca` | Presença por sessão; justificativas via serviço legado atrás de chave liga/desliga |

**Critério de saída:** todo voto, presença e item de pauta coletado aponta para um parlamentar, uma votação ou uma proposição já conhecidos; toda proposição votada ou pautada está coletada com suas tramitações; rodar qualquer coletor de novo não altera nada.

**Resultado (13/10/2026):** 824 votações da Câmara (8 nominais, 3.187 votos) e 59 do Senado (4.779 votos, 640 ausências com motivo); 166 eventos da Câmara com 1.125 itens de pauta, 41 sessões e 60 reuniões do Senado; 1.103 proposições com 21.916 tramitações; 5.917 presenças e 7 dias de frequência com justificativas. Conferência completa: nenhum voto ou presença sem parlamentar, nenhum item de pauta sem votação, nenhuma votação ou matéria pautada sem proposição coletada, nenhuma proposição sem tramitação, nenhum job com falha. Segunda execução de cada coletor sem alterações.

## Fase 3 — Dinheiro

| | Branch | Entrega |
| --- | --- | --- |
| [x] | `ingest/cota-camara` | Arquivo anual da cota parlamentar, diff diário |
| [x] | `ingest/ceaps-senado` | Despesas do Senado |
| [x] | `ingest/tse-contas-candidatos` | Receitas, despesas e doador originário |
| [x] | `ingest/tse-contas-partidos` | Contas de órgãos partidários (Fundo Eleitoral) |
| [x] | `canon/repasses` | Repasses partido → candidato por diretório e origem, sem somar níveis |

**Critério de saída:** toda despesa e receita coletada aponta para um parlamentar ou candidatura já conhecidos; nenhum CPF em claro no esquema `canon` (só hash em `ident`); cada pagamento de partido liga-se à sua despesa; cada repasse tem pessoa, partido, diretório e fonte, sem receita vigente duplicada; rebaixar qualquer arquivo não altera nada.

**Resultado (13/10/2026):** 114.452 despesas da cota da Câmara (R$ 138,0 mi) e 15.098 da CEAPS do Senado (R$ 24,2 mi), todas ligadas a deputado ou senador (lideranças partidárias sem deputado ficam marcadas); TSE 2026 para cargos federais: 71.482 receitas (R$ 4,14 bi) e 565.154 despesas (R$ 2,84 bi) de 7.790 candidatos, 218.741 linhas de doador originário; órgãos partidários: 15.079 receitas (R$ 6,09 bi), 64.772 despesas e 40.804 pagamentos com fonte, todos ligados à despesa; 25.406 repasses partido → candidato (22.442 vigentes) por diretório e fonte. Conferência completa: nenhuma coluna de CPF em `canon`, nenhuma receita ou despesa sem candidatura, nenhum repasse sem pessoa ou partido, nenhuma receita vigente duplicada. Segunda execução de cada coletor sem alterações.

## Fase 4 — Motor de eventos

| | Branch | Entrega |
| --- | --- | --- |
| [x] | `events/engine` | Regras versionadas, chave de deduplicação, carga inicial sem publicar, eventos "segurados" para revisão |
| [x] | `events/votacoes` | Voto nominal e voto contra a orientação do partido |
| [x] | `events/pauta-tramitacao` | Pauta, etapas de tramitação selecionadas, mudança de regime, proposta parada há 180 dias |
| [x] | `events/presenca-gastos` | Presença e ausência; despesas agrupadas por mês, marcadas como incompletas |
| [x] | `events/dinheiro-campanha` | Fundo recebido, repasses, doações (revisão acima de R$ 500 mil) |
| [x] | `events/candidaturas` | Troca de partido, situação de candidatura, resultado |

**Critério de saída:** todo evento aponta para uma regra versionada e para a fonte; rodar o motor de novo não cria nem altera nenhum evento; a carga inicial fica toda segurada, sem publicar; todo evento de dinheiro acima de R$ 500 mil fica segurado para revisão humana; nenhum doador pessoa física é nomeado no feed e nenhum CPF aparece; eventos de candidatos da eleição em curso ficam só para quem segue durante a campanha; todo evento de parlamentar ou candidato tem a pessoa como alvo, salvo os casamentos ainda na fila de revisão.

**Resultado (14/10/2026):** 131.640 eventos de 15 tipos, cada um com regra v1 em `feed.regra`: 6.362 votos nominais e 87 votos contra a orientação do partido; 1.272 itens de pauta, 6.671 etapas de tramitação, 68 passagens para urgência e 821 propostas paradas há 180 dias; 5.295 presenças, 320 ausências e 5.363 meses de despesa da cota (1.791 ainda incompletos); 1.770 recebimentos de fundo por diretório, 22.442 repasses partido → candidato e 19.297 doações somadas por dia e origem; 3.532 trocas de partido, 30.156 situações de candidatura e 28.184 resultados. Totais conferidos com o `canon`: repasses (R$ 3,77 bi) e doações (44.245 receitas, R$ 359,4 mi) iguais às consultas diretas; votos, presenças, ausências e meses de despesa iguais às contagens das tabelas de origem. Conferência completa: nenhum evento sem fonte, nenhuma chave de deduplicação repetida, nenhum publicado (129.473 segurados pela carga inicial e 2.167 por passar de R$ 500 mil, todos os acima do limite), nenhum padrão de CPF em título, resumo ou payload, nenhuma doação de pessoa física com nome, todos os 60.650 eventos de candidatos de 2026 visíveis só para seguidores. Só 92 eventos de candidatura ficam sem pessoa (casamentos pendentes) e 137 itens de pauta sem alvo (requerimentos de comissão, não coletados por desenho). Segunda execução do motor sem nenhuma alteração nos 15 tipos.

## Fase 5 — API do app

| | Branch | Entrega |
| --- | --- | --- |
| [x] | `api/auth` | Conta anônima por aparelho, JWT curto com refresh rotativo, login Apple e Google |
| [x] | `api/seguir` | Seguir pessoa, partido, proposta e assunto |
| [x] | `api/feed` | Feed com paginação por cursor e filtros por tipo e assunto |
| [x] | `api/perfis` | Perfis de pessoa e partido por categoria |
| [x] | `api/propostas` | Proposta com linha do tempo |
| [x] | `api/busca` | Busca textual em português |
| [x] | `api/conta` | Preferências, exclusão de conta, limite de requisições |

## Fase 6 — App mobile

| | Branch | Entrega |
| --- | --- | --- |
| [ ] | `mobile/onboarding` | Estado ou CEP (convertido no aparelho), quem seguir, assuntos, pré-pergunta de notificação |
| [ ] | `mobile/feed` | Feed, filtros, "Você parou aqui", detalhe do evento com fonte |
| [ ] | `mobile/perfis` | Perfis de pessoa e partido por categoria |
| [ ] | `mobile/propostas` | Proposta com linha do tempo |
| [ ] | `mobile/busca-seguindo` | Busca, explorar e gerenciar quem segue |
| [ ] | `mobile/offline-a11y` | Cache offline básico e revisão de acessibilidade |

## Fase 7 — Notificações

| | Branch | Entrega |
| --- | --- | --- |
| [ ] | `notify/fila-envio` | Fila de envio com teto diário e horário de silêncio |
| [ ] | `notify/fcm` | Adaptador FCM para Android e iOS |
| [ ] | `notify/resumo-semanal` | Resumo semanal de dinheiro e despesas |

## Fase 8 — Operação

| | Branch | Entrega |
| --- | --- | --- |
| [ ] | `admin/revisao` | Painel de revisão: casamentos incertos, eventos segurados, erratas |
| [ ] | `ops/observabilidade` | OpenTelemetry, Sentry, alertas de dados desatualizados |
| [ ] | `ops/backup` | Backup contínuo do banco e teste de restauração |
| [ ] | `ops/deploy` | Terraform e deploy em VMs |

## Fase 9 — Pré-lançamento

| | Branch | Entrega |
| --- | --- | --- |
| [ ] | `security/hardening` | Checklist OWASP ASVS nível 2, revisão de dependências |
| [ ] | `docs/termos-privacidade` | Termos de uso e política de privacidade (após revisão jurídica) |
| [ ] | `release/beta` | Build de lojas e beta fechado |

## Depois do MVP

| Fase | O que entra |
| --- | --- |
| V1 | Emendas parlamentares, discursos, estatísticas de presença e alinhamento, comparar políticos, versão web |
| V2 | Assembleias estaduais, resumo de votações com IA (com fonte), notícias de imprensa (só título e link) |
| V3 | Câmaras municipais das capitais, eleições de 2028, API para jornalistas e organizações |

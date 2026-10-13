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
| [ ] | `ingest/presenca` | Presença por sessão; justificativas via serviço legado atrás de chave liga/desliga |

## Fase 3 — Dinheiro

| | Branch | Entrega |
| --- | --- | --- |
| [ ] | `ingest/cota-camara` | Arquivo anual da cota parlamentar, diff diário |
| [ ] | `ingest/ceaps-senado` | Despesas do Senado |
| [ ] | `ingest/tse-contas-candidatos` | Receitas, despesas e doador originário |
| [ ] | `ingest/tse-contas-partidos` | Contas de órgãos partidários (Fundo Eleitoral) |
| [ ] | `canon/repasses` | Repasses partido → candidato por diretório e origem, sem somar níveis |

## Fase 4 — Motor de eventos

| | Branch | Entrega |
| --- | --- | --- |
| [ ] | `events/engine` | Regras versionadas, chave de deduplicação, carga inicial sem publicar, eventos "segurados" para revisão |
| [ ] | `events/votacoes` | Voto nominal e voto contra a orientação do partido |
| [ ] | `events/pauta-tramitacao` | Pauta, etapas de tramitação selecionadas, mudança de regime, proposta parada há 180 dias |
| [ ] | `events/presenca-gastos` | Presença e ausência; despesas agrupadas por mês, marcadas como incompletas |
| [ ] | `events/dinheiro-campanha` | Fundo recebido, repasses, doações (revisão acima de R$ 500 mil) |
| [ ] | `events/candidaturas` | Troca de partido, situação de candidatura, resultado |

## Fase 5 — API do app

| | Branch | Entrega |
| --- | --- | --- |
| [ ] | `api/auth` | Conta anônima por aparelho, JWT curto com refresh rotativo, login Apple e Google |
| [ ] | `api/seguir` | Seguir pessoa, partido, proposta e assunto |
| [ ] | `api/feed` | Feed com paginação por cursor e filtros por tipo e assunto |
| [ ] | `api/perfis` | Perfis de pessoa e partido por categoria |
| [ ] | `api/propostas` | Proposta com linha do tempo |
| [ ] | `api/busca` | Busca textual em português |
| [ ] | `api/conta` | Preferências, exclusão de conta, limite de requisições |

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

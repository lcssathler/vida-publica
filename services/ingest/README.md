# Worker de coleta e eventos

Baixa os dados públicos oficiais, guarda cada arquivo bruto sem alteração, normaliza, casa as pessoas entre fontes e gera os eventos do feed.

## Estrutura

| Arquivo | Papel |
| --- | --- |
| `ports.py` | Interfaces (armazenamento bruto, registro de coletas, registro de jobs) |
| `adapters/` | Implementações: em memória (testes) e S3 |
| `raw.py` | Guarda cada conteúdo uma única vez por fonte, dataset e hash, em caminho imutável |
| `snapshot.py` | Sincroniza arquivos que são fotografias completas: linhas novas entram, ausentes ganham `removido_em` |
| `jobs.py` | Executa jobs registrando início, fim e erro |
| `events/engine.py` | Motor de eventos: regras versionadas, deduplicação, carga inicial segurada, revisão de dinheiro |
| `events/comum.py` | Índices de pessoas, partidos, proposições e temas usados nos alvos; textos |
| `events/votacoes.py` | `voto_nominal` e `voto_contra_orientacao` |
| `events/proposicoes.py` | `pauta`, `tramitacao` (etapas selecionadas), `mudanca_regime` e `proposta_parada` (180 dias) |
| `events/registro.py` | Geradores de eventos executados pelo comando `eventos` |
| `cli.py` | Comando `vp-ingest` |

As dependências são em Python puro sempre que possível (driver `pg8000`, `csv` da biblioteca padrão), para o worker rodar igual em qualquer máquina, sem binários nativos.

## Rodar localmente

Requer [uv](https://docs.astral.sh/uv/) e Python 3.13. Dentro de `services/ingest`:

```bash
uv sync
```

```bash
uv run pytest
```

```bash
uv run ruff check . && uv run ruff format --check .
```

Com a infraestrutura local no ar (veja `infra/README.md`), confira o acesso ao S3 e crie o bucket de dados brutos. Use a `S3_SECRET_KEY` do seu `infra/.env`:

```bash
VP_S3_SECRET_KEY=<valor do infra/.env> uv run vp-ingest check-storage
```

## Configuração

Variáveis com prefixo `VP_` (`src/vida_publica_ingest/config.py`):

| Variável | Padrão |
| --- | --- |
| `VP_S3_ENDPOINT` | `http://localhost:9000` |
| `VP_S3_ACCESS_KEY` | `vp_s3` |
| `VP_S3_SECRET_KEY` | (obrigatória fora dos testes) |
| `VP_S3_BUCKET_RAW` | `vp-raw` |
| `VP_USER_AGENT` | identifica o coletor para as fontes oficiais |
| `VP_CAMARA_PRESENCA_LEGADO` | `false`; `true` liga o serviço legado de frequência diária da Câmara |

## Pipeline

Cada comando roda como job registrado em `raw.job_run`. Pelo Docker: `docker compose -f infra/docker-compose.yml run --rm worker <comando>`.

| Ordem | Comando | O que faz |
| --- | --- | --- |
| 1 | `camara-deputados` | Deputados da legislatura (padrão 57), com CPF só em hash |
| 2 | `senado-senadores` | Senadores e suplentes da legislatura, com data de nascimento |
| 3 | `tse-candidaturas` | Candidaturas do TSE (padrão 2018, 2022, 2026) |
| 4 | `partidos` | Partidos, siglas ao longo do tempo e sucessões |
| 5 | `resolver-pessoas` | Liga TSE, Câmara e Senado numa mesma pessoa e mostra a cobertura |
| 6 | `camara-historico` | Legislaturas e histórico de posses, saídas e trocas de partido |
| 7 | `mandatos-filiacoes` | Mandatos por pessoa e períodos de filiação com datas |
| 8 | `camara-votacoes` | Votações da Câmara com votos nominais e orientações de bancada (`--desde`, `--ate`; padrão: últimos 7 dias) |
| 9 | `senado-votacoes` | Votações nominais do Senado com o voto ou o motivo da ausência de cada senador (`--desde`, `--ate`) |
| 10 | `agenda-pauta` | Eventos da Câmara com a pauta dos deliberativos; sessões do Plenário e reuniões de comissão do Senado com seus itens (`--desde`, `--ate`; inclui agenda futura) |
| 11 | `proposicoes` | Proposições citadas por votações, pautas e reuniões (lista de interesse), com tramitações, temas oficiais e autores; `--camara`/`--senado` acrescentam ids, `--so-ids` coleta só eles |
| 12 | `presenca` | Presença de deputados nos eventos deliberativos já coletados (`--desde`, `--ate`); com `VP_CAMARA_PRESENCA_LEGADO=true`, também a frequência diária do Plenário com justificativas (serviço legado). No Senado, a presença vem dos códigos de comparecimento em `senado-votacoes` |
| 13 | `cota-camara` | Despesas da cota parlamentar da Câmara: arquivo anual rebaixado e comparado com o banco (novas, removidas, restauradas); CPF de fornecedor pessoa física só em hash (`--ano`; padrão: ano corrente) |
| 14 | `ceaps-senado` | Despesas dos senadores (CEAPS): arquivo anual comparado com o banco; senador casado pelo nome parlamentar; CPF de fornecedor pessoa física só em hash (`--ano`) |
| 15 | `tse-contas-candidatos` | Prestação de contas de candidatos do TSE (receitas, doador originário, despesas contratadas) como fotografia anual; padrão só cargos federais (`--cargo`, `--todos-cargos`, `--ano`); CPF de doador ou fornecedor só em hash |
| 16 | `tse-contas-partidos` | Prestação de contas de órgãos partidários do TSE (receitas, doador originário, despesas contratadas e pagamentos com a fonte do recurso) como fotografia anual (`--ano`) |
| 17 | `repasses` | Repasses partido → candidato (`canon.repasse`): uma linha por receita de partido, com diretório (esfera e UF), fonte (fundo especial, fundo partidário, outros) e prestação vigente; totais em `canon.repasse_total` nunca somam esferas nem fontes |

Todos são idempotentes: rodar de novo só grava o que mudou.

## Eventos do feed

Depois da coleta, `eventos` transforma o esquema `canon` em eventos do feed (`feed.evento`). Cada tipo de evento tem uma regra versionada em `feed.regra`; cada gerador devolve todos os fatos do seu tipo e o motor grava só a diferença:

| Comando | O que faz |
| --- | --- |
| `eventos` | Gera os eventos de todos os tipos (`--tipo` para um só). Na primeira execução de cada tipo (carga inicial, ou com `--carga-inicial`), os eventos ficam segurados sem publicar |
| `eventos-liberar` | Publica os eventos segurados pela carga inicial (`--tipo`); os segurados por valor esperam a revisão do admin |
| `eventos-resumo` | Eventos por tipo, versão, status e motivo |

Regras do motor:

- **Deduplicação:** `chave_dedup` = tipo, versão da regra e ids da fonte; rodar de novo não duplica nem altera nada.
- **Regra versionada:** mudar a lógica ou um parâmetro de uma regra sem subir a versão é erro. A versão nova herda o status de cada fato já publicado e arquiva os eventos da versão anterior (`regra_substituida`).
- **Revisão humana:** eventos de dinheiro acima de R$ 500 mil ficam `segurado` (`revisao_valor`) até o admin revisar; se o valor muda depois da revisão, voltam para a fila.
- **Fonte removeu:** fato que some da fonte tem o evento arquivado (`fonte_removeu`); se voltar, o evento recupera o status.

## Regra de ouro

Arquivos baixados das fontes nunca vão para o repositório: eles contêm dados pessoais (CPF, nomes de doadores). Fixtures de teste são pequenas e anonimizadas.

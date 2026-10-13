# Arquitetura

O sistema coleta dados públicos oficiais, guarda cada coleta sem alterar, compara com a coleta anterior e transforma só a diferença em eventos. O app lê esses eventos por uma API própria; nenhum cliente acessa o banco diretamente.

```
Fontes oficiais ──► Workers de coleta ──► Dado bruto (S3) ──► Normalização
                                                                   │
App mobile ◄── API própria ◄── PostgreSQL ◄── Motor de eventos ◄── Resolução de entidades
     ▲                             │
     └──── Envio de push ◄── Fila ─┘
```

## Componentes

| Componente | Pasta | Tecnologia | Responsabilidade |
| --- | --- | --- | --- |
| API | `apps/api` | NestJS (TypeScript) | Autenticação, feed, perfis, seguir, busca, admin |
| Worker de coleta e eventos | `services/ingest` | Python 3.12 | Baixar fontes, guardar o bruto, normalizar, casar pessoas, gerar eventos |
| App | `apps/mobile` | Expo (React Native) | Interface para iOS e Android |
| Banco | `db/` | PostgreSQL 16 + dbmate | Dados canônicos, eventos e dados de usuário |
| Infra local | `infra/` | Docker Compose | Banco e armazenamento S3 (MinIO) na máquina de quem desenvolve |

## Princípios

1. **Todo dado bruto é guardado antes de ser interpretado.** Cada arquivo baixado vai para o armazenamento com hash, sem alteração. Reprocessar não exige baixar de novo.
2. **Eventos são reprodutíveis.** A mesma coleta com a mesma versão de regra gera o mesmo evento, identificado por uma chave única.
3. **Nenhuma dependência externa é obrigatória.** Banco, fila, armazenamento, push, login e busca ficam atrás de interfaces (portas e adaptadores). Trocar de fornecedor é escrever outro adaptador.
4. **Monólito modular.** A API é um serviço com módulos de fronteira rígida (identidade, catálogo, feed, seguir, notificações, admin). Módulos conversam por interfaces e eventos internos e podem virar serviços separados quando o volume pedir.
5. **Fonte em tudo.** Todo evento carrega a fonte oficial, o link, a data do dado e a data da coleta. Sem fonte, não publica.
6. **Neutralidade.** Textos gerados por modelos fixos, sem adjetivos; a mesma regra vale para todos.

## Esquemas do banco

| Esquema | Conteúdo | Quem escreve | Quem lê |
| --- | --- | --- | --- |
| `raw` | Metadados de cada coleta (`raw_object`) e execuções (`job_run`) | Worker | Worker, admin |
| `canon` | Pessoas, partidos, mandatos, propostas, votações, despesas, contas de campanha | Worker | API, admin |
| `feed` | Eventos gerados | Worker | API, admin |
| `app` | Usuários, quem segue o quê, preferências, aparelhos, notificações | API | API, admin |

Cada componente usa um papel de banco próprio com o mínimo de permissão: o worker não lê dados de usuário, e a API não escreve dados públicos.

## Dados pessoais

- O CPF de políticos é usado só para casar registros entre fontes e é guardado apenas como hash com sal. Nunca é exibido.
- O CPF de doadores nunca é guardado nem exibido. Nomes de doadores pessoa física aparecem apenas em doações acima de R$ 10 mil.
- Dados de usuário são mínimos: identificador anônimo, o que a pessoa segue, token de push e estado (opcional).

## Decisões registradas

As decisões de arquitetura ficam em [`docs/adr`](adr/).

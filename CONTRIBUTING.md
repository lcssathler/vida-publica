# Como contribuir

## Fluxo de trabalho

1. **Nunca faça commit direto na `main`.** Ela é protegida: só recebe código por pull request.
2. Crie uma branch curta e coesa a partir da `main` atualizada, com um único objetivo:
   `<tipo>/<escopo>-<descricao>`, por exemplo `ingest/camara-votacoes` ou `fix/api-feed-cursor`.
   Tipos usados: `feat`, `fix`, `chore`, `ci`, `docs`, `infra`, `db`, `api`, `ingest`, `canon`, `events`, `mobile`, `notify`, `admin`, `ops`, `security`, `release`.
3. Mantenha a branch pequena (ideal: até ~400 linhas alteradas) e viva por poucos dias. Se crescer, divida.
4. Abra o pull request preenchendo o modelo. O merge é feito por **squash**, e a branch é apagada depois.
5. **Nada é mergeado sem CI verde.** Testes, lint e varredura de segredos são obrigatórios.

## Mensagens de commit

Use [Conventional Commits](https://www.conventionalcommits.org/pt-br/): `feat(api): adiciona endpoint de feed`, `fix(ingest): trata nota sem CNPJ`.

## O que nunca vai para o repositório

Este repositório é **público**. Antes de cada commit, confira:

- Segredos: chaves de API, tokens, senhas, arquivos `.env`. Use `.env.example` com valores fictícios.
- Dados brutos baixados das fontes (ZIP, CSV, JSON). Arquivos do TSE contêm CPF e nomes completos de pessoas.
- Dados pessoais em fixtures de teste. Fixtures devem ser pequenas e **anonimizadas** (CPF, nomes de pessoas físicas e e-mails trocados por valores fictícios).
- Documentos internos de estratégia, pesquisa de mercado ou dados de usuários.

O CI roda o [gitleaks](https://github.com/gitleaks/gitleaks) em todo pull request, e o GitHub bloqueia pushes com segredos conhecidos. Isso é rede de proteção, não substituto do cuidado.

## Ambiente local

As instruções de cada parte ficam no README de cada pasta (`apps/api`, `services/ingest`, `apps/mobile`, `infra`).

# Painel de revisão

Painel interno do Vida Pública em Next.js 16 (App Router), para a revisão humana: eventos segurados, casamentos incertos de pessoas, reportes de erro e erratas públicas. Não tem regra de negócio nem acesso ao banco: tudo passa pela **API do admin** (`apps/api/src/admin`, outro processo da API com o usuário `vp_admin` do banco), que é onde ficam as permissões. O painel só renderiza no servidor e chama a API com a sessão de quem entrou.

## Telas

| Caminho | O que faz |
| --- | --- |
| `/entrar` | E-mail, senha e código do app de autenticação (2FA, TOTP). Não há cadastro: contas são criadas por quem administra o servidor (`admin-cli`, ver `apps/api/README.md`) |
| `/` | Resumo: segurados por motivo e tipo, casamentos na fila, reportes abertos, erratas |
| `/eventos` | Eventos segurados (dinheiro acima de R$ 500 mil, carga inicial ou regra nova), do maior valor para o menor, com filtros; publicar ou arquivar em lote, com nota. Publicados e arquivados pelo painel, e busca pelo título em todos |
| `/eventos/[id]` | Detalhe: regra, valor, fonte, alvos, dados do evento, erratas e o histórico de ações. Publicar (só segurado e com fonte), arquivar (tira do app) ou publicar errata |
| `/casamentos` | Fila de casamentos de pessoas (`canon.match_review`): pendentes, resolvidos e descartados |
| `/casamentos/[fonte]/[id]` | O registro da fonte ao lado de pessoas com nome parecido (nascimento, fontes ligadas, candidaturas): ligar à pessoa marcada, criar pessoa nova ou descartar, sempre com nota |
| `/reportes` | "Reportar erro" vindo do app: só o conteúdo (motivo e texto), nunca a conta |
| `/erratas`, `/erratas/nova` | Erratas publicadas e o formulário (título, texto, arquivar o evento, reportes resolvidos) |
| `/acoes` | Registro de tudo o que o painel mudou: quem, quando e o quê |

## Regras

- **Publicar um segurado** grava `status = 'publicado'`, `publicado_em` (mantido se o evento já tinha sido publicado antes), `revisado_em` e `revisado_por = admin:<id>`. O notificador vê a publicação pelo `publicado_em`, como qualquer outra: só quem já seguia um alvo recebe, fato com mais de 7 dias não vira aviso e nada é reenviado (dinheiro vai para o resumo semanal). Só publica a versão que o revisor viu (`content_hash`): se o motor mudou o evento nesse meio-tempo, a API recusa. Sem fonte, não publica.
- **Arquivar** grava `motivo = 'admin'`; o motor nunca desarquiva.
- **Casamento**: ligar cria um vínculo `manual` em `canon.pessoa_vinculo`, que o worker não sobrescreve; os eventos ganham a pessoa na próxima rodada do worker (`resolver-pessoas`, `eventos`).
- **Errata**: pública, sem edição nem exclusão; a API recusa texto com algo parecido com CPF. Doador pessoa física com até R$ 10 mil nunca é nomeado (o feed nem o nomeia).
- **Dados de usuários do app**: o painel não vê contas, sessões, aparelhos nem o que cada um segue (o papel do admin perdeu a leitura do esquema `app`), só o conteúdo dos reportes.

## Segurança

- **IP**: `src/proxy.ts` recusa (403) quem não está em `ADMIN_IPS` antes de qualquer página, inclusive o login; a API do admin confere de novo com o IP que o painel repassa. Lista vazia: ninguém entra. O IP é o último do `X-Forwarded-For`: em produção o painel fica atrás do proxy reverso, que sobrescreve o cabeçalho.
- **Sessão**: o token da sessão do painel (8 h) fica num cookie `httpOnly`, `SameSite=Strict` e `Secure` fora da máquina local; o JavaScript da página não o lê. A API guarda só o hash. Sair encerra a sessão na API.
- **Login**: senha (scrypt) e código TOTP sempre juntos; o mesmo código não vale duas vezes; 5 erros seguidos bloqueiam a conta por 15 minutos; 10 tentativas por IP a cada 15 minutos. A resposta de erro é igual para e-mail desconhecido, senha e código errados.
- **Formulários**: server actions do Next (conferem a origem contra CSRF). Cabeçalhos: CSP sem nada de fora, `frame-ancestors 'none'`, `no-store`, `Referrer-Policy: same-origin`.

## Rodar localmente

Com o compose no ar (`admin-api` em `127.0.0.1:3001`), na raiz:

```bash
pnpm --filter @vida-publica/admin run dev
```

Abre em `http://127.0.0.1:3002`. Ou pelo compose (`painel`, imagem `apps/admin/Dockerfile`), na mesma porta.

## Configuração

| Variável | Padrão | Descrição |
| --- | --- | --- |
| `ADMIN_API_URL` | `http://127.0.0.1:3001` | API do admin, na rede privada |
| `ADMIN_IPS` | `127.0.0.1,::1` | IPs ou faixas CIDR que podem abrir o painel |
| `PAINEL_HTTP` | vazio | `1` permite o cookie sem HTTPS fora do desenvolvimento (só o compose local) |

## Verificações

```bash
pnpm --filter @vida-publica/admin run lint
```

```bash
pnpm --filter @vida-publica/admin run typecheck
```

```bash
pnpm --filter @vida-publica/admin run test
```

```bash
pnpm --filter @vida-publica/admin run build
```

O build usa o webpack (`--webpack`): nas máquinas em que binários nativos não assinados são bloqueados, o Next cai no SWC em WebAssembly (`@next/swc-wasm-nodejs`), que o Turbopack não aceita.

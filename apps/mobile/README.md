# App mobile

App do Vida Pública em Expo (SDK 57) com Expo Router. Consome a API de `apps/api`.

## Design "Protocolo"

Cada ato público vira um registro numerado, datado e carimbado, como no Diário Oficial. As regras ficam em `src/theme/tokens.ts`:

- Tinta sobre papel, um único acento (violeta de carimbo). Nenhuma cor carrega significado político; verde e vermelho não aparecem em dados.
- Tipografia: Newsreader (manchetes), Schibsted Grotesk (interface) e IBM Plex Mono (números, datas, siglas). Todas SIL Open Font License.
- Raio de 2 pt, sem sombras no conteúdo; hierarquia por fios.
- Contraste testado automaticamente (WCAG AA) nos modos claro e escuro.
- Alvo de toque mínimo de 48 pt (`toque.minimo`); acessibilidade pelas props `role` e `aria-*`, que valem no Android, no iOS e na web.

| Componente | Papel |
| --- | --- |
| `Registro` | Item do feed: tipo, manchete factual, contexto, carimbo da fonte, data de coleta e protocolo. Lido como uma frase completa pelo leitor de tela |
| `CarimboFonte` | Selo da fonte oficial com a data do dado |
| `Tela` | Folha com cabeçalho (fio duplo), conteúdo e pé de ações |
| `Botao`, `Alternar` | Ação e liga/desliga (seguir, escolher); o estado marcado não depende só da cor |
| `FotoOficial` | Foto 3×4 da Câmara ou do Senado, sempre com o crédito ao lado |
| `Carregando`, `Falha`, `Vazio` | Estados de tela, anunciados ao leitor de tela |

## Sessão e API

- `src/api/cliente.ts`: na primeira abertura cria a conta anônima (`POST /auth/anonimo`). O refresh token fica só no armazenamento seguro do aparelho (`expo-secure-store`, em `src/sessao/cofre.ts`); o token de acesso, só na memória. Renova antes de expirar e depois de um 401, uma renovação por vez, e grava o par novo que cada renovação devolve. Se a API recusar o refresh (reuso), o app abre uma conta anônima nova e volta ao onboarding.
- 429: espera o `Retry-After` curto (até 5 s) uma vez; acima disso a tela mostra quanto esperar.
- `src/api/consultas.ts`: consultas com TanStack Query. "Seguindo" tem uma fonte única (`GET /seguindo`) e seguir aparece na hora, desfeito se a API recusar.
- Estado local não secreto (onboarding concluído, estado) em AsyncStorage (`src/sessao/local.ts`).

## Onboarding

1. Estado, pela lista ou pelo CEP. O CEP é convertido em estado no aparelho (`src/onboarding/estados.ts`, faixas dos Correios) e nunca vai para a API nem para o armazenamento: só a sigla do estado vai para as preferências da conta.
2. Quem seguir: senadores e deputados federais em exercício no estado (`GET /parlamentares?uf=`), com foto oficial e crédito.
3. Assuntos: os temas oficiais das propostas (`GET /assuntos`).
4. Pré-pergunta de notificação: o pedido do sistema só aparece se a pessoa aceitar; a preferência fica com o que o sistema permitiu. Com a permissão, o app registra o token de envio (ver Avisos).

Até concluir, só as telas do onboarding ficam acessíveis (`Stack.Protected` em `src/app/_layout.tsx`).

## Feed

- Abas (`src/app/(abas)`): Feed, Busca, Seguindo e Conta, só com rótulo de texto.
- `GET /feed` por cursor (`useInfiniteQuery`), de 20 em 20, com "Quem eu sigo" ou "Tudo" e filtros por tipo (as mesmas categorias dos perfis: votos, presença, gastos, propostas, campanha, eleições) e por assunto (os seguidos e os de mais propostas).
- Registros agrupados por dia de Brasília. Fato só com data (meia-noite em Brasília) não mostra hora. Datas e valores formatados sem depender do `Intl` (`src/comum/formato.ts`).
- "Você parou aqui": o registro do topo da última visita fica guardado no aparelho por escopo. Na volta, o que vem antes dele é grifado como novo e um divisor marca onde a pessoa parou (`src/feed/linhas.ts`).
- Detalhe (`/evento/[id]`): fato, data, valor, envolvidos, fonte (carimbo, nome, endereço, data do dado e da coleta, botão para abrir a fonte oficial) e a regra que gerou o registro.

## Perfis

- Pessoa (`/pessoa/[id]`): foto oficial com crédito, nome e nome civil, mandatos, histórico de partido (cada sigla leva ao perfil do partido), cota parlamentar dos dois anos mais recentes com as maiores categorias, quem financiou a campanha por eleição e as candidaturas. Os doadores aparecem exatamente como a API entrega: por origem, entidades com CNPJ pelo nome, pessoa física nomeada só acima de R$ 10 mil e o resto somado em "outras".
- Partido (`/partido/[id]`): número, nome, anos no TSE, sucessor e antecessores, parlamentares em exercício (cada um leva ao perfil) e repasses a candidatos por ano, fonte e esfera.
- Os dois terminam na linha do tempo por categoria (`src/perfis/LinhaDoTempo.tsx`), com as contagens da API e cursor; só aparecem as categorias com registros.
- Os envolvidos no detalhe do registro e os itens da aba Seguindo levam aos perfis.

## Propostas

- `/proposta/[id]` (`GET /propostas/{id}`): Casa e tipo, identificação, apelido, ementa, situação (desde quando, órgão, regime, data de apresentação), proposta principal quando tramita apensada, autores (parlamentar leva ao perfil), temas, inteiro teor e fonte oficial.
- Linha do tempo da mais recente à mais antiga, num trilho: tramitações (despacho, documento, "Ver registro" quando a etapa virou evento do feed, e a situação só onde ela mudou), votações (aprovada, rejeitada ou sem resultado, nominal ou simbólica, placar escrito e uma barra só em tons de tinta, fonte) e os registros de pauta e de proposta parada.
- Propostas aparecem como links nos envolvidos do registro e na aba Seguindo.

## Busca, Seguindo e Conta

- Busca (`GET /busca`): resultados enquanto se digita (a partir de 2 letras, com espera de 350 ms para não gastar o limite de 30 buscas por minuto), agrupados em pessoas, partidos, propostas e assuntos, com seguir em cada linha e "Ver mais" por grupo (`tipo=` e até 50). Com o campo vazio, "Explorar": quem representa o estado escolhido e os assuntos com mais propostas.
- Seguindo: o que a pessoa segue agrupado por tipo, com o total diante do limite de 500, e "Desfazer" depois de deixar de seguir.
- Conta (`GET /conta`, `PATCH /conta/preferencias`): estado, avisos (ligar pede a permissão do sistema; negada, a preferência fica desligada e o app oferece abrir os ajustes), resumo semanal, máximo por dia, horário de silêncio, fuso; "Refazer o início"; sair do aparelho (contas com login); excluir a conta com confirmação (`DELETE /conta`), que apaga o refresh do cofre, limpa o estado local e volta ao onboarding com uma conta anônima nova.
- Login opcional com Apple (iOS, quando o aparelho oferece) e Google (só quando configurado), em `src/conta/login.ts`: o app pega o token de identidade do provedor sem pedir nome nem e-mail e troca em `POST /auth/entrar/{provedor}`. Se a identidade já tinha conta, o que o aparelho seguia é juntado a ela.

## Avisos

- O token de envio do FCM só é pedido e registrado depois que a pessoa aceitou a pré-pergunta (ou ligou os avisos na Conta) **e** o sistema permitiu (`avisos` no estado local, conferido com `getPermissionsAsync` a cada abertura). Vai para `PUT /dispositivo` só com a plataforma; é registrado de novo a cada abertura e quando o FCM troca o token (`src/notificacoes/avisos.ts`).
- Android: o token nativo do `expo-notifications` já é o token do FCM; o build precisa do `google-services.json` do projeto no Firebase (`VP_FIREBASE_ANDROID_JSON`). O canal `avisos` é criado antes do pedido de permissão.
- iOS: o token nativo é da APNs, que o FCM não aceita. Com o `GoogleService-Info.plist` no build (`VP_FIREBASE_IOS_PLIST`), o React Native Firebase Messaging registra o aparelho e devolve o token do FCM (`src/notificacoes/token.ios.ts`); sem ele, o iOS não registra token. O React Native Firebase só é ligado no iOS (`react-native.config.js`): no Android, um segundo serviço de mensagens disputaria os avisos com o do `expo-notifications`. Precisa de build de desenvolvimento.
- Web (só desenvolvimento): não há token; registro e remoção ficam desligados (`*.web.ts`).
- Desligar os avisos na Conta grava a preferência (a API para de enfileirar) e apaga o token (`DELETE /dispositivo`); sair e excluir a conta apagam o token na própria API.
- Tocar num aviso abre o registro com a fonte: os dados trazem `url: vidapublica://evento/{id}`, lido onde cada plataforma o entrega (`src/notificacoes/link.ts`). O resumo semanal traz `vidapublica://feed?categorias=gastos,campanha` e abre o feed de quem a pessoa segue com esses filtros (o feed aceita `?categorias=` na rota). Com o app aberto, o aviso aparece na faixa, sem som.

## Offline

- As consultas ficam guardadas no aparelho (TanStack Query persistido em AsyncStorage, `src/offline/cache.ts`) por 3 dias: feed, registros, perfis, propostas, o que a pessoa segue e as listas do onboarding. A busca não fica guardada. Listas com cursor guardam só as 3 primeiras páginas.
- Sem rede (`expo-network` no aparelho; eventos do navegador na web), as consultas ficam em pausa, as telas mostram o que está guardado e uma faixa avisa "Sem conexão", com a hora dos dados no feed. Ao voltar, tudo retoma sozinho.
- Quem já passou do onboarding abre o app sem rede; a sessão é renovada na primeira chamada com conexão, com o mesmo refresh guardado.
- Excluir a conta ou ter a sessão encerrada apaga o cache do aparelho.

## Acessibilidade

- Controles com papel (`button`, `link`, `checkbox`, `radio`, `switch`) e nome lido; estado marcado em `aria-checked` e com "✓", nunca só pela cor; alvo de toque mínimo de 48 pt; título (`heading`) em toda tela; fotos decorativas escondidas do leitor; avisos e erros em regiões vivas.
- Contraste WCAG AA (4,5:1) para todo texto, inclusive o metadado de 11 pt, nos modos claro e escuro, no papel e no papel elevado (`src/theme/__tests__/tokens.test.ts`).
- Fonte do sistema respeitada; com fonte grande (acima de 130%), a hora do registro sai da coluna de margem.
- `src/test/auditoria.ts` revisa automaticamente cada tela nos testes (`src/__tests__/acessibilidade.test.tsx`): papel, nome, alvo de 48 pt, campos com nome e título.

## Configuração

Logins opcionais (identificadores públicos, não segredos), lidos por `app.config.ts`: `VP_LOGIN_APPLE=1` liga "Sign in with Apple" no build iOS; `VP_GOOGLE_IOS_URL_SCHEME`, `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` e `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` ligam o Google (biblioteca nativa: precisa de build de desenvolvimento, não roda no Expo Go). Sem elas, os botões não aparecem. A API precisa dos mesmos ids em `APPLE_CLIENT_IDS` e `GOOGLE_CLIENT_IDS`.

Avisos pelo FCM: `VP_FIREBASE_ANDROID_JSON` (caminho do `google-services.json`) e `VP_FIREBASE_IOS_PLIST` (caminho do `GoogleService-Info.plist`), baixados do console do Firebase e guardados fora do repositório (o `.gitignore` bloqueia os dois nomes). Sem eles, o app funciona sem token de envio.

O endereço da API vem de `EXPO_PUBLIC_API_URL`, definido na hora do empacotamento (copie `.env.example` para `.env.local`). Não é segredo e o app não guarda nenhuma chave. Sem a variável, usa `http://localhost:3000` (a API do compose). No emulador Android, use `http://10.0.2.2:3000`.

## Rodar

Na raiz do repositório:

```bash
pnpm install
```

```bash
pnpm --filter @vida-publica/mobile run start
```

Abra no Expo Go, num emulador ou na web (tecla `w`). A versão web serve para conferir as telas no desenvolvimento: a API precisa aceitar a origem dela por CORS (`VP_API_CORS_ORIGENS=http://localhost:8081` no `infra/.env` antes de subir o compose). Na web não há armazenamento seguro: o refresh fica no `sessionStorage` da aba.

## Verificações

```bash
pnpm --filter @vida-publica/mobile run lint
```

```bash
pnpm --filter @vida-publica/mobile run typecheck
```

```bash
pnpm --filter @vida-publica/mobile run test
```

Conferência do app contra a API real (o compose local com a carga publicada), com o próprio código do app: percorre o feed "Quem eu sigo" inteiro por cursor (sem repetir, em ordem, todo registro com fonte e com um alvo seguido), abre uma amostra de detalhes, confere a regra dos doadores, encerra a sessão por refresh reapresentado e estoura o limite da busca. Fica pulada sem `VP_CONFERIR_API`; cria contas anônimas (limite de 10 por IP a cada 10 minutos) e as exclui no fim:

```bash
VP_CONFERIR_API=http://127.0.0.1:3000 VP_CONFERIR_PESSOA=<uuid> VP_CONFERIR_PARTIDO=<id> pnpm --filter @vida-publica/mobile run conferir
```

Os testes usam jest-expo e Testing Library. As telas rodam com o cliente de verdade contra uma API falsa (`src/test/apiFalsa.ts`), que registra cada pedido.

Para adicionar pacotes, use `npx expo install <pacote>` dentro de `apps/mobile`: ele escolhe a versão compatível com o SDK.

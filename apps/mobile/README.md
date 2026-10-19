# App mobile

App do Vida Pública em Expo (SDK 57) com Expo Router. Consome a API de `apps/api`.

## Design "Cívico" (paleta Bronze)

Cada ato público vira um cartão numerado, datado e com a fonte oficial. As regras ficam em `src/theme/tokens.ts`:

- Cartões claros flutuando sobre areia (modo claro) ou grafite (modo escuro), com um único acento bronze. O acento só marca interface (abas, etiquetas, links), e nenhuma cor identifica partido ou campo político.
- Única cor de dado: o voto. Sim em verde suave e Não em vermelho suave, sempre com ícone (✓ ou ✕) e a palavra, nunca só a cor. Resultado de votação, orientação de bancada e valores ficam em tom neutro.
- Tipografia: Geist (interface e títulos) e Geist Mono (números, datas, siglas), SIL Open Font License. Ícones de traço Feather (`@expo/vector-icons`), sempre decorativos.
- Raios de 8 a 18 pt (`radius`), cápsulas em 999; sombras leves só nos cartões e na barra (`shadowCard`, `shadowBar`, no formato `boxShadow`).
- Navegação em cápsula flutuante só com ícones; o nome de cada aba é o que o leitor de tela lê. Movimento curto (`movimento`), e a marca da aba não anima com "reduzir movimento" ligado.
- Contraste testado automaticamente (WCAG AA) nos modos claro e escuro.
- Alvo de toque mínimo de 48 pt (`toque.minimo`); acessibilidade pelas props `role` e `aria-*`, que valem no Android, no iOS e na web.

| Componente | Papel |
| --- | --- |
| `Registro` | Cartão do feed: etiqueta do tipo, manchete factual, contexto, fonte, data de coleta e protocolo. Lido como uma frase completa pelo leitor de tela |
| `CarimboFonte` | Fonte oficial com a data do dado, no pé do cartão |
| `Tela` | Fundo, título grande, barra de passos (onboarding), conteúdo e pé de ações |
| `Secao` | Título pequeno sobre um cartão agrupado |
| `AbaTexto`, `FaixaDeAbas` | Abas de texto com traço no acento embaixo da escolhida |
| `CabecalhoDeDia`, `VoceParouAqui` | "Hoje", "Ontem" ou a data, e a divisa do que já foi visto |
| `BotaoVoltar`, `Icone` | Voltar com ícone e ícones decorativos |
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
- Detalhe (`/evento/[id]`): fato, data, valor, envolvidos, fonte (carimbo, nome, endereço, data do dado e da coleta, botão para abrir a fonte oficial), a regra que gerou o registro, as erratas publicadas sobre ele e "Reportar erro".

## Erratas e "Reportar erro"

- "Reportar erro" (`/reportar/[id]`), no pé de cada registro: motivo (fato, pessoa ou partido, valor, fonte que não abre, outro) e detalhes opcionais (até 1.000 caracteres, com o aviso de não escrever dados pessoais). Vai para `POST /eventos/{id}/reporte` e para a revisão humana no painel, que não vê a conta.
- Erratas (`/erratas`, pela Conta ou pelo registro corrigido): o que estava errado, o que foi feito e a data, da mais recente, com "Ver o registro corrigido" quando ele continua no app. O registro corrigido mostra a errata num quadro no detalhe.

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

Identificador do app nas lojas: `br.org.vidapublica` (domínio `vidapublica.org.br` ao contrário), igual no Android (`android.package`) e no iOS (`ios.bundleIdentifier`), no `app.json`. É o mesmo nome dos apps no Firebase (`google-services.json` e `GoogleService-Info.plist`), do App ID na Apple, de `APPLE_CLIENT_IDS` na API e dos client IDs OAuth do Google. Depois de publicado, não muda.

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

Abra no build de desenvolvimento (abaixo), num emulador ou na web (tecla `w`). Com o `expo-dev-client` instalado, `start` serve o build de desenvolvimento; a tecla `s` troca para o Expo Go, que não recebe push nem tem os logins nativos. A versão web serve para conferir as telas no desenvolvimento: a API precisa aceitar a origem dela por CORS (`VP_API_CORS_ORIGENS=http://localhost:8081` no `infra/.env` antes de subir o compose). Na web não há armazenamento seguro: o refresh fica no `sessionStorage` da aba.

## Build de desenvolvimento (EAS)

Push, logins nativos e os módulos do Firebase só funcionam num build de desenvolvimento, não no Expo Go. O `eas.json` tem o perfil `development` (APK de distribuição interna com o `expo-dev-client`, ambiente `development` do EAS) e o `production` (para as lojas, Fase 9). No plano gratuito do EAS cabem até 15 builds Android.

Uma vez, dentro de `apps/mobile`:

1. Conta Expo (gratuita) e login: `npx eas-cli@latest login`.
2. Ligar o projeto: `npx eas-cli@latest init`. Como a configuração é dinâmica (`app.config.ts`), o comando mostra o `projectId` para pôr em `expo.extra.eas.projectId` no `app.json` (não é segredo; vai versionado).
3. Enviar o `google-services.json` ao EAS como variável do tipo arquivo, sem passar pelo git (o EAS grava o arquivo no build e põe o caminho na variável que o `app.config.ts` lê):

```bash
npx eas-cli@latest env:create --environment development --name VP_FIREBASE_ANDROID_JSON --type file --value ./google-services.json --visibility sensitive
```

A cada build:

```bash
npx eas-cli@latest build --profile development --platform android
```

No primeiro build, o EAS oferece gerar a chave de assinatura do Android (aceite: ela fica guardada no EAS). No fim, ele mostra um link e um QR code do APK para instalar no celular (permita instalar de fontes desconhecidas).

Para usar o app no celular com a API e o Metro do computador, na mesma rede Wi-Fi:

- `.env.local` com `EXPO_PUBLIC_API_URL=http://<ip do computador na rede>:3000`;
- portas 3000 (API do compose) e 8081 (Metro) liberadas no firewall do computador para a rede privada;
- `pnpm --filter @vida-publica/mobile run start` e, no app, abrir o servidor pelo QR code ou pelo endereço `http://<ip do computador>:8081`.

Ao aceitar os avisos no app, o token do FCM vai para `PUT /dispositivo` e aparece em `app.dispositivo`. O iOS fica para a Fase 9: precisa da conta Apple Developer, da chave APNs no Firebase e do `GoogleService-Info.plist`; sem o plist, o React Native Firebase nem entra no build do iOS (`react-native.config.js`).

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

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
4. Pré-pergunta de notificação: o pedido do sistema só aparece se a pessoa aceitar; a preferência fica com o que o sistema permitiu. O registro do token de envio é da Fase 7.

Até concluir, só as telas do onboarding ficam acessíveis (`Stack.Protected` em `src/app/_layout.tsx`).

## Configuração

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

Os testes usam jest-expo e Testing Library. As telas rodam com o cliente de verdade contra uma API falsa (`src/test/apiFalsa.ts`), que registra cada pedido.

Para adicionar pacotes, use `npx expo install <pacote>` dentro de `apps/mobile`: ele escolhe a versão compatível com o SDK.

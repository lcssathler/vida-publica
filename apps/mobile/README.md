# App mobile

App do Vida Pública em Expo (SDK 57) com Expo Router. Por enquanto mostra só a linguagem visual do feed com registros de exemplo (pessoas e números fictícios).

## Design "Protocolo"

Cada ato público vira um registro numerado, datado e carimbado, como no Diário Oficial. As regras ficam em `src/theme/tokens.ts`:

- Tinta sobre papel, um único acento (violeta de carimbo). Nenhuma cor carrega significado político; verde e vermelho não aparecem em dados.
- Tipografia: Newsreader (manchetes), Schibsted Grotesk (interface) e IBM Plex Mono (números, datas, siglas). Todas SIL Open Font License.
- Raio de 2 pt, sem sombras no conteúdo; hierarquia por fios.
- Contraste testado automaticamente (WCAG AA) nos modos claro e escuro.

| Componente | Papel |
| --- | --- |
| `Registro` | Item do feed: tipo, manchete factual, contexto, carimbo da fonte, data de coleta e protocolo. Lido como uma frase completa pelo leitor de tela |
| `CarimboFonte` | Selo da fonte oficial com a data do dado |

## Rodar

Na raiz do repositório:

```bash
pnpm install
```

```bash
pnpm --filter @vida-publica/mobile run start
```

Abra no Expo Go ou num emulador.

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

Para adicionar pacotes, use `npx expo install <pacote>` dentro de `apps/mobile`: ele escolhe a versão compatível com o SDK.

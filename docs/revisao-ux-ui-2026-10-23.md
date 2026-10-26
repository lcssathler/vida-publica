# Revisão UX/UI — Vida Pública — 23/10/2026

Revisão em modo **full**, com inspeção de código e walkthrough no Expo web contra a API local. A revisão original não alterou componentes. A implementação autorizada em seguida está registrada ao final deste documento.

O projeto já tem uma direção visual coerente: Inter + Instrument Serif, paletas centralizadas, cores de dados separadas da marca, fotos oficiais retangulares e componentes reutilizados. A prioridade sugerida é tornar navegação, feedback e hierarquia de informação mais claros, preservando essa identidade.

## Escopo e limites

Inspecionados: onboarding de quatro passos, Feed/Navegar, Busca, Seguindo, Conta, perfis de pessoa e partido, proposta, detalhe de evento, reporte e componentes compartilhados. Stack: Expo 57, React Native, Expo Router, StyleSheet e tokens próprios. Não se propõe outro sistema de estilos.

O roadmap marca as fases 6–8 como entregues; pré-lançamento permanece pendente. O histórico de testes do roadmap é evidência histórica, não execução nesta revisão. O ZIP foi inventariado; não contém uma seção específica do Vida Pública, e arquivos de outros projetos não foram usados como instruções.

Na execução atual, Docker foi iniciado e os contêineres existentes de API e banco ficaram saudáveis. O Expo web compilou e o navegador abriu o app, mostrando “Não foi possível abrir o Vida Pública / Sem conexão com o servidor”. O `.env.local` aponta para um IP antigo da rede; a API responde em `http://127.0.0.1:3000/health`. A tentativa de reiniciar o Expo com um endereço temporário foi recusada pela revisão automática. Não houve alteração de credenciais ou provisionamento de nuvem.

Após o usuário fornecer seu procedimento, o bloqueio foi resolvido para o navegador usando temporariamente localhost na configuração da API. O IP atual do PC é 192.168.100.70; a tentativa de acessar a API por esse IP não respondeu no prazo de 5 segundos. A inspeção visual então percorreu o app em 375×812 e a Conta também em 320×740 e 390×844. Não houve mudança em firewall. A configuração ao encerrar foi devolvida ao IP atual do PC.

Os achados distinguem observações visuais, comportamentos implementados identificados no código e riscos ainda sem reprodução. Painel administrativo autenticado, Android/iOS reais, teclado móvel, leitores de tela, rotação e gestos nativos não foram exercitados.

## Cobertura por categoria

| Categoria | Evidência inspecionada | Resultado |
| --- | --- | --- |
| Tipografia | `theme/tokens.ts`, `Registro.tsx`, `Secao.tsx`, perfis e Conta; screenshots claro/escuro | Hierarquia muito variável confirmada no feed; fonte ampliada pendente |
| Superfícies | `Tela.tsx`, `Secao.tsx`, `Registro.tsx`, dock e filtros; walkthrough | Estrutura compartilhada consistente; densidade excessiva nos perfis e seleção de assuntos |
| Animações | Estados pressed de Botao/Alternar; configuração formSheet | Inspeção estática apenas; movimento a 10% e reduzir movimento não verificados |
| Ícones | `Icone.tsx` e dock, observados no navegador | Biblioteca Feather centralizada; destinos inativos sem rótulo visível confirmado |
| Performance | FlatList dos feeds e perfis; ScrollView de Seguindo | Feed virtualizado; listas longas dentro de cabeçalhos não são virtualizadas por item |

## Achados e sugestões

As linhas referem-se ao código inspecionado nesta data. HIGH indica comportamento enganoso ou sem feedback recuperável; MEDIUM, problema perceptível de uso ou consistência. Riscos de layout não reproduzidos estão identificados como tal.

### Feedback e confiança

| Severidade | Localização | Antes | Depois proposto | Por quê |
| --- | --- | --- | --- | --- |
| HIGH | `apps/mobile/src/components/LinhaDeAlvo.tsx:25`, `:50`; `apps/mobile/src/app/(abas)/seguindo.tsx:32`, `:64`; `apps/mobile/src/api/consultas.ts:91` | Cada linha usa sua própria mutation. Em falha, há rollback, mas a linha não mostra erro. O erro da mutation da tela Seguindo cobre Desfazer, não a mutation da linha. O aviso de deixar de seguir é acionado antes da resposta. | Propagar erro e resultado da ação da linha; avisar quando não foi salvo. Se o aviso for otimista, retirá-lo ou corrigi-lo no rollback. | Feedback: a pessoa pode ver “Você deixou de seguir” mesmo após a ação ter falhado. Busca reutiliza a mesma linha sem aviso de falha. |
| MEDIUM | `apps/mobile/src/api/consultas.ts:256`; `apps/mobile/src/app/(abas)/busca.tsx:68` | A busca preserva resultados anteriores com placeholderData; “Buscando…” só aparece quando não há dados. | Mostrar “Atualizando resultados…” durante nova consulta e associar resultados ao termo efetivamente respondido. Anunciar a atualização de forma discreta. | Visibilidade do estado: resultados de outra consulta podem parecer definitivos para o termo recém-digitado. |
| MEDIUM | `apps/mobile/src/app/(abas)/conta.tsx:192`, `:229`; `apps/mobile/src/api/consultas.ts:128` | Estado local muda antes do sucesso do PATCH; as preferências remotas só mudam no sucesso. Controles não indicam persistência em andamento. | Atualizar o estado local após confirmação ou fazer atualização otimista com rollback. Serializar/bloquear operações conflitantes e mostrar retorno de salvamento. | Consistência: em falha, sugestões locais e preferência da conta podem divergir. Toques rápidos merecem teste com rede lenta. |
| MEDIUM | `apps/mobile/src/components/Estado.tsx:29`; retornos de erro em `app/pessoa/[id].tsx`, `app/partido/[id].tsx`, `app/proposta/[id].tsx`, `app/evento/[id].tsx` | A falha substitui a tela pelo componente genérico com apenas Tentar de novo; os controles próprios de Voltar/Fechar não são renderizados. | Manter a estrutura da tela e saída explícita durante carregamento e erro; distinguir registro indisponível de falha temporária. | Recuperação: sem gestos ou histórico do navegador, sair da falha fica menos evidente. Validar especialmente o painel de detalhe. |

### Navegação e descoberta

| Severidade | Localização | Antes | Depois proposto | Por quê |
| --- | --- | --- | --- | --- |
| MEDIUM | `apps/mobile/src/app/(abas)/_layout.tsx:55`, `:96` | Só a aba ativa tem texto; as demais mostram ícones. Os itens têm altura fixa de 48. | Testar dock com rótulos persistentes e distribuição estável. Validar 320/375/390 px e fonte ampliada antes de escolher a composição final. | Reconhecimento: bússola, grade e usuários exigem aprendizado. O código garante nome acessível, mas não descoberta visual. Fonte grande pode exigir maior altura. |
| MEDIUM | `apps/mobile/src/feed/TelaFeed.tsx:147`, `:156`; `apps/mobile/src/perfis/LinhaDoTempo.tsx:50` | A mesma aparência de aba sublinhada representa múltipla seleção no feed e seleção única nos perfis. | Usar chips com marca de seleção para filtros múltiplos; manter abas para seleção única. Tornar “Limpar” acessível perto do resumo de filtros ativos. | Consistência de interação: componentes visualmente iguais ensinam comportamentos diferentes. |
| MEDIUM | `apps/mobile/src/app/pessoa/[id].tsx:81`; `apps/mobile/src/app/partido/[id].tsx:103`; `apps/mobile/src/perfis/LinhaDoTempo.tsx:43` | Mandatos, filiações, gastos, doadores e candidaturas vêm antes da atividade. No perfil de Duda Salabert a linha do tempo começa em y=2052 px, com viewport de 812 px. Partido lista todos os parlamentares antes da linha do tempo. | Identidade + resumo curto + atividade recente no início; dados extensos em seções recolhíveis ou destinos próprios. | Hierarquia e performance: encontrar atos recentes exige atravessar inventário de dados. Arrays dentro do cabeçalho são renderizados integralmente. |
| MEDIUM | `apps/mobile/src/app/onboarding/index.tsx:48`, `:93`; `apps/mobile/src/app/onboarding/seguir.tsx`; `apps/mobile/src/app/onboarding/assuntos.tsx` | Lista de 27 estados; 56 parlamentares para MG; 125 assuntos em lista alfabética sem busca. Temas próximos aparecem separados, como Educação/Educação Básica/Educação Superior e Meio Ambiente/Meio Ambiente e Desenvolvimento Sustentável. | Seleção pesquisável de estado e parlamentar; assuntos por grupos simples com expansão para os termos oficiais. Manter identificadores e fontes de cada tema. Mostrar contagem de selecionados e permitir pular. | Primeiro uso: esforço de classificação e rolagem alto antes de experimentar o feed. As listas e a ausência de busca foram confirmadas visualmente. |

### Hierarquia visual e adaptação

| Severidade | Localização | Antes | Depois proposto | Por quê |
| --- | --- | --- | --- | --- |
| MEDIUM | `apps/mobile/src/components/Registro.tsx:94`, `:128`, `:181`; `apps/mobile/src/theme/tokens.ts:143` | Manchete usa 30 px serifada quando não há pessoa e 16 px sem serifa quando há; metadados de coleta e protocolo aparecem em todos os registros. A diferença é evidente em cards consecutivos de pauta no Feed e em Navegar. Há sobrescritas locais de tipografia. | Definir variantes explícitas de manchete por função e limitar diferença de destaque. Manter fonte/data visíveis e experimentar levar protocolo e coleta detalhada ao detalhe. | Hierarquia: ausência de pessoa produz muito mais destaque visual sem comunicar necessariamente maior importância do fato. |
| MEDIUM | `apps/mobile/src/app/(abas)/conta.tsx:448`, `:454`; `apps/mobile/src/components/Registro.tsx:114`; `apps/mobile/src/components/Secao.tsx` | Conta usa linhas horizontais sem breakpoint; tema distribui três rótulos em uma linha. Valores do feed podem encolher até 60%. | Empilhar rótulo e controle conforme largura/fonte; permitir maior altura e quebra dos valores. Testar valores monetários longos e 200% de fonte. | Adaptação: risco de compressão e leitura pequena. O estouro não foi reproduzido em navegador móvel nesta rodada. |
| MEDIUM | `apps/mobile/src/app/_layout.tsx:25`, `:29` | O app retorna null até carregar fontes e não trata o erro retornado pelo hook. | Tratar falha de fontes e permitir interface com fonte alternativa; mostrar estado de inicialização enquanto necessário. | Resiliência visual: falha de um recurso tipográfico pode manter a aplicação sem interface. |
| MEDIUM | `apps/mobile/src/app/(abas)/busca.tsx:100`; `apps/mobile/src/api/consultas.ts` (`useBusca`) | A contagem é a soma dos itens devolvidos, com limites por grupo; o rótulo diz apenas “N resultados”. | Escrever “N resultados exibidos”, ou consumir total real da API quando disponível. Explicar o limite ao expandir um grupo. | Clareza: amostra limitada pode ser interpretada como total completo. |

### Compreensão dos dados

| Severidade | Localização | Antes | Depois proposto | Por quê |
| --- | --- | --- | --- | --- |
| HIGH | `apps/mobile/src/feed/RegistroDoEvento.tsx:66`; `apps/mobile/src/app/proposta/[id].tsx` (resultado da votação) | O card PLP 281/2019 destaca “Resultado: Rejeitada”, mas o resumo descreve a rejeição de uma subemenda. Na proposta, a situação segue “Aguardando Deliberação”. O título “Votação nominal” também aparece num registro cujo voto é secreto, embora o detalhe da proposta distinga nominal e simbólica. | Identificar explicitamente o objeto da votação: “Subemenda rejeitada”, “Requerimento rejeitado” ou “Projeto aprovado”, conforme informação oficial disponível. Usar resultado genérico acompanhado de contexto quando a classificação não for segura. Revisar o rótulo de votação secreta. | Precisão e confiança: o destaque pode ser entendido como rejeição da proposta inteira. Não derivar resultado global do projeto a partir de uma votação de etapa. Exemplos confirmados na interface; exatidão do dado de origem não foi auditada. |
| MEDIUM | `apps/mobile/src/feed/TelaFeed.tsx:165`, `:167` | Em 23/10, o feed começa em 15/10. Há datas nos registros, mas não há resumo online da cobertura ou da última coleta bem-sucedida. O aviso de cache usa data de atualização da consulta, que não informa a atualidade da fonte. | Exibir cobertura/última coleta por fonte e aviso contextual quando estiver fora do prazo. Diferenciar “consulta atualizada agora” de “dados da fonte coletados em...”. Se faltar informação da API, apresentar apenas o que pode ser confirmado. | Transparência temporal: sem atualização visível, a pessoa não distingue ausência de novos atos de coleta interrompida. A defasagem observada é local e não prova um defeito da futura operação em produção. |

## Walkthrough executado

1. Onboarding: escolha de Minas Gerais; seleção de uma parlamentar e Educação; contagem de 125 temas; conclusão com “Agora não” nos avisos. Conta de revisão anônima criada pela própria aplicação local.
2. Feed: lista real, filtro Votos, card de votação, detalhe com data, fonte, regra e envolvidos. Valores de voto e resultado legíveis em 375 px; cor acompanhada de texto/ícone nos cards.
3. Perfis: pessoa e partido abertos pelos links. Medida de posição da linha do tempo no DOM e inspeção de identidade, gastos e campanha. Nomes de cargo variam entre os dados do feed e os de perfil, incluindo “Dep. federal”, “Deputada Federal” e “Deputado Federal”; recomenda-se revisão editorial dentro da padronização tipográfica, preservando os dados oficiais.
4. Proposta: PLP 281/2019, situação, autor, temas, cronologia, placar e links para documentos. Formulário de reporte aberto e cancelado; nenhum reporte enviado.
5. Busca: consulta “Duda” com 5 itens e “Ver mais pessoas”; consulta sem correspondência mostrou mensagem de vazio. Falha com rede lenta não foi provocada.
6. Seguindo: pessoa e assunto agrupados; deixar de seguir Educação e Desfazer funcionaram no caminho de sucesso. O problema de falha/rollback permanece identificado no código, sem reprodução forçada nesta sessão.
7. Conta: inspeção em 375, 320 e 390 px; tema claro e escuro; página de erratas aberta. Em 320 px os rótulos de ajuste quebram mais linhas e a composição fica apertada; não foi demonstrado estouro horizontal geral. Nenhuma conta excluída, login externo feito ou permissão de push concedida.
8. Navegar: feed geral em tema claro; filtros por assunto abertos, Educação selecionado, filtros limpos e painel fechado.

O contraste percebido e a coerência das superfícies são bons nas telas vistas. Isso não substitui medição WCAG nem teste nativo. A web é ferramenta de inspeção do mobile; o roadmap reserva o produto web para depois do MVP.

### Evidências

- [Feed com votos, 375 px](evidencias-ux-2026-10-23/feed-votos-375.png)
- [Perfil, 375 px](evidencias-ux-2026-10-23/perfil-375.png)
- [Conta, 320 px](evidencias-ux-2026-10-23/conta-320.png)

## Ordem de trabalho sugerida

1. Corrigir feedback de seguir/desfazer, estado da busca e sincronização de preferências. São melhorias pequenas que afetam confiança.
2. Padronizar semântica de filtros e testar nomes persistentes na navegação.
3. Reorganizar perfis ao redor de atividade recente e divulgação progressiva de detalhes.
4. Validar densidade tipográfica, fonte ampliada, teclado e limites de largura em telas reais.

Não há necessidade de contratar ferramenta ou publicar o sistema para executar essas melhorias localmente. As sugestões preservam o sistema de tokens e os componentes existentes.

## Alternativas consideradas e descartadas

| Local | Alternativa | Motivo para descartar |
| --- | --- | --- |
| `theme/tokens.ts` | Substituir a identidade por cores fortes e cartões genéricos | A identidade editorial já é coerente; as principais dificuldades são de hierarquia e interação. |
| `components/Registro.tsx` | Uniformizar tudo como cartão arredondado | A distinção entre publicação com pessoa e registro institucional é intencional; primeiro avaliar a hierarquia, sem apagar a linguagem visual. |
| `components/Icone.tsx` | Adicionar outra biblioteca de ícones | Feather já está centralizada. Mais uma biblioteca aumentaria a despadronização. |
| `components/Botao.tsx` | Adicionar animações de entrada e pressionamento mais chamativas | Não resolve os problemas encontrados; feedback claro e estabilidade têm precedência. |

## Verificação

- `docker desktop start`: executado; API e PostgreSQL existentes iniciaram e ficaram saudáveis.
- `curl.exe --max-time 5 -s http://127.0.0.1:3000/health`: retornou status ok.
- `node node_modules/expo/bin/cli start --web --port 8081`, dentro de `apps/mobile`: Metro iniciou e bundle web compilou. Navegador abriu o estado de erro de conexão; endereço configurado da API está desatualizado. Expo foi interrompido na tentativa de corrigir o endereço temporariamente.
- `node node_modules/eslint/bin/eslint.js .`, dentro de `apps/mobile`: passou, sem saída.
- `node apps/mobile/node_modules/typescript/bin/tsc --noEmit -p apps/mobile/tsconfig.json`, na raiz: passou, sem saída.
- `node node_modules/jest/bin/jest.js src/theme/__tests__/tokens.test.ts --runInBand`, dentro de `apps/mobile`: não executou testes; setup falhou ao resolver `@babel/runtime/helpers/interopRequireDefault`. Não atribuir essa falha à paleta.
- O primeiro comando via pnpm acionou verificação de dependências e abortou por ausência de TTY; os comandos seguintes usaram as instalações existentes diretamente. Não foi feita reinstalação.
- Retomada: compose completo iniciado com sucesso; configuração temporária da API em localhost permitiu o walkthrough descrito acima. Claro/escuro e larguras 320/375/390 foram inspecionados na cobertura indicada, sem implicar todas as telas em todas as combinações.
- Não verificado: desktop como produto, fonte ampliada, contraste calculado nesta rodada, auditoria completa de foco/teclado, leitor de tela, offline real, 429 visual, falhas de mutation provocadas, motion a 10%, reduzir movimento e Android/iOS nativos.

**Parecer: Block para aprovação desta revisão**, pelo feedback enganoso de seguir/desfazer identificado no código e pela ambiguidade do resultado da votação confirmada na interface. Isso não é conclusão sobre segurança ou prontidão geral do produto. O walkthrough web foi concluído para o percurso descrito; os checks listados como não verificados permanecem pendentes.

## Implementação das melhorias — 23/10/2026

Implementação após autorização do usuário, preservando Expo Router, StyleSheet, paletas, Inter/Instrument Serif, Feather e a distinção entre publicações e cartões institucionais. Sem novas dependências, alterações de banco ou publicação.

| Prioridade / achado | Implementação | Local principal |
| --- | --- | --- |
| HIGH — resultado da votação | Subemenda, emenda, requerimento, substitutivo ou projeto só são nomeados se explícitos no início da descrição. Fallback “Nesta votação”; voto secreto recebe etiqueta própria. Resultado de etapa não altera situação da proposta. | `src/propostas/resultado.ts`, `src/feed/RegistroDoEvento.tsx`, detalhe de evento e proposta |
| HIGH — seguir/desfazer | Mutation de gestão mantida na tela mesmo quando a linha sai; sucesso só após confirmação; erro com rollback visível. Desfazer só fecha o aviso após sucesso. Rollback por alvo preserva outras escolhas em andamento. | `src/api/consultas.ts`, `src/components/LinhaDeAlvo.tsx`, `src/app/(abas)/seguindo.tsx` |
| Busca em andamento | “Atualizando resultados…”; contagem identifica termo dos dados exibidos. | `src/app/(abas)/busca.tsx` |
| Preferências | Estado local atualizado apenas após sucesso do PATCH; bloqueio de mudanças concorrentes na Conta; retorno de salvamento e erro. Remoção do token de push após confirmação de desligamento. | `src/api/consultas.ts`, `src/app/(abas)/conta.tsx` |
| Recuperação | Voltar/Fechar permanecem nos estados de carga e falha de perfis, proposta e evento. | `src/components/Estado.tsx` e quatro telas empilhadas |
| Navegação | Cinco rótulos persistentes, larguras estáveis, altura flexível e reserva inferior ampliada. | `src/app/(abas)/_layout.tsx`, `src/components/Tela.tsx`, `src/theme/tokens.ts` |
| Filtros | Categorias multisseleção com marca de seleção; resumo e Limpar acessíveis sem abrir assuntos. Perfis mantêm abas de seleção única. | `src/feed/TelaFeed.tsx` |
| Perfis | Informações extensas recolhidas por padrão e montadas sob demanda. Identidade seguida de atividade. No mesmo perfil de Duda Salabert, linha do tempo passou de y=2052 para y=270 em 375×812. | `src/components/Detalhes.tsx`, perfis de pessoa e partido |
| Onboarding | Busca local sem acentos em estado, parlamentar e assunto; 12 temas com mais propostas mais os selecionados inicialmente, opção de ver todos, contagem de escolhas; navegação aguarda salvamento. Não houve fusão de temas oficiais. | `src/components/CampoBusca.tsx`, `src/comum/busca.ts`, três passos iniciais |
| Hierarquia dos registros | Manchete institucional reduzida de 30 para 23, preservando serifa; fonte/data permanecem no feed. Protocolo e coleta detalhada permanecem no detalhe. | `src/components/Registro.tsx`, `src/theme/tokens.ts` |
| Adaptação | Dados e ajustes empilham em largura menor que 360 ou fonte ampliada; seletor de tema adapta a composição. Valores deixam de encolher até 60%; caixas de fatos empilham para valores longos, tela estreita ou fonte ampliada. | `src/components/Registro.tsx`, `src/components/Secao.tsx`, Conta |
| Fontes | Inicialização visível; falha apresenta texto na fonte do sistema e Tentar novamente, em vez de tela vazia. Adaptação da proposta original: mantém carregamento das fontes do produto antes de entrar, com recuperação explícita, sem prometer substituição de todas as fontes/ícones dentro do app. | `src/app/_layout.tsx` |
| Contagem de busca | “Resultados exibidos”, com termo e grupo, sem confundir limite de resposta com total existente. | `src/app/(abas)/busca.tsx` |
| Atualidade | “Sobre os dados exibidos” mostra coleta mais recente por fonte entre os registros carregados. Explica o limite da informação. A API atual não fornece última sincronização completa: aviso global de fonte atrasada permanece pendente de contrato próprio, não foi inferido a partir do horário da consulta. | `src/feed/TelaFeed.tsx` |

### Verificação da implementação

- `node node_modules/eslint/bin/eslint.js .` em `apps/mobile`: passou.
- `node node_modules/typescript/bin/tsc --noEmit` em `apps/mobile`: passou.
- `node node_modules/jest/bin/jest.js --runInBand --modulePaths C:/vida-publica/node_modules/.pnpm/node_modules --testPathIgnorePatterns __conferencia__`: **16 suítes e 130 testes passaram**. A opção modulePaths permite resolver dependências transitivas já presentes nesta instalação pnpm; não foram instalados pacotes nem alterado o lockfile. Os testes de conferência contra a base real não foram executados.
- Após os últimos ajustes de onboarding e componente de seguir: suítes de onboarding e busca/conta repetidas, **22 testes passaram**. Lint, TypeScript e `git diff --check` passaram no estado final.
- Regressões novas: rejeição de seguir com retorno correto; preferência recusada sem divergência local; consulta pendente com dados anteriores identificados; classificação conservadora do objeto da votação.
- Testes de paleta/contraste e auditoria automática de acessibilidade incluídos na suíte. Avisos do ambiente de testes: expo-notifications sobre Expo Go e avisos ocasionais de `act`; não houve falha de teste.
- Expo web compilou e foi percorrido com API real: filtros e detalhe de voto; perfil recolhido e expansão; onboarding completo com pesquisa sem acento; Conta claro/escuro em 320 px e telas principais em 375 px. Console do navegador sem erros na inspeção.
- Evidências de implementação: [perfil de Duda, 375 px](evidencias-ux-2026-10-23/depois/perfil-duda-375.png), [votação, 375 px](evidencias-ux-2026-10-23/depois/feed-votos-375.png), [busca de assuntos](evidencias-ux-2026-10-23/depois/busca-assuntos-375.png), [Conta clara, 320 px](evidencias-ux-2026-10-23/depois/conta-claro-320.png).
- Tipografia/superfícies/ícones conferidos nas telas citadas. Sem animações novas; motion a 10% não exercitado. Sem novas medições de performance em aparelho. Android/iOS reais, fonte do sistema em 200%, teclado móvel e leitor de tela continuam **não verificados**.

**Parecer da implementação: Needs changes para encerrar toda a validação pré-lançamento**, pelas verificações nativas ainda pendentes e pela ausência de contrato de atualização global das fontes. Os dois achados HIGH desta revisão foram tratados e os cenários de regressão executados passaram. Esse parecer não é autorização nem impedimento automático de deploy.

Referência consultada antes de tocar APIs: [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/) e [expo-font SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/font/).

## Validação Android e ajustes — 23/10/2026

Walkthrough no aparelho conectado do usuário: **Motorola moto g54 5G, Android 15**, development build com Metro e API locais. A fonte do sistema foi ampliada para **200%**; houve também uma conferência básica do feed em 150% e retorno a 100%. Esta rodada substitui a pendência de validação Android, fonte ampliada e teclado nos percursos abaixo; as limitações das revisões anteriores continuam valendo para os demais cenários.

### Problemas encontrados e corrigidos

| Prioridade / local | Antes no aparelho | Ajuste e resultado |
| --- | --- | --- |
| Alta — `components/Tela.tsx`, dock e novo `comum/useTecladoAberto.ts` | Conteúdo da Busca continuava atrás do teclado. | Área de conteúdo acompanha o teclado, dock se oculta enquanto há digitação e volta ao fechar. Rolagem Android mantém teclado aberto. Campo e ações do reporte acessíveis com fonte a 200%. |
| Média — `app/(abas)/_layout.tsx` | “Navegar” e “Seguindo” quebravam no meio das palavras com fonte a 200%. | Destinos passam a múltiplas linhas acima de 130% de fonte, mantendo os cinco nomes completos, ícones e estado ativo. Sem limitar a ampliação do texto. |
| Média — `components/LinhaDeAlvo.tsx`, `app/onboarding/seguir.tsx` | Botões de seguir espremiam nome, partido e crédito da foto. | Linhas passam a empilhar ou permitir quebra do botão com fonte ampliada. Partido REPUBLICANOS ficou legível sem separação artificial. |
| Média — `components/Tela.tsx`, `components/Botao.tsx`, `components/Alternar.tsx` | Ações longas e chips tinham pouco espaço; rodapés disputavam largura. | Rodapé empilhado e botões ocupando a largura disponível com fonte ampliada; respiro vertical e quebra de rótulos. Conferido novamente no reporte com teclado aberto após o último ajuste. |
| Baixa — perfil de pessoa e busca de assuntos | Foto ficava alinhada ao fim de um crédito longo; placeholder de assuntos truncava. | Identidade alinhada ao topo com fonte ampliada e placeholder curto “Nome do assunto”. Mantidas fontes, cores, ícones e foto 3×4. |

### Percursos exercitados

- Busca com teclado aberto, digitação e resposta da API; fechar teclado pelo botão do Android restaura o dock.
- Busca → perfil de Duda Salabert → registro → proposta, retornando pelo botão do Android.
- Detalhes e formulário “Reportar erro” com fonte a 200%: foco, digitação de texto sintético, rolagem mantendo o teclado, Cancelar e Enviar visíveis acima dele. Nenhum reporte foi enviado.
- Conta: temas, avisos, limites, horário de silêncio e ações inferiores legíveis com fonte a 200%.
- Onboarding completo: pesquisa de estado com teclado, lista de parlamentares, assuntos e escolha de avisos. Mantidas as escolhas existentes: MG, três pessoas e dois assuntos; avisos continuaram ligados.
- Ao terminar, fonte do sistema **restaurada para 1.0 (100%)**, feed conferido novamente e serviços deixados rodando para teste do usuário. Não foram excluídas contas nem alteradas escolhas de seguir durante esta rodada.

### Evidências e checks

- Dock: [antes em 200%](evidencias-ux-2026-10-23/android/fonte-200-antes.png) e [depois em 200%](evidencias-ux-2026-10-23/android/dock-200-depois.png).
- Onboarding: [antes](evidencias-ux-2026-10-23/android/pessoas-onboarding-antes.png) e [depois](evidencias-ux-2026-10-23/android/pessoas-onboarding-depois.png).
- [Reporte com fonte a 200%, campo preenchido e teclado aberto](evidencias-ux-2026-10-23/android/reporte-teclado-final-200.png); [Conta em 200%](evidencias-ux-2026-10-23/android/conta-200.png); [feed em 100%](evidencias-ux-2026-10-23/android/final-100.png).
- Suíte completa durante os ajustes: **16 suítes, 130 testes passaram**. Após os ajustes finais de onboarding/rodapé, suítes de onboarding, busca/conta e erratas: **25 testes passaram**. Lint e TypeScript passaram; a última alteração de rolagem/rodapé teve nova conferência nativa, lint e TypeScript.
- API local e ponte de acesso na rede retornaram `status: ok`. Metro permanece na porta 8081; configuração local da API usa a ponte na porta 3003.
- Fora da cobertura: iOS real, TalkBack, rotação, ampliação da interface separada da fonte, medição de performance e entrega de push. A validação desta rodada não equivale à homologação completa de lançamento.

Referências de API: [Keyboard no React Native 0.86](https://reactnative.dev/docs/0.86/keyboard) e [KeyboardAvoidingView](https://reactnative.dev/docs/0.86/keyboardavoidingview).

## TalkBack e organização da Conta — 23/10/2026

Revisão `full` do escopo solicitado: navegação inferior e controles da Conta no Motorola g54, Android 15, **TalkBack 17.0.1**. React Native 0.86 / Expo 57, StyleSheet e tokens existentes. A inspeção visual cobriu fonte a 100% e 200%, conta anônima, tema escuro e seletores de estado/fuso. A navegação assistiva efetivamente conferida usou Tab, setas e Enter enviados por ADB, com TalkBack ativo e sua opção “Mostrar saída de voz”. As capturas registram a transcrição produzida pelo próprio leitor; não houve escuta do áudio. Os gestos de deslizar e duplo toque injetados por ADB não se comportaram consistentemente, portanto sua homologação permanece pendente.

| Categoria | Evidência inspecionada | Resultado |
| --- | --- | --- |
| Tipografia | Conta, rótulos, quantidade/horários, temas e privacidade em 100%/200% | Largura dos controles e composição dos temas ajustadas. |
| Superfícies | Seções da Conta, separadores, botões e espaço do dock | Espaçamento e foco encoberto corrigidos. |
| Animações | Feedback existente; nenhuma animação adicionada | Motion a 10% não exercitado no Android. |
| Ícones | Feather decorativos nos temas e dock; transcrição das opções | Mantidos sem adicionar nomes de glifos à leitura observada. |
| Performance | Alterações de composição com controles existentes | Sem nova dependência; não houve perfil de performance no aparelho. |

### Correções

| Severidade | Local | Antes | Depois | Motivo |
| --- | --- | --- | --- | --- |
| Alta | `src/app/(abas)/_layout.tsx:86`, `src/components/Tela.tsx:113`, `src/feed/TelaFeed.tsx:298` | Dock absoluto cobria o controle para o qual o Android rolava ao mover o foco. | Dock ocupa sua própria área no layout, conservando a cápsula e a sombra. Reservas artificiais de rolagem removidas. Foco e conteúdo terminam acima do menu. | Controle focado precisa continuar visível; padding ao fim da lista não protege controles intermediários. |
| Média | `src/components/Secao.tsx:124`, `src/app/(abas)/conta.tsx:471` | Seções colocavam botões e linhas consecutivos sem respiro, com ajustes encostados. | Opção `espacada` aplicada às seções de formulário da Conta, espaço entre filhos, padding vertical e divisórias nas linhas. Sem mudar a densidade dos registros do feed. | Separação visual e alvos de toque distinguíveis. |
| Média | `src/app/(abas)/conta.tsx:478`, `src/app/(abas)/conta.tsx:480`, `src/app/(abas)/conta.tsx:483` | Ajustes comprimiam rótulos; botões de privacidade tinham larguras distintas; flex dos temas empilhados era inadequado. | Linhas empilham abaixo de 400 pt ou fonte ampliada, botões de ajuste usam padding menor preservando alvo mínimo, valores podem acomodar a largura, ações de privacidade e seletores usam largura disponível; temas empilhados têm altura intrínseca e respiro. | Hierarquia, legibilidade e consistência em 200%. |
| Média | `src/components/Botao.tsx:53`, `src/app/(abas)/conta.tsx:225`, `src/app/(abas)/conta.tsx:304`, `src/app/(abas)/conta.tsx:459` | “Fechar” não identificava o seletor; abrir/recolher não tinha estado acessível; ações de mais/menos não informavam o valor atual no próprio foco. | “Fechar estados” / “Fechar fusos”, `aria-expanded` e dica com valor atual e tamanho do incremento. | A leitura deve informar contexto e consequência sem exigir foco em outro elemento. |

### Evidência nativa

- Temas: TalkBack anunciou “Tema claro. Botão de opção” e “selecionado. Tema escuro. Botão de opção”.
- Avisos e resumo: nomes completos, papel de interruptor e estado ativado confirmados na transcrição. Nenhuma chave foi alternada neste teste.
- Quantidade: “Aumentar máximo por dia. Botão. Valor atual: 5. Mais 1”. Horários também informaram valor e passo. Navegação com setas acionou a rolagem para revelar o controle acima do dock.
- Fuso: abertura por Enter anunciou “expandido. Fechar fusos. Botão”; seta para baixo alcançou “Fernando de Noronha (UTC−2). Botão de opção”. Retorno ao botão e fechamento sem selecionar outro fuso.
- Hierarquia nativa conferida: switches e botões de ajuste expostos, habilitados e focáveis com nomes específicos; ícones decorativos não receberam foco nos controles percorridos.
- Conta percorrida visualmente até Correções e Privacidade em 200%, com ações separadas e legíveis. Valores e preferências mantidos: MG, máximo 5, silêncio 22:00–07:00, fuso Brasília/São Paulo, avisos e resumo ligados, tema escuro.
- [Conta antes](evidencias-ux-2026-10-23/talkback-conta/conta-real-antes.png), [ajustes depois em 100%](evidencias-ux-2026-10-23/talkback-conta/conta-100-ajustes-final.png), [avisos em 200%](evidencias-ux-2026-10-23/talkback-conta/conta-200-avisos.png), [privacidade em 200%](evidencias-ux-2026-10-23/talkback-conta/conta-200-privacidade.png).
- Transcrições: [switch](evidencias-ux-2026-10-23/talkback-conta/chave.png), [valor do ajuste](evidencias-ux-2026-10-23/talkback-conta/ajuste-leitura-2.png), [seletor aberto](evidencias-ux-2026-10-23/talkback-conta/fusos-abertos.png), [opção de fuso](evidencias-ux-2026-10-23/talkback-conta/fuso-opcao.png).

### Verificação e limites

- Lint e TypeScript passaram. Suíte completa, com o mesmo comando e modulePaths documentados acima: **16 suítes e 130 testes passaram**. `git diff --check` passou.
- Após a mudança do dock, Busca com teclado nativo novamente conferida: campo visível, conteúdo acima do teclado e menu oculto; botão Voltar fecha o teclado e devolve o menu. [Captura da regressão de teclado](evidencias-ux-2026-10-23/talkback-conta/teclado-regressao.png).
- Fonte restaurada para **1.0**, TalkBack desligado como estava originalmente, lista de serviços de acessibilidade restaurada para ausente e “Mostrar saída de voz” devolvido a desligado. Serviços do aplicativo mantidos em execução.
- Alternativas descartadas: limitar tamanho da fonte esconderia o problema para quem precisa ampliar; reconstruir a Conta com outra biblioteca apagaria a identidade e adicionaria dependência; manter dock absoluto com mais padding não resolveria foco em controles intermediários.
- **Parecer: Needs changes para homologação completa de acessibilidade**, pela cobertura ainda parcial. Os problemas reproduzidos e listados acima foram corrigidos. Permanecem não verificados: gestos físicos de exploração/duplo toque, leitura contínua de todas as telas e textos, pronúncia pelo áudio, recuperação de foco de todos os fluxos, teclado braille e VoiceOver. Esta rodada valida os controles e percursos descritos, sem declarar acessibilidade integral do produto.

Referências: [acessibilidade no React Native 0.86](https://reactnative.dev/docs/0.86/accessibility) e [atalhos do TalkBack](https://support.google.com/accessibility/android/answer/6110948?hl=pt-BR).

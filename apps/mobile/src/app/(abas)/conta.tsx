import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { useConta, useSalvarPreferencias } from '../../api/consultas';
import { ErroApi, mensagemDeErro } from '../../api/erros';
import { FUSOS, UFS, type Preferencias, type Uf } from '../../api/tipos';
import { dataCurta } from '../../comum/formato';
import { Alternar } from '../../components/Alternar';
import { Botao } from '../../components/Botao';
import { Carregando, Falha } from '../../components/Estado';
import { LinkTexto, Secao } from '../../components/Secao';
import { Tela } from '../../components/Tela';
import { appleDisponivel, entrar, googleDisponivel, LoginCancelado, type Provedor } from '../../conta/login';
import { esquecerAparelho } from '../../notificacoes/aparelho';
import { pedirPermissaoDoSistema } from '../../notificacoes/permissao';
import { persistidor } from '../../offline/cache';
import { NOME_ESTADO } from '../../onboarding/estados';
import { useSessao } from '../../sessao/Sessao';
import { ESTADO_INICIAL } from '../../sessao/local';
import { radius, space, toque, typography } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

const NOME_PROVEDOR: Record<Provedor, string> = { apple: 'Apple', google: 'Google' };

/** Fusos do Brasil pela cidade de referência. */
const NOME_FUSO: Record<(typeof FUSOS)[number], string> = {
  'America/Noronha': 'Fernando de Noronha (UTC−2)',
  'America/Sao_Paulo': 'Brasília, São Paulo (UTC−3)',
  'America/Bahia': 'Salvador (UTC−3)',
  'America/Fortaleza': 'Fortaleza (UTC−3)',
  'America/Recife': 'Recife (UTC−3)',
  'America/Maceio': 'Maceió (UTC−3)',
  'America/Belem': 'Belém (UTC−3)',
  'America/Araguaina': 'Araguaína (UTC−3)',
  'America/Santarem': 'Santarém (UTC−3)',
  'America/Manaus': 'Manaus (UTC−4)',
  'America/Cuiaba': 'Cuiabá (UTC−4)',
  'America/Campo_Grande': 'Campo Grande (UTC−4)',
  'America/Porto_Velho': 'Porto Velho (UTC−4)',
  'America/Boa_Vista': 'Boa Vista (UTC−4)',
  'America/Rio_Branco': 'Rio Branco (UTC−5)',
  'America/Eirunepe': 'Eirunepé (UTC−5)',
};

/** "22:00" mais ou menos uma hora. */
function somarHora(hhmm: string, delta: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  return `${String((h + delta + 24) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export default function ContaTela() {
  const conta = useConta();
  if (conta.isPending) return <Carregando rotulo="Carregando a conta" />;
  if (conta.isError) return <Falha mensagem={mensagemDeErro(conta.error)} aoTentar={() => void conta.refetch()} />;

  const c = conta.data;
  return (
    <Tela comBarra titulo="Conta" descricao="Preferências deste aparelho e da sua conta.">
      <SecaoConta anonima={c.anonima} identidades={c.identidades} criadaEm={c.criadaEm} />
      <SecaoPreferencias p={c.preferencias} />
      <SecaoCorrecoes />
      <SecaoPrivacidade anonima={c.anonima} />
    </Tela>
  );
}

function SecaoConta({ anonima, identidades, criadaEm }: { anonima: boolean; identidades: Provedor[]; criadaEm: string }) {
  const theme = useTheme();
  const { cliente } = useSessao();
  const consultas = useQueryClient();
  const [apple, setApple] = useState(false);
  const [ocupado, setOcupado] = useState<Provedor | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    appleDisponivel()
      .then((sim) => ativo && setApple(sim))
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, []);

  const disponiveis = ([apple ? 'apple' : null, googleDisponivel() ? 'google' : null] as (Provedor | null)[]).filter(
    (p): p is Provedor => p !== null && !identidades.includes(p),
  );

  const conectar = async (provedor: Provedor) => {
    setOcupado(provedor);
    setAviso(null);
    try {
      const resultado = await entrar(cliente, provedor);
      await consultas.invalidateQueries();
      setAviso(
        resultado.contaExistente
          ? `Você entrou na sua conta ${NOME_PROVEDOR[provedor]}. O que este aparelho seguia foi juntado a ela.`
          : `Conta ligada ao ${NOME_PROVEDOR[provedor]}. Você pode entrar nela em outro aparelho.`,
      );
    } catch (erro) {
      if (!(erro instanceof LoginCancelado)) setAviso(mensagemDeErro(erro));
    } finally {
      setOcupado(null);
    }
  };

  return (
    <Secao titulo="Sua conta">
      <Text style={[typography.body, { color: theme.ink }]}>
        {anonima
          ? 'Conta anônima deste aparelho: sem nome, sem e-mail.'
          : `Ligada a ${identidades.map((i) => NOME_PROVEDOR[i]).join(' e ')}. O app guarda só um identificador do provedor, nunca nome ou e-mail.`}
      </Text>
      <Text style={[typography.caption, { color: theme.ink2 }]}>Criada em {dataCurta(criadaEm)}.</Text>
      {disponiveis.length ? (
        <>
          <Text style={[typography.caption, { color: theme.ink2 }]}>
            Opcional: entre com um login para levar o que você segue para outro aparelho.
          </Text>
          <View style={styles.linha}>
            {disponiveis.map((p) => (
              <Botao
                key={p}
                variante="secundario"
                rotulo={`Entrar com ${NOME_PROVEDOR[p]}`}
                ocupado={ocupado === p}
                desabilitado={ocupado !== null}
                aoTocar={() => void conectar(p)}
              />
            ))}
          </View>
        </>
      ) : null}
      {aviso ? (
        <Text style={[typography.body, { color: theme.ink }]} aria-live="polite">
          {aviso}
        </Text>
      ) : null}
    </Secao>
  );
}

function SecaoPreferencias({ p }: { p: Preferencias }) {
  const theme = useTheme();
  const { atualizarLocal, cliente } = useSessao();
  const salvar = useSalvarPreferencias();
  const [abrirEstados, setAbrirEstados] = useState(false);
  const [abrirFusos, setAbrirFusos] = useState(false);
  const [semPermissao, setSemPermissao] = useState(false);

  const mudar = (m: Partial<Preferencias>) => salvar.mutate(m);

  const alternarNotificacoes = async () => {
    setSemPermissao(false);
    if (p.notificacoes) {
      // Desligar para o envio (a API deixa de enfileirar) e apaga o token.
      mudar({ notificacoes: false });
      atualizarLocal({ avisos: false });
      void esquecerAparelho(cliente).catch(() => {});
      return;
    }
    const permitido = await pedirPermissaoDoSistema().catch(() => false);
    if (!permitido) return setSemPermissao(true);
    mudar({ notificacoes: true });
    atualizarLocal({ avisos: true });
  };

  return (
    <>
      <Secao titulo="Estado">
        <View style={styles.linhaEntre}>
          <Text style={[typography.body, { color: theme.ink }]}>{p.uf ? NOME_ESTADO[p.uf] : 'Não escolhido'}</Text>
          <Botao variante="texto" rotulo={abrirEstados ? 'Fechar' : 'Mudar estado'} aoTocar={() => setAbrirEstados((a) => !a)} />
        </View>
        {abrirEstados ? (
          <View style={styles.grade} role="radiogroup" aria-label="Estado">
            {[...UFS]
              .sort((a, b) => NOME_ESTADO[a].localeCompare(NOME_ESTADO[b], 'pt-BR'))
              .map((uf: Uf) => (
                <Alternar
                  key={uf}
                  papel="radio"
                  rotulo={NOME_ESTADO[uf]}
                  marcado={p.uf === uf}
                  aoAlternar={() => {
                    mudar({ uf });
                    atualizarLocal({ uf });
                    setAbrirEstados(false);
                  }}
                />
              ))}
          </View>
        ) : null}
      </Secao>

      <Secao titulo="Avisos">
        <Linha rotulo="Avisos do que você segue" detalhe="Votos, pauta, propostas e campanha">
          <Alternar papel="switch" rotulo="Desligados" rotuloMarcado="Ligados" descricao="Avisos do que você segue" marcado={p.notificacoes} aoAlternar={() => void alternarNotificacoes()} />
        </Linha>
        {semPermissao ? (
          <View style={styles.linha} aria-live="polite">
            <Text style={[typography.body, { color: theme.error }]}>O aparelho não permitiu avisos para o app.</Text>
            {Platform.OS !== 'web' ? (
              <Botao variante="texto" rotulo="Abrir ajustes" aoTocar={() => void Linking.openSettings()} />
            ) : null}
          </View>
        ) : null}
        <Linha rotulo="Resumo semanal" detalhe="Dinheiro e despesas da semana">
          <Alternar papel="switch" rotulo="Desligado" rotuloMarcado="Ligado" descricao="Resumo semanal" marcado={p.resumoSemanal} aoAlternar={() => mudar({ resumoSemanal: !p.resumoSemanal })} />
        </Linha>
        <Ajuste
          rotulo="Máximo por dia"
          valor={String(p.maxPorDia)}
          aoDiminuir={p.maxPorDia > 1 ? () => mudar({ maxPorDia: p.maxPorDia - 1 }) : undefined}
          aoAumentar={p.maxPorDia < 20 ? () => mudar({ maxPorDia: p.maxPorDia + 1 }) : undefined}
        />
        <Ajuste
          rotulo="Silêncio a partir de"
          valor={p.silencioInicio}
          passo="1 hora"
          aoDiminuir={() => mudar({ silencioInicio: somarHora(p.silencioInicio, -1) })}
          aoAumentar={() => mudar({ silencioInicio: somarHora(p.silencioInicio, 1) })}
        />
        <Ajuste
          rotulo="Silêncio até"
          valor={p.silencioFim}
          passo="1 hora"
          aoDiminuir={() => mudar({ silencioFim: somarHora(p.silencioFim, -1) })}
          aoAumentar={() => mudar({ silencioFim: somarHora(p.silencioFim, 1) })}
        />
        <View style={styles.linhaEntre}>
          <View style={styles.flex}>
            <Text style={[typography.body, { color: theme.ink }]}>Fuso</Text>
            <Text style={[typography.caption, { color: theme.ink2 }]}>
              {NOME_FUSO[p.fuso as (typeof FUSOS)[number]] ?? p.fuso}
            </Text>
          </View>
          <Botao variante="texto" rotulo={abrirFusos ? 'Fechar' : 'Mudar fuso'} aoTocar={() => setAbrirFusos((a) => !a)} />
        </View>
        {abrirFusos ? (
          <View style={styles.grade} role="radiogroup" aria-label="Fuso">
            {FUSOS.map((f) => (
              <Alternar
                key={f}
                papel="radio"
                rotulo={NOME_FUSO[f]}
                marcado={p.fuso === f}
                aoAlternar={() => {
                  mudar({ fuso: f });
                  setAbrirFusos(false);
                }}
              />
            ))}
          </View>
        ) : null}
        {salvar.isError ? (
          <Text style={[typography.body, { color: theme.error }]} aria-live="assertive">
            {mensagemDeErro(salvar.error)}
          </Text>
        ) : null}
      </Secao>
    </>
  );
}

/** Erratas: o que o Vida Pública corrigiu, com data. */
function SecaoCorrecoes() {
  const theme = useTheme();
  const router = useRouter();
  return (
    <Secao titulo="Correções">
      <Text style={[typography.body, { color: theme.ink2 }]}>
        Achou um erro num registro? Use “Reportar erro” no próprio registro. As correções
        publicadas ficam nas erratas.
      </Text>
      <LinkTexto rotulo="Ver as erratas publicadas" aoTocar={() => router.push('/erratas')} />
    </Secao>
  );
}

function SecaoPrivacidade({ anonima }: { anonima: boolean }) {
  const theme = useTheme();
  const { cliente, atualizarLocal } = useSessao();
  const consultas = useQueryClient();
  const [confirmar, setConfirmar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  /** Esquece a sessão no aparelho e volta ao começo (a próxima chamada abre conta anônima nova). */
  const recomecar = async () => {
    await cliente.esquecer();
    consultas.clear();
    await persistidor.removeClient();
    atualizarLocal(ESTADO_INICIAL);
  };

  const executar = async (acao: () => Promise<unknown>) => {
    setOcupado(true);
    setErro(null);
    try {
      await acao();
      await recomecar();
    } catch (e) {
      // Sessão já encerrada do lado da API: segue o recomeço no aparelho.
      if (e instanceof ErroApi && e.status === 401) await recomecar();
      else setErro(mensagemDeErro(e));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Secao titulo="Privacidade">
      <Botao
        variante="secundario"
        rotulo="Refazer o início"
        dica="Volta às perguntas de estado, quem seguir e assuntos"
        aoTocar={() => atualizarLocal({ onboardingConcluido: false })}
        estilo={styles.inicio}
      />
      {!anonima ? (
        <Botao
          variante="secundario"
          rotulo="Sair deste aparelho"
          dica="A conta continua existindo; este aparelho volta a uma conta anônima"
          ocupado={ocupado && !confirmar}
          aoTocar={() => void executar(() => cliente.post('/auth/sair'))}
          estilo={styles.inicio}
        />
      ) : null}
      {!confirmar ? (
        <Botao
          variante="secundario"
          rotulo="Excluir conta"
          dica="Pede confirmação antes de apagar"
          aoTocar={() => setConfirmar(true)}
          estilo={styles.inicio}
        />
      ) : (
        <View style={[styles.confirmar, { borderColor: theme.error }]} aria-live="polite">
          <Text role="heading" style={[typography.bodyStrong, { color: theme.ink }]}>
            Excluir a conta de forma definitiva?
          </Text>
          <Text style={[typography.body, { color: theme.ink2 }]}>
            Apaga o que você segue, suas preferências, sessões e logins ligados. Não dá para desfazer.
          </Text>
          <View style={styles.linha}>
            <Botao variante="secundario" rotulo="Cancelar" desabilitado={ocupado} aoTocar={() => setConfirmar(false)} />
            <Botao rotulo="Excluir de vez" ocupado={ocupado} aoTocar={() => void executar(() => cliente.delete('/conta'))} />
          </View>
        </View>
      )}
      {erro ? (
        <Text style={[typography.body, { color: theme.error }]} aria-live="assertive">
          {erro}
        </Text>
      ) : null}
    </Secao>
  );
}

function Linha({ rotulo, detalhe, children }: { rotulo: string; detalhe?: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.linhaEntre}>
      <View style={styles.flex}>
        <Text style={[typography.body, { color: theme.ink }]}>{rotulo}</Text>
        {detalhe ? <Text style={[typography.caption, { color: theme.ink2 }]}>{detalhe}</Text> : null}
      </View>
      {children}
    </View>
  );
}

/** Valor com botões de menos e mais (cada um com nome próprio para o leitor de tela). */
function Ajuste({
  rotulo,
  valor,
  passo = '1',
  aoDiminuir,
  aoAumentar,
}: {
  rotulo: string;
  valor: string;
  passo?: string;
  aoDiminuir?: () => void;
  aoAumentar?: () => void;
}) {
  const theme = useTheme();
  return (
    <Linha rotulo={rotulo}>
      <View style={styles.ajuste}>
        <Botao variante="secundario" rotulo="−" descricao={`Diminuir ${rotulo.toLowerCase()}`} dica={`Menos ${passo}`} desabilitado={!aoDiminuir} aoTocar={() => aoDiminuir?.()} />
        <Text style={[typography.data, styles.valor, { color: theme.ink }]} aria-live="polite" aria-label={`${rotulo}: ${valor}`}>
          {valor}
        </Text>
        <Botao variante="secundario" rotulo="+" descricao={`Aumentar ${rotulo.toLowerCase()}`} dica={`Mais ${passo}`} desabilitado={!aoAumentar} aoTocar={() => aoAumentar?.()} />
      </View>
    </Linha>
  );
}

const styles = StyleSheet.create({
  linha: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  linhaEntre: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md, minHeight: toque.minimo },
  flex: { flex: 1 },
  grade: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  ajuste: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  valor: { minWidth: 48, textAlign: 'center' },
  inicio: { alignSelf: 'flex-start' },
  confirmar: { gap: space.sm, padding: space.md, borderWidth: 1, borderRadius: radius.md },
});

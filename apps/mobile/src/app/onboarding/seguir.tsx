import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useEstaSeguindo, useParlamentares, useSeguir } from '../../api/consultas';
import { mensagemDeErro } from '../../api/erros';
import type { Parlamentar } from '../../api/tipos';
import { Alternar } from '../../components/Alternar';
import { Botao } from '../../components/Botao';
import { Carregando, Falha } from '../../components/Estado';
import { FotoOficial } from '../../components/FotoOficial';
import { Tela } from '../../components/Tela';
import { NOME_ESTADO } from '../../onboarding/estados';
import { useSessao } from '../../sessao/Sessao';
import { rules, space, typography } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

/** Passo 2: senadores e deputados federais em exercício no estado. */
export default function QuemSeguir() {
  const theme = useTheme();
  const router = useRouter();
  const { local } = useSessao();
  const parlamentares = useParlamentares(local.uf);
  const estaSeguindo = useEstaSeguindo();
  const seguir = useSeguir();

  if (parlamentares.isPending) return <Carregando rotulo="Buscando quem representa seu estado" />;
  if (parlamentares.isError) {
    return <Falha mensagem={mensagemDeErro(parlamentares.error)} aoTentar={() => void parlamentares.refetch()} />;
  }

  const lista = parlamentares.data;
  const senado = lista.filter((p) => p.casa === 'senado');
  const camara = lista.filter((p) => p.casa === 'camara');
  const quantos = lista.filter((p) => estaSeguindo({ tipo: 'pessoa', id: p.id })).length;

  const item = (p: Parlamentar) => {
    const segue = estaSeguindo({ tipo: 'pessoa', id: p.id });
    const detalhe = [p.cargo, p.partido].filter(Boolean).join(' · ');
    return (
      <View key={p.id} style={[styles.item, { borderBottomColor: theme.rule }]}>
        <FotoOficial foto={p.foto} nome={p.nome} />
        <View style={styles.texto}>
          <Text style={[typography.bodyStrong, { color: theme.ink }]}>{p.nome}</Text>
          <Text style={[typography.caption, { color: theme.ink2 }]}>{detalhe}</Text>
          {p.foto ? (
            <Text style={[typography.dataSmall, { color: theme.ink3 }]}>Foto: {p.foto.credito}</Text>
          ) : null}
        </View>
        <Alternar
          rotulo="Seguir"
          rotuloMarcado="Seguindo"
          descricao={`Seguir ${p.nome}, ${detalhe}`}
          marcado={segue}
          aoAlternar={() =>
            seguir.mutate({ alvo: { tipo: 'pessoa', id: p.id }, seguir: !segue, nome: p.nome, detalhe })
          }
        />
      </View>
    );
  };

  return (
    <Tela
      passo={{ atual: 2, total: 4 }}
      titulo="Quem você quer acompanhar?"
      descricao={`Quem representa ${local.uf ? NOME_ESTADO[local.uf] : 'seu estado'} no Congresso hoje. Você pode mudar depois.`}
      rodape={
        <>
          <Botao rotulo="Voltar" variante="texto" aoTocar={() => router.back()} />
          <Botao
            rotulo={quantos > 0 ? `Continuar (${quantos})` : 'Pular'}
            variante={quantos > 0 ? 'primario' : 'secundario'}
            aoTocar={() => router.push('/onboarding/assuntos')}
          />
        </>
      }
    >
      {seguir.isError ? (
        <Text style={[typography.body, { color: theme.error }]} aria-live="assertive">
          {mensagemDeErro(seguir.error)}
        </Text>
      ) : null}
      <View>
        <Text role="heading" style={[typography.overline, styles.secao, { color: theme.ink2 }]}>
          Senado · {senado.length}
        </Text>
        {senado.map(item)}
      </View>
      <View>
        <Text role="heading" style={[typography.overline, styles.secao, { color: theme.ink2 }]}>
          Câmara dos Deputados · {camara.length}
        </Text>
        {camara.map(item)}
      </View>
    </Tela>
  );
}

const styles = StyleSheet.create({
  secao: { paddingBottom: space.xs },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: rules.hairline,
  },
  texto: { flex: 1, gap: space.xxs },
});

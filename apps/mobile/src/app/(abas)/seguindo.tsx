import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSeguindo, useSeguir, type PedidoSeguir } from '../../api/consultas';
import { mensagemDeErro } from '../../api/erros';
import type { AlvoSeguido, AlvoTipo } from '../../api/tipos';
import { inteiro } from '../../comum/formato';
import { Botao } from '../../components/Botao';
import { Carregando, Falha, Vazio } from '../../components/Estado';
import { LinhaDeAlvo } from '../../components/LinhaDeAlvo';
import { Secao } from '../../components/Secao';
import { Tela } from '../../components/Tela';
import { radius, space, typography } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

/** Limite da API (app.seguindo). */
const LIMITE = 500;

const GRUPOS: { tipo: AlvoTipo; nome: string }[] = [
  { tipo: 'pessoa', nome: 'Pessoas' },
  { tipo: 'partido', nome: 'Partidos' },
  { tipo: 'proposicao', nome: 'Propostas' },
  { tipo: 'assunto', nome: 'Assuntos' },
];

/** Gerenciar o que se segue: agrupado por tipo, deixar de seguir com "Desfazer". */
export default function Seguindo() {
  const theme = useTheme();
  const router = useRouter();
  const seguindo = useSeguindo();
  const seguir = useSeguir();
  const [desfeito, setDesfeito] = useState<PedidoSeguir | null>(null);

  if (seguindo.isPending) return <Carregando rotulo="Carregando o que você segue" />;
  if (seguindo.isError) {
    return <Falha mensagem={mensagemDeErro(seguindo.error)} aoTentar={() => void seguindo.refetch()} />;
  }

  const itens = seguindo.data;
  const deixar = (s: AlvoSeguido) =>
    setDesfeito({ alvo: { tipo: s.tipo, id: s.id }, seguir: true, nome: s.nome, detalhe: s.detalhe });

  return (
    <Tela
      comBarra
      titulo="Seguindo"
      descricao={`${inteiro(itens.length)} de ${inteiro(LIMITE)} itens. O feed "Quem eu sigo" mostra o que acontece com eles.`}
    >
      {desfeito ? (
        <View style={[styles.aviso, { borderColor: theme.rule, backgroundColor: theme.surface }]} aria-live="polite">
          <Text style={[typography.body, styles.avisoTexto, { color: theme.ink }]}>
            Você deixou de seguir {desfeito.nome}.
          </Text>
          <Botao
            variante="texto"
            rotulo="Desfazer"
            ocupado={seguir.isPending}
            aoTocar={() => {
              seguir.mutate(desfeito, { onSuccess: () => setDesfeito(null) });
            }}
          />
        </View>
      ) : null}
      {seguir.isError ? (
        <Text style={[typography.body, { color: theme.error }]} aria-live="assertive">
          {mensagemDeErro(seguir.error)}
        </Text>
      ) : null}

      {itens.length === 0 ? (
        <View style={styles.vazio}>
          <Vazio mensagem="Você ainda não segue ninguém. Procure pessoas, partidos, propostas e assuntos na Busca." />
          <Botao rotulo="Ir para a Busca" aoTocar={() => router.navigate('/busca')} />
        </View>
      ) : (
        GRUPOS.map(({ tipo, nome }) => {
          const doGrupo = itens.filter((s) => s.tipo === tipo);
          if (doGrupo.length === 0) return null;
          return (
            <Secao key={tipo} titulo={`${nome} · ${doGrupo.length}`}>
              {doGrupo.map((s) => (
                <LinhaDeAlvo
                  key={`${s.tipo}:${s.id}`}
                  alvo={{ tipo: s.tipo, id: s.id }}
                  nome={s.nome}
                  detalhe={s.detalhe}
                  ocupado={seguir.isPending}
                  aoAlternar={(quer) => {
                    setDesfeito(null);
                    seguir.mutate(
                      { alvo: { tipo: s.tipo, id: s.id }, seguir: quer, nome: s.nome, detalhe: s.detalhe },
                      { onSuccess: () => { if (!quer) deixar(s); } },
                    );
                  }}
                />
              ))}
            </Secao>
          );
        })
      )}
    </Tela>
  );
}

const styles = StyleSheet.create({
  aviso: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingLeft: space.md,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  avisoTexto: { flex: 1 },
  vazio: { alignItems: 'center', gap: space.md },
});

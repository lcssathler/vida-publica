import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useEstaSeguindo, useSeguir } from '../api/consultas';
import type { Alvo } from '../api/tipos';
import { rotaDoAlvo } from '../perfis/rotas';
import { rules, space, typography } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { Alternar } from './Alternar';
import { LinkTexto } from './Secao';

export interface LinhaDeAlvoProps {
  alvo: Alvo;
  nome: string;
  detalhe?: string | null;
  /** Texto pequeno acima do nome, ex.: "Pessoa". */
  sobre?: string;
  /** Chamado depois de deixar de seguir (para oferecer "Desfazer"). */
  aoDeixar?: () => void;
}

/** Pessoa, partido, proposta ou assunto: nome (com link quando há tela), detalhe e seguir. */
export function LinhaDeAlvo({ alvo, nome, detalhe, sobre, aoDeixar }: LinhaDeAlvoProps) {
  const theme = useTheme();
  const router = useRouter();
  const seguir = useSeguir();
  const segue = useEstaSeguindo()(alvo);
  const rota = rotaDoAlvo(alvo);

  return (
    <View style={[styles.linha, { borderBottomColor: theme.rule }]}>
      <View style={styles.texto}>
        {sobre ? <Text style={[typography.overline, { color: theme.ink3 }]}>{sobre}</Text> : null}
        {rota ? (
          <LinkTexto rotulo={nome} estilo="bodyStrong" aoTocar={() => router.push(rota)} />
        ) : (
          <Text style={[typography.bodyStrong, styles.semLink, { color: theme.ink }]}>{nome}</Text>
        )}
        {detalhe ? (
          <Text style={[typography.caption, { color: theme.ink2 }]} numberOfLines={2}>
            {detalhe}
          </Text>
        ) : null}
      </View>
      <Alternar
        rotulo="Seguir"
        rotuloMarcado="Seguindo"
        descricao={`Seguir ${nome}`}
        marcado={segue}
        aoAlternar={() => {
          seguir.mutate({ alvo, seguir: !segue, nome, detalhe });
          if (segue) aoDeixar?.();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: rules.hairline,
  },
  texto: { flex: 1, gap: 0 },
  semLink: { paddingVertical: space.sm },
});

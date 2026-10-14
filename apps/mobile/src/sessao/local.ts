import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Uf } from '../api/tipos';

/** Posição de um registro no feed: a ordem é (ocorridoEm, id) decrescente. */
export interface Marco {
  ocorridoEm: string;
  id: string;
}

/** O que o app guarda no aparelho fora do cofre: nada secreto, nenhum CEP. */
export interface EstadoLocal {
  onboardingConcluido: boolean;
  uf: Uf | null;
  /** "Você parou aqui": o registro do topo na última visita, por escopo do feed. */
  parouAqui: Partial<Record<'seguindo' | 'todos', Marco>>;
}

export const ESTADO_INICIAL: EstadoLocal = { onboardingConcluido: false, uf: null, parouAqui: {} };

const CHAVE = 'vp.local.v1';

export async function lerLocal(): Promise<EstadoLocal> {
  try {
    const texto = await AsyncStorage.getItem(CHAVE);
    return texto ? { ...ESTADO_INICIAL, ...(JSON.parse(texto) as Partial<EstadoLocal>) } : ESTADO_INICIAL;
  } catch {
    return ESTADO_INICIAL;
  }
}

export async function gravarLocal(estado: EstadoLocal): Promise<void> {
  await AsyncStorage.setItem(CHAVE, JSON.stringify(estado));
}

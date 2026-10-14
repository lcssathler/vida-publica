import { Alvo } from './alvo';

export interface AlvoSeguido extends Alvo {
  /** Nome para exibir: pessoa, sigla do partido, identificação da proposta ou tema. */
  nome: string;
  /** Cargo e UF, nome do partido ou ementa da proposta. */
  detalhe: string | null;
  desde: Date;
}

export interface Assunto {
  nome: string;
  proposicoes: number;
}

/** Porta: o que cada usuário segue (app.seguindo) e os alvos que existem (canon). */
export abstract class SeguindoRepositorio {
  abstract listar(usuarioId: string): Promise<AlvoSeguido[]>;

  abstract contar(usuarioId: string): Promise<number>;

  /** O alvo existe no canon (pessoa, partido, proposição ou tema oficial)? */
  abstract existe(alvo: Alvo): Promise<boolean>;

  /** O usuário segue este alvo? */
  abstract segue(usuarioId: string, alvo: Alvo): Promise<boolean>;

  /** Segue; devolve false se já seguia. */
  abstract seguir(usuarioId: string, alvo: Alvo): Promise<boolean>;

  /** Deixa de seguir; devolve false se não seguia. */
  abstract deixar(usuarioId: string, alvo: Alvo): Promise<boolean>;

  /** Temas oficiais das proposições, para escolher assuntos. */
  abstract assuntos(): Promise<Assunto[]>;
}

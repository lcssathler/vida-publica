import { Inject, Injectable } from '@nestjs/common';
import {
  conferirSenha,
  conferirTotp,
  decifrar,
  HASH_FICTICIO,
  hashToken,
  tokenSessao,
} from './cripto';
import { ContasAdminRepositorio, SessaoAdmin } from './contas.repositorio';

export const CONFIG_CONTAS = Symbol('CONFIG_CONTAS');

export interface ConfigContas {
  /** Chave AES-256 que abre os segredos do 2FA guardados no banco. */
  chaveTotp: Buffer;
  sessaoHoras: number;
}

/** Relógio trocável nos testes. */
export const RELOGIO_ADMIN = Symbol('RELOGIO_ADMIN');
export type RelogioAdmin = () => Date;

export const MAX_FALHAS = 5;
export const BLOQUEIO_MINUTOS = 15;

export type ResultadoEntrada =
  | {
      ok: true;
      token: string;
      expiraEm: Date;
      admin: { id: string; nome: string; email: string };
    }
  | { ok: false; motivo: 'credenciais' | 'bloqueado' };

/**
 * Login do painel: e-mail, senha e código do 2FA, sempre os três. A resposta
 * de erro é a mesma para e-mail desconhecido, senha errada e código errado;
 * só a conta bloqueada (5 erros seguidos, 15 minutos) é dita.
 */
@Injectable()
export class ContasAdminService {
  constructor(
    @Inject(ContasAdminRepositorio)
    private readonly contas: ContasAdminRepositorio,
    @Inject(CONFIG_CONTAS) private readonly config: ConfigContas,
    @Inject(RELOGIO_ADMIN) private readonly agora: RelogioAdmin,
  ) {}

  async entrar(dados: {
    email: string;
    senha: string;
    codigo: string;
    ip: string | null;
  }): Promise<ResultadoEntrada> {
    const conta = await this.contas.porEmail(dados.email);
    const senhaCerta = await conferirSenha(
      dados.senha,
      conta?.senhaHash ?? HASH_FICTICIO,
    );
    if (!conta || !conta.ativo) return { ok: false, motivo: 'credenciais' };
    const agora = this.agora();
    if (conta.bloqueadoAte && conta.bloqueadoAte > agora) {
      return { ok: false, motivo: 'bloqueado' };
    }
    const passo = senhaCerta
      ? conferirTotp(
          decifrar(conta.totpSegredo, this.config.chaveTotp),
          dados.codigo,
          agora,
        )
      : null;
    const aceito =
      passo !== null &&
      passo > conta.totpUltimoPasso &&
      (await this.contas.registrarAcesso(conta.id, passo));
    if (!aceito) {
      const bloquear = conta.falhas + 1 >= MAX_FALHAS;
      await this.contas.registrarFalha(
        conta.id,
        bloquear ? new Date(agora.getTime() + BLOQUEIO_MINUTOS * 60_000) : null,
      );
      return { ok: false, motivo: bloquear ? 'bloqueado' : 'credenciais' };
    }
    const token = tokenSessao();
    const expiraEm = new Date(
      agora.getTime() + this.config.sessaoHoras * 3_600_000,
    );
    await this.contas.criarSessao(
      conta.id,
      hashToken(token),
      dados.ip,
      expiraEm,
    );
    return {
      ok: true,
      token,
      expiraEm,
      admin: { id: conta.id, nome: conta.nome, email: conta.email },
    };
  }

  sessao(token: string): Promise<SessaoAdmin | null> {
    return this.contas.sessaoAtiva(hashToken(token));
  }

  sair(sessaoId: string): Promise<void> {
    return this.contas.encerrarSessao(sessaoId);
  }
}

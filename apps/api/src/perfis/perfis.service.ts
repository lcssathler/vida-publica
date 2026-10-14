import { Inject, Injectable } from '@nestjs/common';
import { FeedService, RespostaFeed } from '../feed/feed.service';
import { Alvo } from '../seguir/alvo';
import { SeguirService } from '../seguir/seguir.service';
import {
  CATEGORIAS,
  Categoria,
  ContagemCategoria,
  porCategoria,
} from './categorias';
import {
  DoadoresCandidatura,
  GastoAnual,
  Parlamentar,
  PartidoDados,
  PerfisRepositorio,
  PessoaDados,
} from './perfis.repositorio';

/** Limite acima do qual o doador pessoa física é nomeado (decisão de produto). */
export const LIMITE_NOME_PESSOA_FISICA = 10_000;

const FONTE_CONTAS_TSE =
  'https://cdn.tse.jus.br/estatistica/sead/odsele/prestacao_contas/prestacao_de_contas_eleitorais_candidatos_{ano}.zip';

export interface PerfilPessoa extends PessoaDados {
  partidoAtual: { id: string | null; sigla: string } | null;
  seguindo: boolean;
  categorias: ContagemCategoria[];
  /** Cota parlamentar nos dois anos mais recentes. */
  gastos: GastoAnual[];
  /** Anos com candidatura, para pedir os doadores. */
  anosDeCampanha: number[];
}

export interface PerfilPartido extends PartidoDados {
  seguindo: boolean;
  categorias: ContagemCategoria[];
}

export interface ParlamentarDoEstado extends Parlamentar {
  seguindo: boolean;
}

export interface DoadoresPessoa {
  ano: number;
  limiteNomePessoaFisica: number;
  fonte: { url: string };
  candidaturas: DoadoresCandidatura[];
}

@Injectable()
export class PerfisService {
  constructor(
    @Inject(PerfisRepositorio) private readonly perfis: PerfisRepositorio,
    @Inject(FeedService) private readonly feed: FeedService,
    @Inject(SeguirService) private readonly seguir: SeguirService,
  ) {}

  async pessoa(id: string, usuarioId: string): Promise<PerfilPessoa | null> {
    const dados = await this.perfis.pessoa(id);
    if (!dados) return null;
    const alvo: Alvo = { tipo: 'pessoa', id };
    const [contagem, seguindo, gastos, anos] = await Promise.all([
      this.feed.contarPorTipo(alvo, usuarioId),
      this.seguir.segue(usuarioId, alvo),
      this.perfis.gastos(id, 2),
      this.perfis.anosDeCandidatura(id),
    ]);
    return {
      ...dados,
      partidoAtual: partidoAtual(dados),
      seguindo,
      categorias: porCategoria(contagem),
      gastos,
      anosDeCampanha: anos,
    };
  }

  async partido(id: string, usuarioId: string): Promise<PerfilPartido | null> {
    const dados = await this.perfis.partido(id);
    if (!dados) return null;
    const alvo: Alvo = { tipo: 'partido', id };
    const [contagem, seguindo] = await Promise.all([
      this.feed.contarPorTipo(alvo, usuarioId),
      this.seguir.segue(usuarioId, alvo),
    ]);
    return { ...dados, seguindo, categorias: porCategoria(contagem) };
  }

  /** Parlamentares em exercício do estado, com quem o usuário já segue. */
  async parlamentares(
    uf: string,
    usuarioId: string,
  ): Promise<ParlamentarDoEstado[]> {
    const [lista, seguidos] = await Promise.all([
      this.perfis.parlamentares(uf),
      this.seguir.listar(usuarioId),
    ]);
    const pessoas = new Set(
      seguidos.filter((s) => s.tipo === 'pessoa').map((s) => s.id),
    );
    return lista.map((p) => ({ ...p, seguindo: pessoas.has(p.id) }));
  }

  /** Linha do tempo do perfil numa categoria (ou em todas), com as regras do feed. */
  eventos(
    alvo: Alvo,
    usuarioId: string,
    categoria: Categoria | null,
    cursor: string | null,
    limite: number,
  ): Promise<RespostaFeed> {
    return this.feed.pagina({
      usuarioId,
      escopo: 'todos',
      tipos: categoria ? [...CATEGORIAS[categoria]] : [],
      assuntos: [],
      alvo,
      cursor,
      limite,
    });
  }

  /**
   * Quem financiou as candidaturas da pessoa no ano (o mais recente, se não
   * informado). Pessoa física só é nomeada acima de R$ 10 mil; CPF nunca.
   */
  async doadores(
    pessoaId: string,
    ano: number | null,
  ): Promise<DoadoresPessoa | null> {
    const anos = await this.perfis.anosDeCandidatura(pessoaId);
    const escolhido = ano ?? anos[0];
    if (escolhido === undefined || !anos.includes(escolhido)) return null;
    return {
      ano: escolhido,
      limiteNomePessoaFisica: LIMITE_NOME_PESSOA_FISICA,
      fonte: { url: FONTE_CONTAS_TSE.replace('{ano}', String(escolhido)) },
      candidaturas: await this.perfis.doadores(pessoaId, escolhido),
    };
  }
}

/** Filiação em aberto mais recente; sem ela, o partido da última candidatura. */
function partidoAtual(dados: PessoaDados): PerfilPessoa['partidoAtual'] {
  const aberta = dados.filiacoes.find((f) => f.ate === null);
  if (aberta) return { id: aberta.partidoId, sigla: aberta.sigla };
  const ultima = dados.candidaturas.find((c) => c.partido.sigla);
  return ultima?.partido.sigla
    ? { id: ultima.partido.id, sigla: ultima.partido.sigla }
    : null;
}

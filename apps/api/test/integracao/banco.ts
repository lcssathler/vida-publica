import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { Db } from '../../src/db/db';

/** Conexão com o banco de teste (vitest.int.config.mts), com o usuário vp_api. */
export function dbDeTeste(): Db {
  return new Db(
    new Pool({ connectionString: process.env.DATABASE_URL, max: 4 }),
  );
}

/**
 * Dados fictícios em canon e feed, gravados com o dono do banco (a API não
 * escreve lá). Cada teste apaga o que criou em `limpar()`.
 */
export class Semente {
  readonly db: Db;
  private readonly pessoas: string[] = [];
  private readonly partidos: number[] = [];
  private readonly proposicoes: string[] = [];
  private readonly eventos: string[] = [];
  private readonly regrasCriadas: string[] = [];
  private readonly votacoes: string[] = [];
  private readonly receitas: string[] = [];
  private readonly candidaturas: Array<[number, string]> = [];
  private readonly vinculos: Array<[string, string]> = [];
  private readonly despesas: string[] = [];
  private readonly deputados: number[] = [];
  private readonly senadores: number[] = [];

  constructor() {
    const url = process.env.VP_API_TEST_OWNER_URL;
    if (!url) throw new Error('Defina VP_API_TEST_OWNER_URL (dono do banco)');
    this.db = new Db(new Pool({ connectionString: url, max: 2 }));
  }

  async pessoa(nome = `Pessoa Fictícia ${randomUUID().slice(0, 8)}`) {
    const [linha] = await this.db.query<{ id: string }>(
      `INSERT INTO canon.pessoa (nome_civil, nome_exibicao) VALUES ($1, $1) RETURNING id`,
      [nome],
    );
    this.pessoas.push(linha.id);
    return linha.id;
  }

  /** Filiação em aberto (ou fechada, com `ate`). */
  async filiacao(
    pessoaId: string,
    partidoId: string,
    sigla: string,
    desde: string,
    ate?: string,
  ) {
    await this.db.query(
      `INSERT INTO canon.filiacao (pessoa_id, sigla, partido_id, desde, ate, fonte)
       VALUES ($1, $2, $3, $4, $5, 'camara')`,
      [pessoaId, sigla, partidoId, desde, ate ?? null],
    );
  }

  async partido(sigla = `T${randomUUID().slice(0, 6).toUpperCase()}`) {
    const [linha] = await this.db.query<{ id: number }>(
      `INSERT INTO canon.partido (numero_tse, sigla, sigla_normalizada, nome)
       VALUES (99, $1, $1, $2) RETURNING id`,
      [sigla, `Partido Fictício ${sigla}`],
    );
    this.partidos.push(linha.id);
    return String(linha.id);
  }

  async proposicao(temas: string[] = []) {
    return (await this.proposicaoComFonte(temas)).id;
  }

  /** Proposição da Câmara com id da fonte numérico (como o real). */
  async proposicaoComFonte(
    temas: string[] = [],
    extra: { numero?: number; ementa?: string } = {},
  ) {
    const numero = extra.numero ?? 1;
    const idFonte = String(800_000_000 + Math.floor(Math.random() * 1e8));
    const [linha] = await this.db.query<{ id: string }>(
      `INSERT INTO canon.proposicao (casa, id_fonte, sigla_tipo, numero, ano, identificacao,
                                     ementa, content_hash)
       VALUES ('camara', $1, 'PL', $2, 10001, $4, $3, repeat('0', 64))
       RETURNING id`,
      [
        idFonte,
        numero,
        extra.ementa ?? 'Ementa fictícia',
        `PL ${numero}/10001`,
      ],
    );
    this.proposicoes.push(linha.id);
    for (const tema of temas) {
      await this.db.query(
        'INSERT INTO canon.proposicao_tema (proposicao_id, tema) VALUES ($1, $2)',
        [linha.id, tema],
      );
    }
    return { id: linha.id, idFonte };
  }

  /** Etapa de tramitação (hora local de Brasília, como a fonte). */
  async tramitacao(
    proposicaoId: string,
    dados: {
      idFonte: string;
      dataHora: string;
      descricao: string;
      orgao?: string;
    },
  ) {
    await this.db.query(
      `INSERT INTO canon.proposicao_tramitacao (proposicao_id, id_fonte, sequencia, data_hora,
                                                sigla_orgao, descricao)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        proposicaoId,
        dados.idFonte,
        Number(dados.idFonte),
        dados.dataHora,
        dados.orgao ?? 'PLEN',
        dados.descricao,
      ],
    );
  }

  /** Votação nominal da Câmara sobre a proposição, com os votos dados. */
  async votacaoCamara(
    idFonteProposicao: string,
    dados: { registradoEm: string; aprovacao: boolean; votos: string[] },
  ) {
    const id = `teste-${randomUUID()}`;
    await this.db.query(
      `INSERT INTO canon.camara_votacao (id, data, registrado_em, sigla_orgao, descricao,
                                         aprovacao, nominal, content_hash)
       VALUES ($1, $2::timestamp::date, $2, 'PLEN', 'Votação fictícia', $3, true,
               repeat('0', 64))`,
      [id, dados.registradoEm, dados.aprovacao],
    );
    this.votacoes.push(id);
    await this.db.query(
      `INSERT INTO canon.camara_votacao_proposicao (votacao_id, proposicao_id, papel)
       VALUES ($1, $2, 'objeto')`,
      [id, Number(idFonteProposicao)],
    );
    for (const [i, voto] of dados.votos.entries()) {
      await this.db.query(
        'INSERT INTO canon.camara_voto (votacao_id, id_camara, voto) VALUES ($1, $2, $3)',
        [id, 900_000_000 + i, voto],
      );
    }
    return id;
  }

  /**
   * Evento fictício (regra v99 do tipo, só de teste). Alvos no formato
   * do motor: pessoa, partido, proposicao ou assunto, com papel.
   */
  async evento(dados: {
    ocorridoEm: string;
    status?: 'segurado' | 'publicado' | 'arquivado';
    visibilidade?: 'geral' | 'seguidores';
    alvos?: Array<{ tipo: string; id: string; papel?: string }>;
    fonteUrl?: string | null;
    payload?: Record<string, unknown>;
    valor?: number | null;
    tipo?: string;
    chaveFato?: string;
  }): Promise<string> {
    const tipo = dados.tipo ?? 'voto_nominal';
    const criada = await this.db.query(
      `INSERT INTO feed.regra (tipo, versao, descricao)
       VALUES ($1, 99, 'Regra fictícia dos testes da API')
       ON CONFLICT DO NOTHING RETURNING 1`,
      [tipo],
    );
    if (criada.length > 0) this.regrasCriadas.push(tipo);
    const status = dados.status ?? 'publicado';
    const fato = dados.chaveFato ?? randomUUID();
    const [linha] = await this.db.query<{ id: string }>(
      `INSERT INTO feed.evento (tipo, regra_versao, chave_fato, chave_dedup, ocorrido_em,
                                fonte_url, fonte_dado_em, titulo, resumo, payload, valor,
                                visibilidade, status, motivo, publicado_em, content_hash)
       VALUES ($8, 99, $1, $8 || ':v99:' || $1, $2, $3, $2,
               'Evento fictício ' || $1, 'Resumo fictício', $4, $5, $6, $7,
               CASE WHEN $7 = 'publicado' THEN NULL ELSE 'carga_inicial' END,
               CASE WHEN $7 = 'publicado' THEN now() END, repeat('0', 64))
       RETURNING id`,
      [
        fato,
        dados.ocorridoEm,
        dados.fonteUrl === undefined
          ? 'https://exemplo.gov.br/fonte'
          : dados.fonteUrl,
        dados.payload ?? {},
        dados.valor ?? null,
        dados.visibilidade ?? 'geral',
        status,
        tipo,
      ],
    );
    this.eventos.push(linha.id);
    for (const alvo of dados.alvos ?? []) {
      await this.db.query(
        `INSERT INTO feed.evento_alvo (evento_id, alvo_tipo, alvo_id, papel)
         VALUES ($1, $2, $3, $4)`,
        [linha.id, alvo.tipo, alvo.id, alvo.papel ?? ''],
      );
    }
    return linha.id;
  }

  /** Candidatura no TSE (ano fictício) ligada à pessoa. */
  async candidatura(
    pessoaId: string,
    ano: number,
    dados: { cargo?: string; uf?: string; partido?: string } = {},
  ): Promise<string> {
    const sq = String(Math.floor(Math.random() * 1e12));
    await this.db.query(
      `INSERT INTO canon.tse_candidatura (ano_eleicao, sq_candidato, nr_turno, nm_candidato,
                                          nm_urna_candidato, ds_cargo, sg_uf, sg_partido,
                                          ds_sit_tot_turno, content_hash)
       VALUES ($1, $2, 1, 'CANDIDATA FICTÍCIA', 'CANDIDATA', $3, $4, $5, 'ELEITO',
               repeat('0', 64))`,
      [
        ano,
        sq,
        dados.cargo ?? 'DEPUTADO FEDERAL',
        dados.uf ?? 'SP',
        dados.partido ?? 'TST',
      ],
    );
    this.candidaturas.push([ano, sq]);
    await this.vinculo(pessoaId, 'tse', `${ano}:${sq}`);
    return sq;
  }

  async vinculo(pessoaId: string, fonte: string, idFonte: string) {
    await this.db.query(
      `INSERT INTO canon.pessoa_vinculo (fonte, id_fonte, pessoa_id, metodo, confianca)
       VALUES ($1, $2, $3, 'manual', 1)`,
      [fonte, idFonte, pessoaId],
    );
    this.vinculos.push([fonte, idFonte]);
  }

  /** Deputado na tabela da Câmara, ligado à pessoa. */
  async deputado(
    pessoaId: string,
    dados: {
      uf: string;
      situacao?: string;
      sexo?: 'M' | 'F';
      partido?: string;
    },
  ): Promise<number> {
    const id = 900_000_000 + Math.floor(Math.random() * 1e8);
    await this.db.query(
      `INSERT INTO canon.camara_deputado (id_camara, nome_parlamentar, sexo, sigla_partido,
                                          sigla_uf, situacao, url_foto, content_hash)
       VALUES ($1, 'Deputada Fictícia', $2, $3, $4, $5, 'https://exemplo.invalid/d.jpg',
               repeat('0', 64))`,
      [
        id,
        dados.sexo ?? 'F',
        dados.partido ?? 'TST',
        dados.uf,
        dados.situacao ?? 'Exercício',
      ],
    );
    this.deputados.push(id);
    await this.vinculo(pessoaId, 'camara', String(id));
    return id;
  }

  /** Senador na tabela do Senado, ligado à pessoa. */
  async senador(
    pessoaId: string,
    dados: { uf: string; emExercicio?: boolean; sexo?: 'M' | 'F' },
  ): Promise<number> {
    const id = 900_000_000 + Math.floor(Math.random() * 1e8);
    await this.db.query(
      `INSERT INTO canon.senado_senador (codigo_senado, nome_parlamentar, sexo, sigla_partido,
                                         uf_parlamentar, em_exercicio, content_hash)
       VALUES ($1, 'Senador Fictício', $2, 'TST', $3, $4, repeat('0', 64))`,
      [id, dados.sexo ?? 'M', dados.uf, dados.emExercicio ?? true],
    );
    this.senadores.push(id);
    await this.vinculo(pessoaId, 'senado', String(id));
    return id;
  }

  /** Receita de campanha; com `cpfHash`, o doador é pessoa física (hash em ident). */
  async receita(dados: {
    ano: number;
    sq: string;
    valor: number;
    origem: [number, string];
    nome: string;
    sqReceita: number;
    prestacao?: string;
    cpfHash?: string;
    cnpj?: string;
  }): Promise<void> {
    const id = randomUUID().replaceAll('-', '').padEnd(64, '0');
    await this.db.query(
      `INSERT INTO canon.tse_receita (id, ano_eleicao, sq_candidato, cd_origem, ds_origem,
                                      doador_nome, doador_cnpj, valor, sq_receita,
                                      tp_prestacao)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        id,
        dados.ano,
        dados.sq,
        dados.origem[0],
        dados.origem[1],
        dados.nome,
        dados.cnpj ?? null,
        dados.valor,
        dados.sqReceita,
        dados.prestacao ?? 'FINAL',
      ],
    );
    this.receitas.push(id);
    if (dados.cpfHash) {
      await this.db.query(
        'INSERT INTO ident.tse_receita_doador (linha_id, cpf_hash) VALUES ($1, $2)',
        [id, dados.cpfHash],
      );
    }
  }

  /** Despesa da cota da Câmara para um id de deputado fictício. */
  async despesaCamara(
    idCamara: number,
    ano: number,
    descricao: string,
    valor: number,
  ) {
    const id = randomUUID().replaceAll('-', '').padEnd(64, '0');
    await this.db.query(
      `INSERT INTO canon.camara_despesa (id, ano, mes, id_camara, nome_parlamentar,
                                         num_subcota, descricao, valor_liquido)
       VALUES ($1, $2, 1, $3, 'Deputada Fictícia', 1, $4, $5)`,
      [id, ano, idCamara, descricao, valor],
    );
    this.despesas.push(id);
  }

  async limpar(): Promise<void> {
    await this.db.query('DELETE FROM canon.camara_despesa WHERE id = ANY($1)', [
      this.despesas,
    ]);
    await this.db.query(
      'DELETE FROM ident.tse_receita_doador WHERE linha_id = ANY($1)',
      [this.receitas],
    );
    await this.db.query('DELETE FROM canon.tse_receita WHERE id = ANY($1)', [
      this.receitas,
    ]);
    for (const [ano, sq] of this.candidaturas) {
      await this.db.query(
        'DELETE FROM canon.tse_candidatura WHERE ano_eleicao = $1 AND sq_candidato = $2',
        [ano, sq],
      );
    }
    for (const [fonte, idFonte] of this.vinculos) {
      await this.db.query(
        'DELETE FROM canon.pessoa_vinculo WHERE fonte = $1 AND id_fonte = $2',
        [fonte, idFonte],
      );
    }
    await this.db.query(
      'DELETE FROM canon.camara_deputado WHERE id_camara = ANY($1::int[])',
      [this.deputados],
    );
    await this.db.query(
      'DELETE FROM canon.senado_senador WHERE codigo_senado = ANY($1::int[])',
      [this.senadores],
    );
    await this.db.query(
      'DELETE FROM canon.filiacao WHERE pessoa_id = ANY($1::uuid[])',
      [this.pessoas],
    );
    await this.db.query('DELETE FROM feed.evento WHERE id = ANY($1::uuid[])', [
      this.eventos,
    ]);
    await this.db.query(
      'DELETE FROM feed.regra WHERE versao = 99 AND tipo = ANY($1::text[])',
      [this.regrasCriadas],
    );
    await this.db.query('DELETE FROM canon.camara_votacao WHERE id = ANY($1)', [
      this.votacoes,
    ]);
    await this.db.query(
      'DELETE FROM canon.proposicao WHERE id = ANY($1::uuid[])',
      [this.proposicoes],
    );
    await this.db.query('DELETE FROM canon.partido WHERE id = ANY($1::int[])', [
      this.partidos,
    ]);
    await this.db.query('DELETE FROM canon.pessoa WHERE id = ANY($1::uuid[])', [
      this.pessoas,
    ]);
    await this.db.fechar();
  }
}

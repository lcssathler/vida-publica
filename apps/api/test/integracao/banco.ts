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
  private regraCriada = false;

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
    const idFonte = `teste-${randomUUID()}`;
    const [linha] = await this.db.query<{ id: string }>(
      `INSERT INTO canon.proposicao (casa, id_fonte, sigla_tipo, numero, ano, identificacao,
                                     ementa, content_hash)
       VALUES ('camara', $1, 'PL', 1, 10001, 'PL 1/10001', 'Ementa fictícia', repeat('0', 64))
       RETURNING id`,
      [idFonte],
    );
    this.proposicoes.push(linha.id);
    for (const tema of temas) {
      await this.db.query(
        'INSERT INTO canon.proposicao_tema (proposicao_id, tema) VALUES ($1, $2)',
        [linha.id, tema],
      );
    }
    return linha.id;
  }

  /**
   * Evento fictício (regra voto_nominal v99, só de teste). Alvos no formato
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
  }): Promise<string> {
    if (!this.regraCriada) {
      const criada = await this.db.query(
        `INSERT INTO feed.regra (tipo, versao, descricao)
         VALUES ('voto_nominal', 99, 'Regra fictícia dos testes da API')
         ON CONFLICT DO NOTHING RETURNING 1`,
      );
      this.regraCriada = criada.length > 0;
    }
    const status = dados.status ?? 'publicado';
    const fato = randomUUID();
    const [linha] = await this.db.query<{ id: string }>(
      `INSERT INTO feed.evento (tipo, regra_versao, chave_fato, chave_dedup, ocorrido_em,
                                fonte_url, fonte_dado_em, titulo, resumo, payload, valor,
                                visibilidade, status, motivo, publicado_em, content_hash)
       VALUES ('voto_nominal', 99, $1, 'voto_nominal:v99:' || $1, $2, $3, $2,
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

  async limpar(): Promise<void> {
    await this.db.query('DELETE FROM feed.evento WHERE id = ANY($1::uuid[])', [
      this.eventos,
    ]);
    if (this.regraCriada) {
      await this.db.query(
        "DELETE FROM feed.regra WHERE tipo = 'voto_nominal' AND versao = 99",
      );
    }
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

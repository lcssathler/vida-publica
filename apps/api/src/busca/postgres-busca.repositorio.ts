import { Inject, Injectable } from '@nestjs/common';
import { Db } from '../db/db';
import {
  BuscaRepositorio,
  ConsultaBusca,
  ResultadoAssunto,
  ResultadoPartido,
  ResultadoPessoa,
  ResultadoProposta,
} from './busca.repositorio';
import { consultaTextual, identificacaoDeProposta } from './termos';

// Expressões iguais às dos índices da migração busca: só assim o Postgres usa
// o índice.
const NOME_PESSOA = `canon.normaliza(coalesce(p.nome_exibicao, '') || ' ' || coalesce(p.nome_civil, ''))`;
const TEXTO_PROPOSTA = `to_tsvector('portuguese'::regconfig, canon.normaliza(
  p.identificacao || ' ' || coalesce(p.apelido, '') || ' ' || coalesce(p.ementa, '') || ' '
  || coalesce(p.keywords, '')))`;

const segue = (tipo: string, id: string) => `EXISTS (
  SELECT 1 FROM app.seguindo s
   WHERE s.usuario_id = $1 AND s.alvo_tipo = '${tipo}' AND s.alvo_id = ${id})`;

@Injectable()
export class PostgresBuscaRepositorio extends BuscaRepositorio {
  constructor(@Inject(Db) private readonly db: Db) {
    super();
  }

  /**
   * Nome parecido (trigramas, sem acento), em duas etapas: o índice acha até
   * 100 nomes e ordena pelo quanto a busca bate com o nome inteiro e com
   * palavras dele; depois quem está em exercício sobe, depois quem é
   * candidato na eleição em curso. Só os escolhidos ganham o detalhe.
   */
  pessoas(c: ConsultaBusca): Promise<ResultadoPessoa[]> {
    return this.db.query<ResultadoPessoa>(
      `WITH achados AS (
         SELECT p.id, coalesce(p.nome_exibicao, p.nome_civil, 'Sem nome') AS nome,
                0.6 * similarity(canon.normaliza($2),
                                 canon.normaliza(coalesce(p.nome_exibicao, p.nome_civil, '')))
                + 0.4 * strict_word_similarity(canon.normaliza($2), ${NOME_PESSOA}) AS base
           FROM canon.pessoa p
          WHERE canon.normaliza($2) <% ${NOME_PESSOA}
          ORDER BY base DESC
          LIMIT 100
       ), pontuados AS (
         SELECT a.*,
                EXISTS (SELECT 1 FROM canon.mandato m
                         WHERE m.pessoa_id = a.id AND m.em_exercicio)
                OR EXISTS (SELECT 1 FROM canon.pessoa_vinculo v
                             JOIN canon.camara_deputado d
                               ON d.id_camara = CASE WHEN v.fonte = 'camara'
                                                     THEN v.id_fonte::integer END
                            WHERE v.pessoa_id = a.id AND d.situacao = 'Exercício')
                OR EXISTS (SELECT 1 FROM canon.pessoa_vinculo v
                             JOIN canon.senado_senador s
                               ON s.codigo_senado = CASE WHEN v.fonte = 'senado'
                                                         THEN v.id_fonte::integer END
                            WHERE v.pessoa_id = a.id AND s.em_exercicio) AS em_exercicio,
                EXISTS (SELECT 1 FROM canon.pessoa_vinculo v
                         WHERE v.pessoa_id = a.id AND v.fonte = 'tse'
                           AND v.id_fonte LIKE extract(year FROM now())::integer || ':%')
                  AS candidato_agora
           FROM achados a
       ), escolhidos AS (
         SELECT * FROM pontuados
          ORDER BY base + CASE WHEN em_exercicio THEN 0.15 ELSE 0 END
                        + CASE WHEN candidato_agora THEN 0.05 ELSE 0 END DESC, nome
          LIMIT $3
       )
       SELECT e.id, e.nome, d.detalhe, ${segue('pessoa', 'e.id::text')} AS seguindo
         FROM escolhidos e
         LEFT JOIN LATERAL (
           SELECT detalhe FROM (
             SELECT m.cargo || coalesce(' · ' || m.uf, '') AS detalhe, 3 AS peso, 9999 AS ano
               FROM canon.mandato m WHERE m.pessoa_id = e.id AND m.em_exercicio
             UNION ALL
             SELECT 'Deputado Federal' || coalesce(' · ' || d.sigla_uf, ''), 2, 9999
               FROM canon.pessoa_vinculo v
               JOIN canon.camara_deputado d
                 ON d.id_camara = CASE WHEN v.fonte = 'camara' THEN v.id_fonte::integer END
              WHERE v.pessoa_id = e.id AND d.situacao = 'Exercício'
             UNION ALL
             SELECT 'Senador' || coalesce(' · ' || s.uf_parlamentar, ''), 2, 9999
               FROM canon.pessoa_vinculo v
               JOIN canon.senado_senador s
                 ON s.codigo_senado = CASE WHEN v.fonte = 'senado' THEN v.id_fonte::integer END
              WHERE v.pessoa_id = e.id AND s.em_exercicio
             UNION ALL
             SELECT initcap(lower(cp.ds_cargo)) || coalesce(' · ' || cp.sg_uf, '')
                    || ' · candidatura ' || cp.ano_eleicao, 1, cp.ano_eleicao
               FROM canon.candidatura_partido cp WHERE cp.pessoa_id = e.id
           ) x ORDER BY peso DESC, ano DESC LIMIT 1
         ) d ON true
        ORDER BY e.base + CASE WHEN e.em_exercicio THEN 0.15 ELSE 0 END
                        + CASE WHEN e.candidato_agora THEN 0.05 ELSE 0 END DESC, e.nome`,
      [c.usuarioId, c.texto, c.limite],
    );
  }

  /** Sigla exata ou parecida, ou nome; partidos em atividade primeiro. */
  async partidos(c: ConsultaBusca): Promise<ResultadoPartido[]> {
    const linhas = await this.db.query<{
      id: number;
      sigla: string;
      nome: string | null;
      sucessor_id: number | null;
      sucessor_sigla: string | null;
      seguindo: boolean;
    }>(
      `SELECT p.id, p.sigla, p.nome, s.id AS sucessor_id, s.sigla AS sucessor_sigla,
              ${segue('partido', 'p.id::text')} AS seguindo
         FROM canon.partido p
         LEFT JOIN canon.partido s ON s.id = p.sucessor_id
        WHERE canon.normaliza(p.sigla) LIKE canon.normaliza($2) || '%'
           OR canon.normaliza($2) <% canon.normaliza(coalesce(p.nome, ''))
        ORDER BY canon.normaliza(p.sigla) = canon.normaliza($2) DESC,
                 p.sucessor_id IS NULL DESC,
                 greatest(similarity(canon.normaliza(p.sigla), canon.normaliza($2)),
                          word_similarity(canon.normaliza($2),
                                          canon.normaliza(coalesce(p.nome, '')))) DESC,
                 p.ultimo_ano DESC NULLS LAST, p.sigla
        LIMIT $3`,
      [c.usuarioId, c.texto, c.limite],
    );
    return linhas.map((l) => ({
      id: String(l.id),
      sigla: l.sigla,
      nome: l.nome,
      sucessor:
        l.sucessor_id !== null && l.sucessor_sigla
          ? { id: String(l.sucessor_id), sigla: l.sucessor_sigla }
          : null,
      seguindo: l.seguindo,
    }));
  }

  /**
   * "PL 2338/2023" vai direto à proposta; o resto é busca textual com radicais
   * do português na identificação, apelido, ementa e palavras-chave.
   */
  async propostas(c: ConsultaBusca): Promise<ResultadoProposta[]> {
    const colunas = `p.id, p.identificacao, p.ementa, p.situacao,
      ${segue('proposicao', 'p.id::text')} AS seguindo`;
    const id = identificacaoDeProposta(c.texto);
    if (id) {
      const exatas = await this.db.query<ResultadoProposta>(
        `SELECT ${colunas} FROM canon.proposicao p
          WHERE upper(p.sigla_tipo) = $2 AND p.numero = $3
            AND ($4::integer IS NULL OR p.ano = $4)
          ORDER BY p.ano DESC, p.casa
          LIMIT $5`,
        [c.usuarioId, id.sigla, id.numero, id.ano, c.limite],
      );
      if (exatas.length > 0) return exatas;
    }
    const consulta = consultaTextual(c.texto);
    if (!consulta) return [];
    return this.db.query<ResultadoProposta>(
      `SELECT ${colunas} FROM canon.proposicao p
        WHERE ${TEXTO_PROPOSTA} @@ to_tsquery('portuguese', $2)
        ORDER BY ts_rank(${TEXTO_PROPOSTA}, to_tsquery('portuguese', $2)) DESC,
                 p.situacao_em DESC NULLS LAST, p.identificacao
        LIMIT $3`,
      [c.usuarioId, consulta, c.limite],
    );
  }

  assuntos(c: ConsultaBusca): Promise<ResultadoAssunto[]> {
    return this.db.query<ResultadoAssunto>(
      `SELECT t.tema AS nome, count(DISTINCT t.proposicao_id)::integer AS proposicoes,
              ${segue('assunto', 't.tema')} AS seguindo
         FROM canon.proposicao_tema t
        WHERE canon.normaliza(t.tema) LIKE '%' || canon.normaliza($2) || '%'
           OR canon.normaliza($2) <% canon.normaliza(t.tema)
        GROUP BY t.tema
        ORDER BY max(word_similarity(canon.normaliza($2), canon.normaliza(t.tema))) DESC,
                 proposicoes DESC, t.tema
        LIMIT $3`,
      [c.usuarioId, c.texto, c.limite],
    );
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { Db } from '../db/db';
import {
  Autor,
  ItemTramitacao,
  ItemVotacao,
  PropostaDados,
  PropostasRepositorio,
} from './propostas.repositorio';

const FONTE: Record<PropostaDados['casa'], string> = {
  camara: 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/',
  senado: 'https://legis.senado.leg.br/dadosabertos/processo/',
};

const data = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/** As fontes dão hora local de Brasília sem fuso: convertemos para instante. */
const BRASILIA = `'America/Sao_Paulo'`;

@Injectable()
export class PostgresPropostasRepositorio extends PropostasRepositorio {
  constructor(@Inject(Db) private readonly db: Db) {
    super();
  }

  async proposta(id: string): Promise<PropostaDados | null> {
    const [p] = await this.db.query<{
      id: string;
      casa: PropostaDados['casa'];
      id_fonte: string;
      identificacao: string;
      sigla_tipo: string;
      numero: number | null;
      ano: number | null;
      descricao_tipo: string | null;
      ementa: string | null;
      ementa_detalhada: string | null;
      apelido: string | null;
      apresentada_em: Date | null;
      situacao: string | null;
      situacao_em: Date | null;
      sigla_orgao: string | null;
      regime: string | null;
      tramitando: boolean | null;
      url_inteiro_teor: string | null;
      principal_id: string | null;
      principal_identificacao: string | null;
    }>(
      `SELECT p.id, p.casa, p.id_fonte, p.identificacao, p.sigla_tipo, p.numero, p.ano,
              p.descricao_tipo, p.ementa, p.ementa_detalhada, p.apelido, p.apresentada_em,
              p.situacao, p.situacao_em, p.sigla_orgao, p.regime, p.tramitando,
              p.url_inteiro_teor, pp.id AS principal_id,
              pp.identificacao AS principal_identificacao
         FROM canon.proposicao p
         LEFT JOIN canon.proposicao pp
           ON pp.casa = p.casa AND pp.id_fonte = p.proposicao_principal_id_fonte
        WHERE p.id = $1`,
      [id],
    );
    if (!p) return null;
    const [autores, temas] = await Promise.all([
      // Só casa autor com pessoa quando o tipo é parlamentar da própria casa:
      // autores "DEPUTADO" em matérias do Senado têm código interno do Senado.
      this.db.query<{
        nome: string;
        tipo: string | null;
        proponente: boolean | null;
        pessoa_id: string | null;
        pessoa_nome: string | null;
      }>(
        `SELECT a.nome, a.tipo, a.proponente, pe.id AS pessoa_id,
                coalesce(pe.nome_exibicao, pe.nome_civil) AS pessoa_nome
           FROM canon.proposicao_autor a
           JOIN canon.proposicao p ON p.id = a.proposicao_id
           LEFT JOIN canon.pessoa_vinculo v
             ON v.fonte = p.casa AND v.id_fonte = a.id_fonte
            AND ((p.casa = 'camara' AND a.tipo ILIKE 'deputad%')
              OR (p.casa = 'senado' AND a.tipo = 'SENADOR'))
           LEFT JOIN canon.pessoa pe ON pe.id = v.pessoa_id
          WHERE a.proposicao_id = $1
          ORDER BY a.ordem`,
        [id],
      ),
      this.db.query<{ tema: string }>(
        `SELECT tema FROM canon.proposicao_tema WHERE proposicao_id = $1
          ORDER BY relevancia DESC NULLS LAST, tema`,
        [id],
      ),
    ]);
    return {
      id: p.id,
      casa: p.casa,
      identificacao: p.identificacao,
      siglaTipo: p.sigla_tipo,
      numero: p.numero,
      ano: p.ano,
      descricaoTipo: p.descricao_tipo,
      ementa: p.ementa,
      ementaDetalhada: p.ementa_detalhada,
      apelido: p.apelido,
      apresentadaEm: data(p.apresentada_em),
      situacao: p.situacao,
      situacaoEm: data(p.situacao_em),
      orgao: p.sigla_orgao,
      regime: p.regime,
      tramitando: p.tramitando,
      urlInteiroTeor: p.url_inteiro_teor,
      autores: autores.map((a): Autor => ({
        nome: a.nome,
        tipo: a.tipo,
        proponente: a.proponente,
        pessoa:
          a.pessoa_id && a.pessoa_nome
            ? { id: a.pessoa_id, nome: a.pessoa_nome }
            : null,
      })),
      temas: temas.map((t) => t.tema),
      principal:
        p.principal_id && p.principal_identificacao
          ? { id: p.principal_id, identificacao: p.principal_identificacao }
          : null,
      fonte: { url: FONTE[p.casa] + p.id_fonte },
    };
  }

  async historico(id: string): Promise<Array<ItemTramitacao | ItemVotacao>> {
    const [tramitacoes, votacoesCamara, votacoesSenado] = await Promise.all([
      // O motor destaca algumas etapas como evento (chave_fato =
      // casa:id da proposição:id da etapa); ligamos o item ao evento publicado.
      this.db.query<{
        data: Date;
        sigla_orgao: string | null;
        descricao: string;
        situacao: string | null;
        despacho: string | null;
        url: string | null;
        evento_id: string | null;
      }>(
        `SELECT t.data_hora AT TIME ZONE ${BRASILIA} AS data, t.sigla_orgao, t.descricao,
                t.situacao, t.despacho, t.url,
                (SELECT e.id FROM feed.evento e
                  WHERE e.tipo IN ('tramitacao', 'mudanca_regime')
                    AND e.chave_fato = p.casa || ':' || p.id_fonte || ':' || t.id_fonte
                    AND e.status = 'publicado' AND e.fonte_url IS NOT NULL
                  ORDER BY e.regra_versao DESC LIMIT 1) AS evento_id
           FROM canon.proposicao_tramitacao t
           JOIN canon.proposicao p ON p.id = t.proposicao_id
          WHERE t.proposicao_id = $1
          ORDER BY t.data_hora DESC, t.sequencia DESC`,
        [id],
      ),
      this.db.query<{
        id: string;
        data: Date;
        sigla_orgao: string | null;
        descricao: string | null;
        aprovacao: boolean | null;
        nominal: boolean;
        sim: number;
        nao: number;
        abstencao: number;
        outros: number;
      }>(
        `SELECT v.id, v.registrado_em AT TIME ZONE ${BRASILIA} AS data, v.sigla_orgao,
                v.descricao, v.aprovacao, v.nominal,
                count(*) FILTER (WHERE vo.voto = 'Sim')::integer AS sim,
                count(*) FILTER (WHERE vo.voto = 'Não')::integer AS nao,
                count(*) FILTER (WHERE vo.voto = 'Abstenção')::integer AS abstencao,
                count(*) FILTER (WHERE vo.voto NOT IN ('Sim', 'Não', 'Abstenção'))::integer
                  AS outros
           FROM canon.proposicao p
           JOIN canon.camara_votacao_proposicao vp
             ON vp.proposicao_id = CASE
                  WHEN p.casa = 'camara' AND p.id_fonte ~ '^[0-9]{1,9}$' THEN p.id_fonte::integer
                END
           JOIN canon.camara_votacao v ON v.id = vp.votacao_id
           LEFT JOIN canon.camara_voto vo ON vo.votacao_id = v.id
          WHERE p.id = $1
          GROUP BY v.id`,
        [id],
      ),
      this.db.query<{
        data: Date;
        dia: string;
        descricao: string | null;
        resultado: string | null;
        secreta: boolean;
        total_sim: number | null;
        total_nao: number | null;
        total_abstencao: number | null;
        outros: number;
      }>(
        `SELECT v.data_sessao::timestamp AT TIME ZONE ${BRASILIA} AS data,
                v.data_sessao::text AS dia, coalesce(v.descricao, v.informe_texto) AS descricao,
                v.resultado, v.secreta,
                -- Nem toda votação traz os totais: contamos os votos nominais.
                coalesce(v.total_sim, count(o.*) FILTER (WHERE o.sigla_voto = 'Sim'))::integer
                  AS total_sim,
                coalesce(v.total_nao, count(o.*) FILTER (WHERE o.sigla_voto = 'Não'))::integer
                  AS total_nao,
                coalesce(v.total_abstencao,
                         count(o.*) FILTER (WHERE o.sigla_voto = 'Abstenção'))::integer
                  AS total_abstencao,
                count(o.*) FILTER (WHERE o.sigla_voto LIKE 'Presidente%')::integer AS outros
           FROM canon.proposicao p
           JOIN canon.senado_votacao v
             ON v.id_processo = CASE
                  WHEN p.casa = 'senado' AND p.id_fonte ~ '^[0-9]{1,18}$' THEN p.id_fonte::bigint
                END
           LEFT JOIN canon.senado_voto o ON o.codigo_sessao_votacao = v.codigo_sessao_votacao
          WHERE p.id = $1
          GROUP BY v.codigo_sessao_votacao`,
        [id],
      ),
    ]);
    const itens: Array<ItemTramitacao | ItemVotacao> = tramitacoes.map((t) => ({
      tipo: 'tramitacao',
      data: t.data,
      orgao: t.sigla_orgao,
      descricao: t.descricao,
      situacao: t.situacao,
      despacho: t.despacho,
      url: t.url,
      eventoId: t.evento_id,
    }));
    for (const v of votacoesCamara) {
      const votos = v.sim + v.nao + v.abstencao + v.outros;
      itens.push({
        tipo: 'votacao',
        data: v.data,
        orgao: v.sigla_orgao,
        descricao: v.descricao,
        aprovada: v.aprovacao,
        nominal: v.nominal,
        placar:
          v.nominal && votos > 0
            ? {
                sim: v.sim,
                nao: v.nao,
                abstencao: v.abstencao,
                outros: v.outros,
              }
            : null,
        fonte: {
          url: `https://dadosabertos.camara.leg.br/api/v2/votacoes/${v.id}`,
        },
      });
    }
    for (const v of votacoesSenado) {
      itens.push({
        tipo: 'votacao',
        data: v.data,
        orgao: 'PLEN',
        descricao: v.descricao,
        aprovada:
          v.resultado === 'A' ? true : v.resultado === 'R' ? false : null,
        nominal: !v.secreta,
        placar:
          !v.secreta && (v.total_sim ?? 0) + (v.total_nao ?? 0) > 0
            ? {
                sim: v.total_sim ?? 0,
                nao: v.total_nao ?? 0,
                abstencao: v.total_abstencao ?? 0,
                outros: v.outros,
              }
            : null,
        fonte: {
          url: `https://legis.senado.leg.br/dadosabertos/votacao?dataInicio=${v.dia}&dataFim=${v.dia}`,
        },
      });
    }
    return itens;
  }
}

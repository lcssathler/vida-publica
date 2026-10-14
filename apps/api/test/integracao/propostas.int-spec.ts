import { randomUUID } from 'node:crypto';
import { Db } from '../../src/db/db';
import { PostgresPropostasRepositorio } from '../../src/propostas/postgres-propostas.repositorio';
import {
  ItemTramitacao,
  ItemVotacao,
} from '../../src/propostas/propostas.repositorio';
import { dbDeTeste, Semente } from './banco';

describe('PostgresPropostasRepositorio (integração)', () => {
  let db: Db;
  let semente: Semente;
  let repo: PostgresPropostasRepositorio;
  let proposta: { id: string; idFonte: string };
  let eventoRelator: string;

  beforeAll(async () => {
    db = dbDeTeste();
    semente = new Semente();
    repo = new PostgresPropostasRepositorio(db);
    proposta = await semente.proposicaoComFonte(['Saúde', 'Educação']);
    await semente.tramitacao(proposta.id, {
      idFonte: '1',
      dataHora: '2001-03-01 10:00:00',
      descricao: 'Apresentação de Proposição',
      orgao: 'MESA',
    });
    await semente.tramitacao(proposta.id, {
      idFonte: '2',
      dataHora: '2001-03-05 15:30:00',
      descricao: 'Designação de Relator(a)',
      orgao: 'CSAUDE',
    });
    eventoRelator = await semente.evento({
      tipo: 'tramitacao',
      chaveFato: `camara:${proposta.idFonte}:2`,
      ocorridoEm: '2001-03-05T18:30:00Z',
      alvos: [{ tipo: 'proposicao', id: proposta.id }],
    });
    // Evento segurado da mesma etapa não pode ser ligado.
    await semente.evento({
      tipo: 'tramitacao',
      chaveFato: `camara:${proposta.idFonte}:1`,
      ocorridoEm: '2001-03-01T13:00:00Z',
      status: 'segurado',
    });
    await semente.votacaoCamara(proposta.idFonte, {
      registradoEm: '2001-03-10 20:00:00',
      aprovacao: true,
      votos: ['Sim', 'Sim', 'Não', 'Abstenção', 'Obstrução', 'Artigo 17'],
    });
  });

  afterAll(async () => {
    await semente.limpar();
    await db.fechar();
  });

  it('dados da proposta com temas e fonte', async () => {
    const dados = await repo.proposta(proposta.id);
    expect(dados).toMatchObject({
      casa: 'camara',
      identificacao: 'PL 1/10001',
      ementa: 'Ementa fictícia',
      temas: expect.arrayContaining(['Saúde', 'Educação']) as string[],
      autores: [],
      principal: null,
      fonte: {
        url: `https://dadosabertos.camara.leg.br/api/v2/proposicoes/${proposta.idFonte}`,
      },
    });
    await expect(repo.proposta(randomUUID())).resolves.toBeNull();
  });

  it('histórico: etapas em hora de Brasília, ligadas ao evento publicado, e votação com placar', async () => {
    const itens = await repo.historico(proposta.id);
    const tramitacoes = itens.filter(
      (i): i is ItemTramitacao => i.tipo === 'tramitacao',
    );
    expect(
      tramitacoes.map((t) => [t.descricao, t.data.toISOString(), t.eventoId]),
    ).toEqual([
      ['Designação de Relator(a)', '2001-03-05T18:30:00.000Z', eventoRelator],
      ['Apresentação de Proposição', '2001-03-01T13:00:00.000Z', null],
    ]);
    const [votacao] = itens.filter(
      (i): i is ItemVotacao => i.tipo === 'votacao',
    );
    expect(votacao).toMatchObject({
      aprovada: true,
      nominal: true,
      placar: { sim: 2, nao: 1, abstencao: 1, outros: 2 },
      data: new Date('2001-03-10T23:00:00Z'),
    });
    expect(votacao.fonte.url).toMatch(
      /^https:\/\/dadosabertos\.camara\.leg\.br\/api\/v2\/votacoes\/teste-/,
    );
  });
});

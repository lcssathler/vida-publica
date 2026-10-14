import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppDeTeste, criarApp } from './fakes/app';

interface Resposta {
  identificacao: string;
  seguindo: boolean;
  linhaDoTempo: Array<{
    tipo: string;
    data: string;
    evento?: { tipo: string };
  }>;
}

describe('/propostas (e2e)', () => {
  let t: AppDeTeste;
  const http = () => request(t.app.getHttpServer());
  const id = randomUUID();

  beforeAll(async () => {
    t = await criarApp();
    t.seguindo.cadastrar({ tipo: 'proposicao', id }, 'PL 1/2026');
    t.propostas.propostas.set(id, {
      id,
      casa: 'camara',
      identificacao: 'PL 1/2026',
      siglaTipo: 'PL',
      numero: 1,
      ano: 2026,
      descricaoTipo: 'Projeto de Lei',
      ementa: 'Ementa fictícia',
      ementaDetalhada: null,
      apelido: null,
      apresentadaEm: '2026-01-01',
      situacao: 'Aguardando Parecer',
      situacaoEm: '2026-02-01',
      orgao: 'CSAUDE',
      regime: 'Ordinário',
      tramitando: true,
      urlInteiroTeor: null,
      autores: [],
      temas: ['Saúde'],
      principal: null,
      fonte: { url: 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/1' },
    });
    t.propostas.historicos.set(id, [
      {
        tipo: 'tramitacao',
        data: new Date('2026-01-01T13:00:00Z'),
        orgao: 'MESA',
        descricao: 'Apresentação de Proposição',
        situacao: null,
        despacho: null,
        url: null,
        eventoId: null,
      },
      {
        tipo: 'votacao',
        data: new Date('2026-03-01T20:00:00Z'),
        orgao: 'PLEN',
        descricao: 'Aprovado',
        aprovada: true,
        nominal: true,
        placar: { sim: 300, nao: 100, abstencao: 1, outros: 0 },
        fonte: { url: 'https://dadosabertos.camara.leg.br/api/v2/votacoes/1' },
      },
    ]);
    const alvos = [{ tipo: 'proposicao' as const, id }];
    t.feed.adicionar({
      ocorridoEm: new Date('2026-02-15'),
      tipo: 'pauta',
      alvos,
    });
    // Votos individuais ficam no placar, não na linha do tempo.
    t.feed.adicionar({
      ocorridoEm: new Date('2026-03-01'),
      tipo: 'voto_nominal',
      alvos,
    });
    t.feed.adicionar({
      ocorridoEm: new Date('2026-04-01'),
      tipo: 'pauta',
      status: 'segurado',
      alvos,
    });
  });

  afterAll(async () => {
    await t.app.close();
  });

  it('proposta com linha do tempo do mais recente ao mais antigo', async () => {
    const { authorization } = await t.anonimo();
    const resposta = (
      await http()
        .get(`/propostas/${id}`)
        .set('authorization', authorization)
        .expect(200)
    ).body as Resposta;
    expect(resposta.identificacao).toBe('PL 1/2026');
    expect(resposta.seguindo).toBe(false);
    expect(
      resposta.linhaDoTempo.map((i) =>
        i.evento ? `evento:${i.evento.tipo}` : i.tipo,
      ),
    ).toEqual(['votacao', 'evento:pauta', 'tramitacao']);
  });

  it('marca se o usuário segue a proposta', async () => {
    const { authorization } = await t.anonimo();
    await http()
      .put(`/seguindo/proposicao/${id}`)
      .set('authorization', authorization)
      .expect(200);
    const resposta = (
      await http()
        .get(`/propostas/${id}`)
        .set('authorization', authorization)
        .expect(200)
    ).body as Resposta;
    expect(resposta.seguindo).toBe(true);
  });

  it('404 e 400', async () => {
    const { authorization } = await t.anonimo();
    await http()
      .get(`/propostas/${randomUUID()}`)
      .set('authorization', authorization)
      .expect(404);
    await http()
      .get('/propostas/PL-1-2026')
      .set('authorization', authorization)
      .expect(400);
  });
});

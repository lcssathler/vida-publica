import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppDeTeste, criarApp } from './fakes/app';

interface Perfil {
  nome: string;
  seguindo: boolean;
  partidoAtual: { sigla: string } | null;
  categorias: Array<{ categoria: string; eventos: number }>;
}

describe('perfis (e2e)', () => {
  let t: AppDeTeste;
  const http = () => request(t.app.getHttpServer());
  const pessoa = randomUUID();

  beforeAll(async () => {
    t = await criarApp();
    t.seguindo.cadastrar({ tipo: 'pessoa', id: pessoa }, 'Fulana');
    t.perfis.pessoas.set(pessoa, {
      id: pessoa,
      nome: 'Fulana',
      nomeCivil: 'Fulana de Tal',
      foto: null,
      mandatos: [],
      filiacoes: [
        { sigla: 'NOVO', partidoId: '30', desde: '2024-01-01', ate: null },
        {
          sigla: 'VELHO',
          partidoId: '31',
          desde: '2020-01-01',
          ate: '2023-12-31',
        },
      ],
      candidaturas: [],
    });
    t.perfis.doadoresPorPessoa.set(
      pessoa,
      new Map([
        [
          2026,
          [
            {
              ano: 2026,
              sqCandidato: '1',
              cargo: 'DEPUTADO FEDERAL',
              uf: 'SP',
              partido: 'NOVO',
              total: 15000,
              receitas: 3,
              porOrigem: [],
              comCnpj: [],
              pessoasFisicas: {
                nomeadas: [{ nome: 'DOADORA', total: 12000, doacoes: 1 }],
                outras: { doadores: 2, total: 3000 },
              },
            },
          ],
        ],
        [2022, []],
      ]),
    );
    t.perfis.partidos.set('30', {
      id: '30',
      sigla: 'NOVO',
      nome: 'Partido Novo Fictício',
      numero: 30,
      primeiroAno: 2018,
      ultimoAno: 2026,
      sucessor: null,
      antecessores: [],
      emExercicio: [],
      repasses: [],
    });
    const alvos = [{ tipo: 'pessoa' as const, id: pessoa }];
    t.feed.adicionar({
      ocorridoEm: new Date('2026-01-01'),
      tipo: 'voto_nominal',
      alvos,
    });
    t.feed.adicionar({
      ocorridoEm: new Date('2026-01-02'),
      tipo: 'presenca',
      alvos,
    });
    t.feed.adicionar({
      ocorridoEm: new Date('2026-01-03'),
      tipo: 'doacao',
      visibilidade: 'seguidores',
      alvos,
    });
  });

  afterAll(async () => {
    await t.app.close();
  });

  const contagem = (p: Perfil) =>
    Object.fromEntries(p.categorias.map((c) => [c.categoria, c.eventos]));

  it('perfil por categoria respeita a visibilidade de quem segue', async () => {
    const { authorization } = await t.anonimo();
    const antes = (
      await http()
        .get(`/pessoas/${pessoa}`)
        .set('authorization', authorization)
        .expect(200)
    ).body as Perfil;
    expect(antes).toMatchObject({
      nome: 'Fulana',
      seguindo: false,
      partidoAtual: { sigla: 'NOVO' },
    });
    expect(contagem(antes)).toMatchObject({
      votos: 1,
      presenca: 1,
      campanha: 0,
    });

    await http()
      .put(`/seguindo/pessoa/${pessoa}`)
      .set('authorization', authorization)
      .expect(200);
    const depois = (
      await http()
        .get(`/pessoas/${pessoa}`)
        .set('authorization', authorization)
        .expect(200)
    ).body as Perfil;
    expect(depois.seguindo).toBe(true);
    expect(contagem(depois).campanha).toBe(1);
  });

  it('eventos da pessoa por categoria', async () => {
    const { authorization } = await t.anonimo();
    const resposta = await http()
      .get(`/pessoas/${pessoa}/eventos?categoria=presenca`)
      .set('authorization', authorization)
      .expect(200);
    expect(
      (resposta.body as { itens: Array<{ tipo: string }> }).itens,
    ).toMatchObject([{ tipo: 'presenca' }]);
    await http()
      .get(`/pessoas/${pessoa}/eventos?categoria=fofoca`)
      .set('authorization', authorization)
      .expect(400);
  });

  it('doadores do ano mais recente, com o limite e a fonte', async () => {
    const { authorization } = await t.anonimo();
    const resposta = await http()
      .get(`/pessoas/${pessoa}/doadores`)
      .set('authorization', authorization)
      .expect(200);
    expect(resposta.body).toMatchObject({
      ano: 2026,
      limiteNomePessoaFisica: 10000,
      fonte: { url: expect.stringContaining('candidatos_2026.zip') as string },
      candidaturas: [{ pessoasFisicas: { outras: { doadores: 2 } } }],
    });
    await http()
      .get(`/pessoas/${pessoa}/doadores?ano=2018`)
      .set('authorization', authorization)
      .expect(404);
  });

  it('perfil de partido e 404/400', async () => {
    const { authorization } = await t.anonimo();
    const resposta = await http()
      .get('/partidos/30')
      .set('authorization', authorization)
      .expect(200);
    expect(resposta.body).toMatchObject({ sigla: 'NOVO', seguindo: false });
    await http()
      .get('/partidos/31')
      .set('authorization', authorization)
      .expect(404);
    await http()
      .get('/partidos/NOVO')
      .set('authorization', authorization)
      .expect(400);
    await http()
      .get(`/pessoas/${randomUUID()}`)
      .set('authorization', authorization)
      .expect(404);
  });

  it('parlamentares do estado dizem quem o usuário já segue', async () => {
    t.perfis.emExercicio.push(
      {
        id: pessoa,
        nome: 'Fulana',
        casa: 'camara',
        cargo: 'Deputada Federal',
        uf: 'SP',
        partido: 'NOVO',
        foto: null,
      },
      {
        id: randomUUID(),
        nome: 'Beltrano',
        casa: 'senado',
        cargo: 'Senador',
        uf: 'RJ',
        partido: null,
        foto: null,
      },
    );
    const { authorization } = await t.anonimo();
    await http()
      .put(`/seguindo/pessoa/${pessoa}`)
      .set('authorization', authorization)
      .expect(200);
    const resposta = await http()
      .get('/parlamentares?uf=SP')
      .set('authorization', authorization)
      .expect(200);
    expect(resposta.body).toEqual({
      itens: [expect.objectContaining({ nome: 'Fulana', seguindo: true })],
    });
    await http()
      .get('/parlamentares?uf=XX')
      .set('authorization', authorization)
      .expect(400);
    await http().get('/parlamentares?uf=SP').expect(401);
  });
});

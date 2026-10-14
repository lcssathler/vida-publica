import { createHash, randomUUID } from 'node:crypto';
import { Db } from '../../src/db/db';
import { PostgresPerfisRepositorio } from '../../src/perfis/postgres-perfis.repositorio';
import { dbDeTeste, Semente } from './banco';

const PF: [number, string] = [10010200, 'Recursos de pessoas físicas'];
const PROPRIOS: [number, string] = [10010100, 'Recursos próprios'];
const PARTIDO: [number, string] = [10020000, 'Recursos de partido político'];
const cpfHash = () => createHash('sha256').update(randomUUID()).digest('hex');

describe('PostgresPerfisRepositorio (integração)', () => {
  let db: Db;
  let semente: Semente;
  let repo: PostgresPerfisRepositorio;
  const ano = 10002;
  let pessoa: string;
  let partido: string;
  const sigla = `TP${randomUUID().slice(0, 4).toUpperCase()}`;
  let sq: string;
  const idCamara = 900_000_000 + Math.floor(Math.random() * 1e6);

  beforeAll(async () => {
    db = dbDeTeste();
    semente = new Semente();
    repo = new PostgresPerfisRepositorio(db);
    pessoa = await semente.pessoa('Candidata Fictícia');
    partido = await semente.partido(sigla);
    await semente.filiacao(pessoa, partido, sigla, '2020-01-01');
    await semente.filiacao(
      pessoa,
      partido,
      'ANTIGO',
      '2010-01-01',
      '2019-12-31',
    );
    sq = await semente.candidatura(pessoa, ano, { partido: sigla });

    // Doadora A: duas doações somando R$ 12 mil (nomeada).
    const a = cpfHash();
    await semente.receita({
      ano,
      sq,
      valor: 7000,
      origem: PF,
      nome: 'DOADORA A',
      sqReceita: 1,
      cpfHash: a,
    });
    await semente.receita({
      ano,
      sq,
      valor: 5000,
      origem: PF,
      nome: 'DOADORA A',
      sqReceita: 2,
      cpfHash: a,
    });
    // Doador B: exatamente R$ 10 mil (não nomeado: só acima do limite).
    await semente.receita({
      ano,
      sq,
      valor: 10000,
      origem: PF,
      nome: 'DOADOR B',
      sqReceita: 3,
      cpfHash: cpfHash(),
    });
    // Doador C: a prestação parcial dizia R$ 20 mil, a final corrigiu para R$ 300.
    const c = cpfHash();
    await semente.receita({
      ano,
      sq,
      valor: 20000,
      origem: PF,
      nome: 'DOADOR C',
      sqReceita: 4,
      cpfHash: c,
      prestacao: 'PARCIAL',
    });
    await semente.receita({
      ano,
      sq,
      valor: 300,
      origem: PF,
      nome: 'DOADOR C',
      sqReceita: 4,
      cpfHash: c,
      prestacao: 'FINAL',
    });
    // Recursos próprios (CPF da candidata): origem, não doador.
    await semente.receita({
      ano,
      sq,
      valor: 50000,
      origem: PROPRIOS,
      nome: 'CANDIDATA FICTÍCIA',
      sqReceita: 5,
      cpfHash: cpfHash(),
    });
    // Partido: doador com CNPJ.
    await semente.receita({
      ano,
      sq,
      valor: 80000,
      origem: PARTIDO,
      nome: 'DIRETÓRIO FICTÍCIO',
      sqReceita: 6,
      cnpj: '00000000000191',
    });

    await semente.vinculo(pessoa, 'camara', String(idCamara));
    await semente.despesaCamara(idCamara, 10001, 'COMBUSTÍVEIS', 100.5);
    await semente.despesaCamara(idCamara, 10001, 'COMBUSTÍVEIS', 50);
    await semente.despesaCamara(idCamara, 10001, 'PASSAGENS', 900);
    await semente.despesaCamara(idCamara, 10000, 'PASSAGENS', 10);
    await semente.despesaCamara(idCamara, 9999, 'PASSAGENS', 1);
  });

  afterAll(async () => {
    await semente.limpar();
    await db.fechar();
  });

  it('parlamentares em exercício do estado: senado primeiro, sem quem saiu', async () => {
    const uf = 'ZZ';
    const deputada = await semente.pessoa('Beatriz Fictícia');
    await semente.deputado(deputada, { uf, partido: 'TST' });
    const senador = await semente.pessoa('Carlos Fictício');
    await semente.senador(senador, { uf });
    const licenciado = await semente.pessoa('Ana Fictícia');
    await semente.deputado(licenciado, { uf, situacao: 'Fim de Mandato' });
    const exSenador = await semente.pessoa('Abel Fictício');
    await semente.senador(exSenador, { uf, emExercicio: false });

    const lista = await repo.parlamentares(uf);
    expect(lista).toEqual([
      {
        id: senador,
        nome: 'Carlos Fictício',
        casa: 'senado',
        cargo: 'Senador',
        uf,
        partido: 'TST',
        foto: null,
      },
      {
        id: deputada,
        nome: 'Beatriz Fictícia',
        casa: 'camara',
        cargo: 'Deputada Federal',
        uf,
        partido: 'TST',
        foto: {
          url: 'https://exemplo.invalid/d.jpg',
          credito: 'Câmara dos Deputados',
        },
      },
    ]);
    expect(await repo.parlamentares('ZY')).toEqual([]);
  });

  it('dados da pessoa com filiações e candidaturas', async () => {
    const dados = await repo.pessoa(pessoa);
    expect(dados).toMatchObject({
      nome: 'Candidata Fictícia',
      foto: null,
      mandatos: [],
      filiacoes: [
        { sigla, partidoId: partido, desde: '2020-01-01', ate: null },
        { sigla: 'ANTIGO', ate: '2019-12-31' },
      ],
      candidaturas: [
        {
          ano,
          sqCandidato: sq,
          cargo: 'DEPUTADO FEDERAL',
          resultado: 'ELEITO',
        },
      ],
    });
    await expect(repo.pessoa(randomUUID())).resolves.toBeNull();
    await expect(repo.anosDeCandidatura(pessoa)).resolves.toEqual([ano]);
  });

  it('doadores: pessoa física nomeada só acima de R$ 10 mil, pela prestação vigente', async () => {
    const [candidatura] = await repo.doadores(pessoa, ano);
    expect(candidatura.pessoasFisicas.nomeadas).toEqual([
      { nome: 'DOADORA A', total: 12000, doacoes: 2 },
    ]);
    expect(candidatura.pessoasFisicas.outras).toEqual({
      doadores: 2,
      total: 10300,
    });
    expect(candidatura.comCnpj).toEqual([
      {
        nome: 'DIRETÓRIO FICTÍCIO',
        cnpj: '00000000000191',
        total: 80000,
        receitas: 1,
      },
    ]);
    expect(candidatura.porOrigem).toEqual([
      { origem: 'Recursos de partido político', total: 80000, receitas: 1 },
      { origem: 'Recursos próprios', total: 50000, receitas: 1 },
      { origem: 'Recursos de pessoas físicas', total: 22300, receitas: 4 },
    ]);
    expect(candidatura.total).toBe(152300);
    // Nada de CPF nem hash na resposta.
    expect(JSON.stringify(candidatura)).not.toMatch(/[0-9a-f]{64}/);
  });

  it('a visão do canon nunca entrega nome até R$ 10 mil nem o hash do CPF', async () => {
    const linhas = await db.query<Record<string, unknown>>(
      `SELECT * FROM canon.tse_doador_pessoa_fisica
        WHERE ano_eleicao = $1 AND sq_candidato = $2 ORDER BY total DESC`,
      [ano, sq],
    );
    expect(linhas.map((l) => Object.keys(l).sort())[0]).toEqual([
      'ano_eleicao',
      'doacoes',
      'doador_nome',
      'sq_candidato',
      'total',
    ]);
    expect(linhas.map((l) => [l.doador_nome, Number(l.total)])).toEqual([
      ['DOADORA A', 12000],
      [null, 10000],
      [null, 300],
    ]);
  });

  it('gastos da cota nos anos mais recentes, por categoria', async () => {
    const gastos = await repo.gastos(pessoa, 2);
    expect(gastos).toEqual([
      {
        ano: 10001,
        casa: 'camara',
        total: 1050.5,
        documentos: 3,
        categorias: [
          { categoria: 'PASSAGENS', total: 900 },
          { categoria: 'COMBUSTÍVEIS', total: 150.5 },
        ],
      },
      {
        ano: 10000,
        casa: 'camara',
        total: 10,
        documentos: 1,
        categorias: [{ categoria: 'PASSAGENS', total: 10 }],
      },
    ]);
  });

  it('dados do partido', async () => {
    const dados = await repo.partido(partido);
    expect(dados).toMatchObject({
      id: partido,
      sigla,
      numero: 99,
      sucessor: null,
      antecessores: [],
      emExercicio: [],
      repasses: [],
    });
    await expect(repo.partido('999999999')).resolves.toBeNull();
  });
});

import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import PerfilDePartido from '../app/partido/[id]';
import PerfilDePessoa from '../app/pessoa/[id]';
import { capitalizar, plural } from '../comum/formato';
import { evento } from '../test/fabricas';
import { renderizar } from '../test/renderizar';

const mockRoteador = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true };
const mockParametros: { id: string } = { id: 'p1' };
jest.mock('expo-router', () => ({
  useRouter: () => mockRoteador,
  useLocalSearchParams: () => mockParametros,
}));

beforeEach(() => jest.clearAllMocks());

const categorias = [
  { categoria: 'votos', eventos: 2, porTipo: { voto_nominal: 2 } },
  { categoria: 'presenca', eventos: 0, porTipo: {} },
  { categoria: 'gastos', eventos: 1, porTipo: { despesa_mensal: 1 } },
  { categoria: 'propostas', eventos: 0, porTipo: {} },
  { categoria: 'campanha', eventos: 0, porTipo: {} },
  { categoria: 'eleicoes', eventos: 0, porTipo: {} },
];

const pessoa = {
  id: 'p1',
  nome: 'Maria Exemplo',
  nomeCivil: 'MARIA EXEMPLO DA SILVA',
  foto: { url: 'http://exemplo.invalid/f.jpg', credito: 'Câmara dos Deputados' },
  mandatos: [
    { casa: 'camara', cargo: 'Deputada Federal', uf: 'SP', legislatura: 57, condicao: 'Titular', inicio: '2023-02-01', fim: null, emExercicio: true },
  ],
  filiacoes: [{ sigla: 'AAA', partidoId: '30', desde: '2023-02-01', ate: null }],
  candidaturas: [
    {
      ano: 2026,
      turno: 1,
      sqCandidato: '1',
      cargo: 'DEPUTADO FEDERAL',
      uf: 'SP',
      nomeUrna: 'MARIA',
      numero: 1234,
      partido: { id: '30', sigla: 'AAA' },
      situacao: null,
      resultado: 'ELEITO',
    },
  ],
  partidoAtual: { id: '30', sigla: 'AAA' },
  seguindo: false,
  categorias,
  gastos: [
    { ano: 2026, casa: 'camara', total: 1000.5, documentos: 1, categorias: [{ categoria: 'COMBUSTÍVEIS E LUBRIFICANTES.', total: 1000.5 }] },
  ],
  anosDeCampanha: [2026],
};

const doadores = {
  ano: 2026,
  limiteNomePessoaFisica: 10000,
  fonte: { url: 'https://cdn.tse.jus.br/x_2026.zip' },
  candidaturas: [
    {
      ano: 2026,
      sqCandidato: '1',
      cargo: 'DEPUTADO FEDERAL',
      uf: 'SP',
      partido: 'AAA',
      total: 50000,
      receitas: 5,
      porOrigem: [{ origem: 'Recursos de pessoas físicas', total: 50000, receitas: 5 }],
      comCnpj: [],
      pessoasFisicas: {
        nomeadas: [{ nome: 'DOADORA FICTÍCIA', total: 12000, doacoes: 2 }],
        outras: { doadores: 3, total: 38000 },
      },
    },
  ],
};

describe('Perfil de pessoa', () => {
  const rotas = {
    'GET /pessoas/p1': { corpo: pessoa },
    'GET /pessoas/p1/doadores?ano=2026': { corpo: doadores },
    'GET /pessoas/p1/eventos': { corpo: { itens: [evento({ titulo: 'Voto da Maria' })], proximoCursor: null } },
    'GET /seguindo': { corpo: { itens: [] } },
    'PUT /seguindo/pessoa/p1': { corpo: { seguindo: true } },
  };

  it('mostra mandato, partido, cota e doadores como a API entrega', async () => {
    await renderizar(<PerfilDePessoa />, { rotas });
    expect(await screen.findByRole('heading', { name: 'Maria Exemplo' })).toBeOnTheScreen();
    expect(screen.getByText('Maria Exemplo da Silva')).toBeOnTheScreen();
    expect(screen.getByText('Deputada Federal · SP · AAA')).toBeOnTheScreen();
    expect(screen.getByText('Foto: Câmara dos Deputados')).toBeOnTheScreen();
    expect(screen.queryByText('Combustíveis e Lubrificantes')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Mandatos, partidos, gastos e campanha' }));
    expect(screen.getByText('Combustíveis e Lubrificantes')).toBeOnTheScreen();
    expect(screen.getByText('1 documento')).toBeOnTheScreen();
    expect(await screen.findByText('DOADORA FICTÍCIA')).toBeOnTheScreen();
    expect(screen.getByText('Outras 3 pessoas físicas')).toBeOnTheScreen();
    expect(screen.getByText('Não nomeadas: até R$ 10.000,00 cada, somado na candidatura.')).toBeOnTheScreen();
    expect(screen.getByText('R$ 38.000,00')).toBeOnTheScreen();
  });

  it('linha do tempo por categoria: só as que têm registros, com a contagem', async () => {
    const { api } = await renderizar(<PerfilDePessoa />, { rotas });
    expect(await screen.findByText('Voto da Maria')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Tudo, 3 registros' })).toBeChecked();
    expect(screen.queryByRole('radio', { name: /Presença/ })).toBeNull();
    await fireEvent.press(screen.getByRole('radio', { name: 'Votos, 2 registros' }));
    await waitFor(() => expect(api.pedidos.at(-1)?.caminho).toBe('/pessoas/p1/eventos?limite=20&categoria=votos'));
  });

  it('segue a pessoa e abre o partido', async () => {
    const { api } = await renderizar(<PerfilDePessoa />, { rotas });
    await fireEvent.press(await screen.findByRole('checkbox', { name: 'Seguir Maria Exemplo' }));
    await waitFor(() => expect(api.pedidos.some((p) => p.metodo === 'PUT' && p.caminho === '/seguindo/pessoa/p1')).toBe(true));
    await fireEvent.press(screen.getByRole('button', { name: 'Mandatos, partidos, gastos e campanha' }));
    await fireEvent.press(screen.getByRole('link', { name: 'Partido AAA' }));
    expect(mockRoteador.push).toHaveBeenCalledWith({ pathname: '/partido/[id]', params: { id: '30' } });
  });
});

describe('Perfil de partido', () => {
  it('mostra história, parlamentares e repasses, e abre a pessoa', async () => {
    mockParametros.id = '30';
    await renderizar(<PerfilDePartido />, {
      rotas: {
        'GET /partidos/30': {
          corpo: {
            id: '30',
            sigla: 'AAA',
            nome: 'PARTIDO EXEMPLO',
            numero: 99,
            primeiroAno: 2018,
            ultimoAno: 2026,
            sucessor: null,
            antecessores: [{ id: '31', sigla: 'BBB', tipo: 'Fusão', ano: 2022 }],
            emExercicio: [{ id: 'p1', nome: 'Maria Exemplo', casa: 'camara', cargo: 'Deputada Federal', uf: 'SP' }],
            repasses: [{ ano: 2026, fonte: 'fundo_especial', esfera: 'F', total: 1000, repasses: 1, candidatos: 1 }],
            seguindo: false,
            categorias,
          },
        },
        'GET /partidos/30/eventos': { corpo: { itens: [], proximoCursor: null } },
        'GET /seguindo': { corpo: { itens: [] } },
      },
    });
    expect(await screen.findByRole('heading', { name: 'AAA' })).toBeOnTheScreen();
    expect(screen.getByText('Partido Exemplo')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'História, parlamentares e repasses' }));
    expect(screen.getByText('2026 · Fundo Eleitoral (FEFC)')).toBeOnTheScreen();
    expect(screen.getByText('Pelos diretórios estaduais · 1 repasse a 1 candidatura')).toBeOnTheScreen();
    expect(await screen.findByText('Nenhum registro publicado ainda.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('link', { name: 'Maria Exemplo, Deputada Federal, SP' }));
    expect(mockRoteador.push).toHaveBeenCalledWith({ pathname: '/pessoa/[id]', params: { id: 'p1' } });
    await fireEvent.press(screen.getByRole('link', { name: 'BBB' }));
    expect(mockRoteador.push).toHaveBeenCalledWith({ pathname: '/partido/[id]', params: { id: '31' } });
  });
});

describe('texto', () => {
  it('capitaliza em português e corrige vírgula solta', () => {
    expect(capitalizar('HOSPEDAGEM ,EXCETO DO PARLAMENTAR NO DISTRITO FEDERAL')).toBe(
      'Hospedagem, Exceto do Parlamentar no Distrito Federal',
    );
    expect(capitalizar('LOCAÇÃO OU FRETAMENTO DE VEÍCULOS')).toBe('Locação ou Fretamento de Veículos');
    expect(plural(1, 'repasse', 'repasses')).toBe('1 repasse');
    expect(plural(1200, 'repasse', 'repasses')).toBe('1.200 repasses');
  });
});

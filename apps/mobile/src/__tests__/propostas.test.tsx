import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';
import DetalheDaProposta from '../app/proposta/[id]';
import type { ItemLinhaDoTempo } from '../api/tipos';
import { rotaDoAlvo } from '../perfis/rotas';
import { situacaoMudou } from '../propostas/linha';
import { evento } from '../test/fabricas';
import { renderizar } from '../test/renderizar';

const mockRoteador = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true };
jest.mock('expo-router', () => ({
  useRouter: () => mockRoteador,
  useLocalSearchParams: () => ({ id: 'pl1' }),
}));

beforeEach(() => jest.clearAllMocks());

const tramitacao = (data: string, situacao: string, extra: Partial<ItemLinhaDoTempo> = {}) =>
  ({
    tipo: 'tramitacao',
    data,
    orgao: 'PLEN',
    descricao: `Etapa de ${data.slice(0, 10)}`,
    situacao,
    despacho: null,
    url: null,
    eventoId: null,
    ...extra,
  }) as ItemLinhaDoTempo;

const proposta = {
  id: 'pl1',
  casa: 'camara',
  identificacao: 'PL 1/2026',
  siglaTipo: 'PL',
  numero: 1,
  ano: 2026,
  descricaoTipo: 'Projeto de Lei',
  ementa: 'Ementa fictícia.',
  ementaDetalhada: null,
  apelido: null,
  apresentadaEm: '2026-03-23',
  situacao: 'Aguardando Sanção',
  situacaoEm: '2026-09-04',
  orgao: 'MESA',
  regime: 'Urgência',
  tramitando: true,
  urlInteiroTeor: 'https://www.camara.leg.br/inteiro-teor',
  autores: [
    { nome: 'Maria Exemplo', tipo: 'Deputado(a)', proponente: true, pessoa: { id: 'p1', nome: 'Maria Exemplo' } },
    { nome: 'Poder Executivo', tipo: 'Órgão do Poder Executivo', proponente: true, pessoa: null },
  ],
  temas: ['Saúde', 'Educação'],
  principal: { id: 'pl0', identificacao: 'PL 0/2025' },
  fonte: { url: 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/1' },
  seguindo: false,
  linhaDoTempo: [
    tramitacao('2026-09-04T18:00:00.000Z', 'Aguardando Sanção', { eventoId: 'ev-tram', despacho: 'Remessa à sanção.' }),
    {
      tipo: 'votacao',
      data: '2026-09-03T20:28:00.000Z',
      orgao: 'PLEN',
      descricao: 'Aprovada a subemenda.',
      aprovada: true,
      nominal: true,
      placar: { sim: 346, nao: 46, abstencao: 3, outros: 1 },
      fonte: { url: 'https://dadosabertos.camara.leg.br/api/v2/votacoes/1-1' },
    },
    { tipo: 'evento', data: '2026-09-03T18:55:00.000Z', evento: evento({ id: 'ev-pauta', tipo: 'pauta', titulo: 'PL 1/2026 na pauta do Plenário' }) },
    tramitacao('2026-09-02T18:00:00.000Z', 'Pronta para Pauta'),
    tramitacao('2026-09-01T18:00:00.000Z', 'Pronta para Pauta'),
  ],
};

describe('Proposta', () => {
  it('mostra dados, autores, temas e a linha do tempo com placar', async () => {
    await renderizar(<DetalheDaProposta />, {
      rotas: { 'GET /propostas/pl1': { corpo: proposta }, 'GET /seguindo': { corpo: { itens: [] } } },
    });
    expect(await screen.findByRole('heading', { name: 'PL 1/2026' })).toBeOnTheScreen();
    expect(screen.getByText('Câmara · Projeto de Lei')).toBeOnTheScreen();
    expect(screen.getByText('Aguardando Sanção')).toBeOnTheScreen();
    expect(screen.getByText('Saúde · Educação')).toBeOnTheScreen();
    expect(screen.getByText('Poder Executivo')).toBeOnTheScreen();
    expect(screen.getByLabelText('Placar: Sim 346 · Não 46 · Abstenção 3 · Outros 1')).toBeOnTheScreen();
    expect(screen.getByText('Subemenda: aprovada')).toBeOnTheScreen();
    expect(screen.getByText('Votação · PLEN · nominal')).toBeOnTheScreen();
    expect(screen.getByText('PL 1/2026 na pauta do Plenário')).toBeOnTheScreen();
    // A situação aparece só onde mudou: "Pronta para Pauta" uma vez (na etapa mais antiga).
    expect(screen.getAllByText(/^Situação passa a ser:/)).toHaveLength(2);
  });

  it('autor parlamentar, proposta principal, registros e fontes levam adiante', async () => {
    const abrir = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const { api } = await renderizar(<DetalheDaProposta />, {
      rotas: {
        'GET /propostas/pl1': { corpo: proposta },
        'GET /seguindo': { corpo: { itens: [] } },
        'PUT /seguindo/proposicao/pl1': { corpo: { seguindo: true } },
      },
    });
    await fireEvent.press(await screen.findByRole('link', { name: 'Maria Exemplo' }));
    expect(mockRoteador.push).toHaveBeenLastCalledWith({ pathname: '/pessoa/[id]', params: { id: 'p1' } });
    await fireEvent.press(screen.getByRole('link', { name: 'PL 0/2025' }));
    expect(mockRoteador.push).toHaveBeenLastCalledWith({ pathname: '/proposta/[id]', params: { id: 'pl0' } });
    await fireEvent.press(screen.getAllByRole('link', { name: 'Abre o registro desta etapa no feed' })[0]);
    expect(mockRoteador.push).toHaveBeenLastCalledWith({ pathname: '/evento/[id]', params: { id: 'ev-tram' } });
    await fireEvent.press(screen.getByRole('link', { name: 'Abre a votação nos dados abertos' }));
    expect(abrir).toHaveBeenLastCalledWith('https://dadosabertos.camara.leg.br/api/v2/votacoes/1-1');
    await fireEvent.press(screen.getByRole('button', { name: 'Inteiro teor' }));
    expect(abrir).toHaveBeenLastCalledWith('https://www.camara.leg.br/inteiro-teor');
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Seguir PL 1/2026' }));
    await waitFor(() => expect(api.pedidos.some((p) => p.metodo === 'PUT' && p.caminho === '/seguindo/proposicao/pl1')).toBe(true));
  });
});

describe('linha da proposta', () => {
  it('situação só onde mudou', () => {
    const itens = [
      tramitacao('2026-09-04T00:00:00Z', 'B'),
      tramitacao('2026-09-03T00:00:00Z', 'A'),
      tramitacao('2026-09-02T00:00:00Z', 'A'),
    ];
    expect(itens.map((_, i) => situacaoMudou(itens, i))).toEqual([true, false, true]);
  });

  it('proposta tem tela própria; assunto não', () => {
    expect(rotaDoAlvo({ tipo: 'proposicao', id: 'x' })).toEqual({ pathname: '/proposta/[id]', params: { id: 'x' } });
    expect(rotaDoAlvo({ tipo: 'assunto', id: 'Saúde' })).toBeNull();
  });
});

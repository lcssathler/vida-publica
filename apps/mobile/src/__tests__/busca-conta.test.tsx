import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import Busca from '../app/(abas)/busca';
import ContaTela from '../app/(abas)/conta';
import Seguindo from '../app/(abas)/seguindo';
import { entrar, LoginCancelado } from '../conta/login';
import { pedirPermissaoDoSistema } from '../notificacoes/permissao';
import { apiFalsa, cofreEmMemoria } from '../test/apiFalsa';
import { renderizar } from '../test/renderizar';
import { ClienteApi } from '../api/cliente';
import * as Apple from 'expo-apple-authentication';

const mockApple = jest.mocked(Apple);

const mockRoteador = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), navigate: jest.fn(), canGoBack: () => true };
jest.mock('expo-router', () => ({ useRouter: () => mockRoteador }));
jest.mock('../notificacoes/permissao', () => ({ pedirPermissaoDoSistema: jest.fn() }));
jest.mock('expo-apple-authentication', () => ({ signInAsync: jest.fn(), isAvailableAsync: jest.fn(async () => true) }));

beforeEach(() => jest.clearAllMocks());

const resultado = {
  q: 'sao paulo',
  pessoas: Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, nome: `Pessoa ${i}`, detalhe: 'Deputado Federal · SP', seguindo: false })),
  partidos: [{ id: '9', sigla: 'VELHO', nome: 'Partido Velho', sucessor: { id: '10', sigla: 'NOVO' }, seguindo: false }],
  propostas: [{ id: 'pl1', identificacao: 'PL 1/2026', ementa: 'Ementa.', situacao: 'Em tramitação', seguindo: false }],
  assuntos: [],
};

describe('Busca', () => {
  it('busca sem acento enquanto digita, agrupa e expande um grupo', async () => {
    const { api } = await renderizar(<Busca />, {
      local: { uf: null },
      rotas: {
        'GET /seguindo': { corpo: { itens: [] } },
        'GET /assuntos': { corpo: { itens: [] } },
        'GET /busca?q=sao%20paulo': { corpo: resultado },
        'GET /busca?q=sao%20paulo&tipo=pessoa&limite=50': { corpo: { ...resultado, pessoas: resultado.pessoas.slice(0, 1), partidos: [], propostas: [] } },
      },
    });
    await fireEvent.changeText(screen.getByLabelText('Buscar'), 's');
    expect(screen.getByText('Digite ao menos 2 letras.')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('Buscar'), 'sao paulo');
    expect(await screen.findByText('7 resultados')).toBeOnTheScreen();
    expect(screen.getByText('Partido Velho · hoje NOVO')).toBeOnTheScreen();
    expect(api.pedidos.filter((p) => p.caminho.startsWith('/busca')).map((p) => p.caminho)).toEqual(['/busca?q=sao%20paulo']);

    await fireEvent.press(screen.getByRole('button', { name: 'Ver mais pessoas' }));
    expect(await screen.findByText('1 resultado em pessoas')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('link', { name: 'Pessoa 0' }));
    expect(mockRoteador.push).toHaveBeenCalledWith({ pathname: '/pessoa/[id]', params: { id: 'p0' } });
  });

  it('limite da busca (429) aparece com o tempo de espera', async () => {
    await renderizar(<Busca />, {
      local: { uf: null },
      rotas: {
        'GET /seguindo': { corpo: { itens: [] } },
        'GET /assuntos': { corpo: { itens: [] } },
        'GET /busca?q=lula': { status: 429, cabecalhos: { 'Retry-After': '40' } },
      },
    });
    await fireEvent.changeText(screen.getByLabelText('Buscar'), 'lula');
    expect(await screen.findByText('Muitas requisições. Tente de novo em 40 s.')).toBeOnTheScreen();
  });

  it('sem texto, explora quem representa o estado', async () => {
    const parlamentares = Array.from({ length: 8 }, (_, i) => ({
      id: `d${i}`,
      nome: `Deputada ${i}`,
      casa: 'camara',
      cargo: 'Deputada Federal',
      uf: 'BA',
      partido: 'AAA',
      foto: null,
      seguindo: false,
    }));
    await renderizar(<Busca />, {
      local: { uf: 'BA' },
      rotas: {
        'GET /seguindo': { corpo: { itens: [] } },
        'GET /assuntos': { corpo: { itens: [{ nome: 'Saúde', proposicoes: 3 }] } },
        'GET /parlamentares?uf=BA': { corpo: { itens: parlamentares } },
      },
    });
    expect(await screen.findByText('Quem representa Bahia')).toBeOnTheScreen();
    await fireEvent.press(await screen.findByRole('button', { name: 'Ver todos os 8' }));
    expect(screen.getByText('Deputada 7')).toBeOnTheScreen();
    expect(await screen.findByText('3 propostas')).toBeOnTheScreen();
  });
});

describe('Seguindo', () => {
  it('agrupa por tipo, deixa de seguir e desfaz', async () => {
    let itens = [
      { tipo: 'pessoa', id: 'p1', nome: 'Maria Exemplo', detalhe: 'Deputada Federal · SP', desde: '2026-10-01' },
      { tipo: 'assunto', id: 'Saúde', nome: 'Saúde', detalhe: null, desde: '2026-10-01' },
    ];
    const { api } = await renderizar(<Seguindo />, {
      rotas: {
        'GET /seguindo': () => ({ corpo: { itens } }),
        'DELETE /seguindo/pessoa/p1': () => {
          itens = itens.filter((i) => i.id !== 'p1');
          return { status: 204 };
        },
        'PUT /seguindo/pessoa/p1': () => ({ corpo: { seguindo: true } }),
      },
    });
    expect(await screen.findByText('Pessoas · 1')).toBeOnTheScreen();
    expect(screen.getByText('Assuntos · 1')).toBeOnTheScreen();
    expect(screen.getByText(/^2 de 500 itens/)).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('checkbox', { name: 'Seguir Maria Exemplo' }));
    expect(await screen.findByText('Você deixou de seguir Maria Exemplo.')).toBeOnTheScreen();
    await waitFor(() => expect(api.pedidos.some((p) => p.metodo === 'DELETE')).toBe(true));
    await fireEvent.press(screen.getByRole('button', { name: 'Desfazer' }));
    await waitFor(() => expect(api.pedidos.some((p) => p.metodo === 'PUT' && p.caminho === '/seguindo/pessoa/p1')).toBe(true));
  });
});

describe('Conta', () => {
  const preferencias = {
    uf: 'SP',
    notificacoes: false,
    resumoSemanal: true,
    maxPorDia: 5,
    silencioInicio: '22:00',
    silencioFim: '07:00',
    fuso: 'America/Sao_Paulo',
  };
  const conta = {
    usuarioId: 'usuario-1',
    criadaEm: '2026-10-14T12:00:00.000Z',
    identidades: [],
    seguindo: 2,
    sessoesAtivas: 1,
    anonima: true,
    preferencias,
  };
  const rotas = {
    'GET /conta': { corpo: conta },
    'PATCH /conta/preferencias': (p: { corpo: unknown }) => ({ corpo: { ...preferencias, ...(p.corpo as object) } }),
    'DELETE /conta': { status: 204 },
  };

  it('ligar avisos pede a permissão e liga o registro; desligar apaga o token na API', async () => {
    jest.mocked(pedirPermissaoDoSistema).mockResolvedValue(true);
    const { api, local } = await renderizar(<ContaTela />, {
      rotas: { ...rotas, 'DELETE /dispositivo': { status: 204 } },
    });
    await fireEvent.press(await screen.findByRole('switch', { name: 'Avisos do que você segue' }));
    await waitFor(() => expect(api.pedidos.at(-1)).toMatchObject({ metodo: 'PATCH', corpo: { notificacoes: true } }));
    expect(local().avisos).toBe(true);
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Avisos do que você segue' })).toBeChecked());
    await fireEvent.press(screen.getByRole('switch', { name: 'Avisos do que você segue' }));
    await waitFor(() => expect(api.pedidos.some((p) => p.metodo === 'DELETE' && p.caminho === '/dispositivo')).toBe(true));
    expect(api.pedidos.some((p) => p.metodo === 'PATCH' && (p.corpo as { notificacoes?: boolean }).notificacoes === false)).toBe(true);
    expect(local().avisos).toBe(false);
  });

  it('altera só o campo mexido', async () => {
    const { api } = await renderizar(<ContaTela />, { rotas });
    await fireEvent.press(await screen.findByRole('button', { name: 'Aumentar máximo por dia' }));
    await waitFor(() => expect(api.pedidos.at(-1)).toMatchObject({ metodo: 'PATCH', corpo: { maxPorDia: 6 } }));
    expect(await screen.findByLabelText('Máximo por dia: 6')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Diminuir silêncio a partir de' }));
    await waitFor(() => expect(api.pedidos.at(-1)?.corpo).toEqual({ silencioInicio: '21:00' }));
  });

  it('ligar avisos pede a permissão do sistema; negada, não liga', async () => {
    jest.mocked(pedirPermissaoDoSistema).mockResolvedValue(false);
    const { api } = await renderizar(<ContaTela />, { rotas });
    await fireEvent.press(await screen.findByRole('switch', { name: 'Avisos do que você segue' }));
    expect(await screen.findByText('O aparelho não permitiu avisos para o app.')).toBeOnTheScreen();
    expect(api.pedidos.some((p) => p.metodo === 'PATCH')).toBe(false);
  });

  it('excluir pede confirmação, apaga a conta e volta ao começo', async () => {
    const { api, local } = await renderizar(<ContaTela />, { rotas, local: { onboardingConcluido: true, uf: 'SP' } });
    await fireEvent.press(await screen.findByRole('button', { name: 'Excluir conta' }));
    expect(api.pedidos.some((p) => p.metodo === 'DELETE')).toBe(false);
    await fireEvent.press(screen.getByRole('button', { name: 'Excluir de vez' }));
    await waitFor(() => expect(local()).toEqual({ onboardingConcluido: false, uf: null, avisos: false, parouAqui: {} }));
    expect(api.pedidos.some((p) => p.metodo === 'DELETE' && p.caminho === '/conta')).toBe(true);
  });
});

describe('Login opcional', () => {
  function cliente() {
    const api = apiFalsa({
      'POST /auth/entrar/apple': () => ({ corpo: { ...api.par(), usuarioId: 'conta-antiga', contaExistente: true } }),
      'GET /a': { corpo: 1 },
    });
    const c = new ClienteApi({ baseUrl: 'http://api.teste', cofre: cofreEmMemoria(), plataforma: 'ios', fetch: api.fetch });
    return { api, c };
  }

  it('Apple: manda só o token de identidade e adota o par novo', async () => {
    mockApple.signInAsync.mockResolvedValue({ identityToken: 'token-da-apple' } as Apple.AppleAuthenticationCredential);
    const { api, c } = cliente();
    await c.iniciar();
    const r = await entrar(c, 'apple');
    expect(mockApple.signInAsync).toHaveBeenCalledWith({ requestedScopes: [] });
    expect(api.pedidos.find((p) => p.caminho === '/auth/entrar/apple')?.corpo).toEqual({ token: 'token-da-apple' });
    expect(r.contaExistente).toBe(true);
    expect(c.usuarioId).toBe('conta-antiga');
    await c.get('/a');
    expect(api.pedidos.at(-1)?.autorizacao).toBe('Bearer acesso-2');
  });

  it('cancelar não é erro', async () => {
    mockApple.signInAsync.mockRejectedValue(Object.assign(new Error('cancelado'), { code: 'ERR_REQUEST_CANCELED' }));
    const { c } = cliente();
    await expect(entrar(c, 'apple')).rejects.toBeInstanceOf(LoginCancelado);
  });
});

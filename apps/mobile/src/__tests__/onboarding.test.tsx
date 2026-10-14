import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import EscolherAssuntos from '../app/onboarding/assuntos';
import EscolherEstado from '../app/onboarding/index';
import PrePerguntaNotificacoes from '../app/onboarding/notificacoes';
import QuemSeguir from '../app/onboarding/seguir';
import { pedirPermissaoDoSistema } from '../notificacoes/permissao';
import { renderizar } from '../test/renderizar';

const mockRoteador = { push: jest.fn(), back: jest.fn(), replace: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRoteador }));
jest.mock('../notificacoes/permissao', () => ({ pedirPermissaoDoSistema: jest.fn() }));

const preferencias = (uf: string | null, notificacoes = true) => ({
  uf,
  notificacoes,
  resumoSemanal: true,
  maxPorDia: 5,
  silencioInicio: '22:00',
  silencioFim: '07:00',
  fuso: 'America/Sao_Paulo',
});

beforeEach(() => jest.clearAllMocks());

describe('Passo 1: estado', () => {
  it('converte o CEP em estado no aparelho e envia só a sigla', async () => {
    const { api, local } = await renderizar(<EscolherEstado />, {
      rotas: { 'PATCH /conta/preferencias': { corpo: preferencias('MG') } },
    });

    await fireEvent.changeText(screen.getByLabelText('CEP'), '30130010');
    expect(screen.getByText('Este CEP fica em Minas Gerais.')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Minas Gerais' })).toBeChecked();

    await fireEvent.press(screen.getByRole('button', { name: 'Continuar com Minas Gerais' }));
    await waitFor(() => expect(mockRoteador.push).toHaveBeenCalledWith('/onboarding/seguir'));

    expect(api.pedidos).toEqual([
      expect.objectContaining({ metodo: 'PATCH', caminho: '/conta/preferencias', corpo: { uf: 'MG' } }),
    ]);
    // O CEP não aparece em nenhum pedido, em nenhum formato.
    expect(JSON.stringify(api.pedidos)).not.toMatch(/30130|010/);
    expect(local()).toMatchObject({ uf: 'MG' });
    expect(JSON.stringify(local())).not.toMatch(/30130/);
  });

  it('sem estado, o botão fica desabilitado', async () => {
    await renderizar(<EscolherEstado />);
    expect(screen.getByRole('button', { name: 'Escolha um estado' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('radio', { name: 'Bahia' }));
    expect(screen.getByRole('button', { name: 'Continuar com Bahia' })).toBeEnabled();
  });
});

describe('Passo 2: quem seguir', () => {
  const lista = [
    { id: 's1', nome: 'Senadora Exemplo', casa: 'senado', cargo: 'Senadora', uf: 'MG', partido: 'AAA', foto: null, seguindo: false },
    {
      id: 'd1',
      nome: 'Deputado Exemplo',
      casa: 'camara',
      cargo: 'Deputado Federal',
      uf: 'MG',
      partido: 'BBB',
      foto: { url: 'http://exemplo.invalid/f.jpg', credito: 'Câmara dos Deputados' },
      seguindo: false,
    },
  ];

  it('lista os parlamentares do estado e segue com um toque', async () => {
    const seguidos: object[] = [];
    const { api } = await renderizar(<QuemSeguir />, {
      local: { uf: 'MG' },
      rotas: {
        'GET /parlamentares?uf=MG': { corpo: { itens: lista } },
        'GET /seguindo': () => ({ corpo: { itens: seguidos } }),
        'PUT /seguindo/pessoa/d1': () => {
          seguidos.push({ tipo: 'pessoa', id: 'd1', nome: 'Deputado Exemplo', detalhe: null, desde: '2026-10-14' });
          return { corpo: { seguindo: true, novo: true } };
        },
      },
    });

    expect(await screen.findByText('Senado · 1')).toBeOnTheScreen();
    expect(screen.getByText('Foto: Câmara dos Deputados')).toBeOnTheScreen();
    const seguir = screen.getByRole('checkbox', { name: 'Seguir Deputado Exemplo, Deputado Federal · BBB' });
    expect(seguir).not.toBeChecked();

    await fireEvent.press(seguir);
    await waitFor(() => expect(seguir).toBeChecked());
    expect(screen.getByRole('button', { name: 'Continuar (1)' })).toBeOnTheScreen();
    await waitFor(() =>
      expect(api.pedidos.some((p) => p.metodo === 'PUT' && p.caminho === '/seguindo/pessoa/d1')).toBe(true),
    );
  });

  it('desfaz o seguir se a API recusar', async () => {
    await renderizar(<QuemSeguir />, {
      local: { uf: 'MG' },
      rotas: {
        'GET /parlamentares?uf=MG': { corpo: { itens: lista } },
        'GET /seguindo': { corpo: { itens: [] } },
        'PUT /seguindo/pessoa/s1': { status: 422, corpo: { message: 'Limite de 500 itens seguidos' } },
      },
    });
    const seguir = await screen.findByRole('checkbox', { name: /Seguir Senadora Exemplo/ });
    await fireEvent.press(seguir);
    expect(await screen.findByText('Limite de 500 itens seguidos')).toBeOnTheScreen();
    expect(seguir).not.toBeChecked();
  });
});

describe('Passo 3: assuntos', () => {
  it('segue assunto com vírgula no nome pelo caminho codificado', async () => {
    const { api } = await renderizar(<EscolherAssuntos />, {
      rotas: {
        'GET /assuntos': { corpo: { itens: [{ nome: 'Ciência, Tecnologia e Inovação', proposicoes: 19 }] } },
        'GET /seguindo': { corpo: { itens: [] } },
        'PUT /seguindo/assunto/Ci%C3%AAncia%2C%20Tecnologia%20e%20Inova%C3%A7%C3%A3o': { corpo: { seguindo: true } },
      },
    });
    await fireEvent.press(await screen.findByRole('checkbox', { name: 'Ciência, Tecnologia e Inovação, 19 propostas' }));
    await waitFor(() =>
      expect(api.pedidos.find((p) => p.metodo === 'PUT')?.caminho).toBe(
        '/seguindo/assunto/Ci%C3%AAncia%2C%20Tecnologia%20e%20Inova%C3%A7%C3%A3o',
      ),
    );
  });
});

describe('Passo 4: pré-pergunta de notificação', () => {
  it('"Agora não" não chama o pedido do sistema, desliga e conclui', async () => {
    const { api, local } = await renderizar(<PrePerguntaNotificacoes />, {
      rotas: { 'PATCH /conta/preferencias': { corpo: preferencias(null, false) } },
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Agora não' }));
    await waitFor(() => expect(local().onboardingConcluido).toBe(true));
    expect(pedirPermissaoDoSistema).not.toHaveBeenCalled();
    expect(api.pedidos[0].corpo).toEqual({ notificacoes: false });
    expect(local().avisos).toBe(false);
  });

  it('"Quero avisos" chama o pedido do sistema e grava o que o sistema permitiu', async () => {
    jest.mocked(pedirPermissaoDoSistema).mockResolvedValue(true);
    const { api, local } = await renderizar(<PrePerguntaNotificacoes />, {
      rotas: { 'PATCH /conta/preferencias': { corpo: preferencias(null, true) } },
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Quero avisos' }));
    await waitFor(() => expect(local().onboardingConcluido).toBe(true));
    expect(pedirPermissaoDoSistema).toHaveBeenCalledTimes(1);
    expect(api.pedidos[0].corpo).toEqual({ notificacoes: true });
    // O token de envio é registrado depois, pelo app (useAvisos), com os avisos aceitos.
    expect(local().avisos).toBe(true);
    expect(api.pedidos.map((p) => p.caminho)).toEqual(['/conta/preferencias']);
  });

  it('sistema negou: avisos desligados e nada a registrar', async () => {
    jest.mocked(pedirPermissaoDoSistema).mockResolvedValue(false);
    const { api, local } = await renderizar(<PrePerguntaNotificacoes />, {
      rotas: { 'PATCH /conta/preferencias': { corpo: preferencias(null, false) } },
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Quero avisos' }));
    await waitFor(() => expect(local().onboardingConcluido).toBe(true));
    expect(api.pedidos[0].corpo).toEqual({ notificacoes: false });
    expect(local().avisos).toBe(false);
  });
});

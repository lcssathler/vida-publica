import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';
import Feed from '../app/(abas)/index';
import DetalheDoEvento from '../app/evento/[id]';
import { evento } from '../test/fabricas';
import { renderizar } from '../test/renderizar';

const mockRoteador = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true };
const mockParametros = { id: 'e1' };
jest.mock('expo-router', () => ({
  useRouter: () => mockRoteador,
  useLocalSearchParams: () => mockParametros,
}));

beforeEach(() => jest.clearAllMocks());

const seguindoUm = { 'GET /seguindo': { corpo: { itens: [{ tipo: 'pessoa', id: 'p1', nome: 'Maria Exemplo', detalhe: null, desde: '2026-10-01' }] } } };
const assuntos = { 'GET /assuntos': { corpo: { itens: [{ nome: 'Saúde', proposicoes: 10 }] } } };

describe('Feed', () => {
  const novo = evento({ id: 'novo', ocorridoEm: '2026-10-14T18:00:00.000Z', titulo: 'Registro novo' });
  const visto = evento({ id: 'visto', ocorridoEm: '2026-10-14T16:00:00.000Z', titulo: 'Registro visto' });
  const antigo = evento({ id: 'antigo', ocorridoEm: '2026-10-10T16:00:00.000Z', titulo: 'Registro da segunda página' });

  it('pagina por cursor, marca "Você parou aqui" e grava o novo marco', async () => {
    const { api, local } = await renderizar(<Feed />, {
      local: { onboardingConcluido: true, parouAqui: { seguindo: { ocorridoEm: visto.ocorridoEm, id: 'visto' } } },
      rotas: {
        ...seguindoUm,
        ...assuntos,
        'GET /feed?escopo=seguindo&limite=20': { corpo: { itens: [novo, visto], proximoCursor: 'c1' } },
        'GET /feed?escopo=seguindo&limite=20&cursor=c1': { corpo: { itens: [antigo], proximoCursor: null } },
      },
    });

    expect(await screen.findByText('Registro novo')).toBeOnTheScreen();
    expect(screen.getByLabelText(/^Novo\. Votação nominal\. Registro novo/)).toBeOnTheScreen();
    expect(screen.getByLabelText('Você parou aqui. Daqui para baixo, registros já vistos.')).toBeOnTheScreen();
    expect(screen.getByLabelText(/^Votação nominal\. Registro visto/)).toBeOnTheScreen();
    await waitFor(() => expect(local().parouAqui.seguindo).toEqual({ ocorridoEm: novo.ocorridoEm, id: 'novo' }));

    await fireEvent(screen.getByTestId('lista-feed'), 'onEndReached');
    expect(await screen.findByText('Registro da segunda página')).toBeOnTheScreen();
    expect(screen.getByText('FIM DOS REGISTROS')).toBeOnTheScreen();
    expect(api.pedidos.filter((p) => p.caminho.startsWith('/feed')).map((p) => p.caminho)).toEqual([
      '/feed?escopo=seguindo&limite=20',
      '/feed?escopo=seguindo&limite=20&cursor=c1',
    ]);
  });

  it('filtra por tipo (categoria) e por assunto', async () => {
    const { api } = await renderizar(<Feed />, {
      local: { onboardingConcluido: true },
      rotas: {
        ...seguindoUm,
        ...assuntos,
        'GET /feed': { corpo: { itens: [visto], proximoCursor: null } },
      },
    });
    await screen.findByText('Registro visto');
    await fireEvent.press(screen.getByRole('button', { name: 'Filtros' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Gastos' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Saúde' }));
    await waitFor(() =>
      expect(api.pedidos.at(-1)?.caminho).toBe('/feed?escopo=seguindo&limite=20&tipo=despesa_mensal&assunto=Sa%C3%BAde'),
    );
    expect(screen.getByRole('button', { name: 'Filtros (2)' })).toBeOnTheScreen();
  });

  it('quem não segue nada é convidado a ver tudo', async () => {
    const { api } = await renderizar(<Feed />, {
      local: { onboardingConcluido: true },
      rotas: {
        'GET /seguindo': { corpo: { itens: [] } },
        ...assuntos,
        'GET /feed': { corpo: { itens: [], proximoCursor: null } },
        'GET /feed?escopo=todos&limite=20': { corpo: { itens: [visto], proximoCursor: null } },
      },
    });
    await fireEvent.press(await screen.findByRole('button', { name: 'Ver tudo' }));
    expect(await screen.findByText('Registro visto')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Tudo' })).toBeChecked();
    expect(api.pedidos.at(-1)?.caminho).toBe('/feed?escopo=todos&limite=20');
  });

  it('429 mostra quanto esperar e permite tentar de novo', async () => {
    await renderizar(<Feed />, {
      local: { onboardingConcluido: true },
      rotas: { ...seguindoUm, ...assuntos, 'GET /feed': { status: 429, cabecalhos: { 'Retry-After': '30' } } },
    });
    expect(await screen.findByText('Muitas requisições. Tente de novo em 30 s.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeOnTheScreen();
  });

  it('tocar no registro abre o detalhe', async () => {
    await renderizar(<Feed />, {
      local: { onboardingConcluido: true },
      rotas: { ...seguindoUm, ...assuntos, 'GET /feed': { corpo: { itens: [visto], proximoCursor: null } } },
    });
    await fireEvent.press(await screen.findByLabelText(/Registro visto/));
    expect(mockRoteador.push).toHaveBeenCalledWith({ pathname: '/evento/[id]', params: { id: 'visto' } });
  });
});

describe('Detalhe do evento', () => {
  it('mostra o fato, o valor, os envolvidos, a fonte e a regra', async () => {
    const abrir = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await renderizar(<DetalheDoEvento />, {
      rotas: {
        'GET /eventos/e1': {
          corpo: evento({
            id: 'e1',
            tipo: 'despesa_mensal',
            ocorridoEm: '2026-10-01T03:00:00.000Z',
            titulo: 'Maria Exemplo: R$ 5.351,48 em despesas da cota em outubro de 2026 (parcial)',
            valor: 5351.48,
            alvos: [
              { tipo: 'assunto', id: 'Saúde', nome: 'Saúde', papel: '', seguindo: false },
              { tipo: 'pessoa', id: 'p1', nome: 'Maria Exemplo', papel: 'parlamentar', seguindo: true },
            ],
            regra: { versao: 1, descricao: 'Despesas da cota somadas por mês.' },
          }),
        },
      },
    });
    expect(await screen.findByText('R$ 5.351,48')).toBeOnTheScreen();
    expect(screen.getByText('01/10/2026')).toBeOnTheScreen();
    expect(screen.getByText('Câmara dos Deputados')).toBeOnTheScreen();
    expect(screen.getByText('https://dadosabertos.camara.leg.br/api/v2/votacoes/1')).toBeOnTheScreen();
    expect(screen.getByText('Registro gerado pela regra despesa_mensal v1: Despesas da cota somadas por mês.')).toBeOnTheScreen();
    expect(screen.getByLabelText('Fonte: Câmara dos Deputados, dado de 14 de outubro de 2026')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Abrir na fonte oficial' }));
    expect(abrir).toHaveBeenCalledWith('https://dadosabertos.camara.leg.br/api/v2/votacoes/1');
  });

  it('evento que a API não mostra (segurado ou de seguidores) vira "Não encontrado"', async () => {
    await renderizar(<DetalheDoEvento />, {
      rotas: { 'GET /eventos/e1': { status: 404, corpo: { message: 'Evento não encontrado' } } },
    });
    expect(await screen.findByText('Não encontrado.')).toBeOnTheScreen();
  });
});

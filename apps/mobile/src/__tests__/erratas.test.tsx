import { fireEvent, screen } from '@testing-library/react-native';
import Erratas from '../app/erratas';
import ReportarErro from '../app/reportar/[id]';
import { renderizar } from '../test/renderizar';

const mockRoteador = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true };
jest.mock('expo-router', () => ({
  useRouter: () => mockRoteador,
  useLocalSearchParams: () => ({ id: 'e1' }),
}));

beforeEach(() => jest.clearAllMocks());

describe('Reportar erro', () => {
  it('só envia com um motivo; manda o texto e confirma', async () => {
    const { api } = await renderizar(<ReportarErro />, {
      rotas: { 'POST /eventos/e1/reporte': { status: 201, corpo: { recebido: true } } },
    });
    const enviar = await screen.findByRole('button', { name: 'Enviar' });
    expect(enviar).toBeDisabled();
    await fireEvent.press(screen.getByRole('radio', { name: 'A pessoa ou o partido está errado' }));
    expect(screen.getByRole('radio', { name: 'A pessoa ou o partido está errado' })).toBeChecked();
    await fireEvent.changeText(screen.getByLabelText('Detalhes do erro'), '  Não é ele.  ');
    await fireEvent.press(screen.getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByRole('heading', { name: 'Recebido' })).toBeOnTheScreen();
    expect(api.pedidos.at(-1)).toMatchObject({
      metodo: 'POST',
      caminho: '/eventos/e1/reporte',
      corpo: { motivo: 'pessoa_errada', texto: 'Não é ele.' },
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Ver as erratas publicadas' }));
    expect(mockRoteador.push).toHaveBeenCalledWith('/erratas');
  });

  it('mostra o erro da API', async () => {
    await renderizar(<ReportarErro />, {
      rotas: { 'POST /eventos/e1/reporte': { status: 404, corpo: { message: 'Evento não encontrado' } } },
    });
    await fireEvent.press(await screen.findByRole('radio', { name: 'Outro problema' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByText('Não encontrado.')).toBeOnTheScreen();
  });
});

describe('Erratas', () => {
  it('lista as erratas por cursor e leva ao registro corrigido', async () => {
    await renderizar(<Erratas />, {
      rotas: {
        'GET /erratas?limite=20': {
          corpo: {
            erratas: [
              {
                id: 'a',
                titulo: 'Repasse em dobro',
                texto: 'O repasse aparecia duas vezes.',
                publicadaEm: '2026-10-15T12:00:00.000Z',
                evento: { id: 'e9', titulo: 'Repasse', tipo: 'repasse', ocorridoEm: '2026-09-01T03:00:00.000Z' },
              },
            ],
            proximoCursor: 'c1',
          },
        },
        'GET /erratas?limite=20&cursor=c1': {
          corpo: {
            erratas: [
              {
                id: 'b',
                titulo: 'Pessoa casada errado',
                texto: 'O registro saiu do app.',
                publicadaEm: '2026-10-14T12:00:00.000Z',
                evento: null,
              },
            ],
            proximoCursor: null,
          },
        },
      },
    });
    expect(await screen.findByRole('heading', { name: 'Repasse em dobro' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('link', { name: 'Ver o registro corrigido: Repasse' }));
    expect(mockRoteador.push).toHaveBeenCalledWith({ pathname: '/evento/[id]', params: { id: 'e9' } });
    await fireEvent.press(screen.getByRole('button', { name: 'Mais erratas' }));
    expect(await screen.findByRole('heading', { name: 'Pessoa casada errado' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Mais erratas' })).toBeNull();
    // Sem o registro no app (arquivado), não há link.
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });
});

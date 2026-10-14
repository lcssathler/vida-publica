import { render, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { ClienteApi } from '../../api/cliente';
import { SessaoContexto } from '../../sessao/Sessao';
import { ESTADO_INICIAL } from '../../sessao/local';
import { apiFalsa, cofreEmMemoria } from '../../test/apiFalsa';
import { esquecerAparelho, registrarAparelho } from '../aparelho';
import { useAvisos } from '../avisos';
import { eventoDoAviso, eventoDoLink } from '../link';
import { tokenDeEnvio } from '../token';

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  IosAuthorizationStatus: { PROVISIONAL: 3 },
  setNotificationHandler: jest.fn(),
  useLastNotificationResponse: jest.fn(),
  clearLastNotificationResponse: jest.fn(),
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../token', () => ({
  tokenDeEnvio: jest.fn(),
  ouvirTrocaDeToken: jest.fn(() => () => {}),
}));

const ID = '1b7e816f-a70f-4dcf-90bb-690216ff9755';
const TOKEN = `fcm:${'A1b2_C3d4-'.repeat(12)}`;

async function cliente(rotas = {}) {
  const api = apiFalsa(rotas);
  const c = new ClienteApi({
    baseUrl: 'http://api.teste',
    cofre: cofreEmMemoria(),
    plataforma: 'ios',
    fetch: api.fetch,
    esperar: async () => {},
  });
  await c.iniciar();
  api.pedidos.length = 0;
  return { api, cliente: c };
}

function permissao(granted: boolean, status = 0) {
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({
    granted,
    ios: { status },
  } as unknown as Notifications.NotificationPermissionsStatus);
}

beforeEach(() => jest.clearAllMocks());

describe('link do aviso', () => {
  it('só aceita vidapublica://evento/{uuid}', () => {
    expect(eventoDoLink(`vidapublica://evento/${ID}`)).toBe(ID);
    expect(eventoDoLink(`vidapublica://evento/${ID.toUpperCase()}`)).toBe(ID);
    for (const ruim of [`https://x/evento/${ID}`, 'vidapublica://evento/1', `vidapublica://pessoa/${ID}`, 42, null]) {
      expect(eventoDoLink(ruim)).toBeNull();
    }
  });

  it('acha o link onde cada plataforma entrega os dados', () => {
    const url = `vidapublica://evento/${ID}`;
    const resposta = (request: object) => ({ notification: { request } });
    expect(eventoDoAviso(resposta({ content: { data: { url } } }))).toBe(ID);
    expect(eventoDoAviso(resposta({ content: { data: {} }, trigger: { payload: { url } } }))).toBe(ID);
    expect(eventoDoAviso(resposta({ content: {}, trigger: { remoteMessage: { data: { url } } } }))).toBe(ID);
    expect(eventoDoAviso({ data: { url } })).toBe(ID);
    expect(eventoDoAviso(null)).toBeNull();
    expect(eventoDoAviso(resposta({ content: { data: { url: 'vidapublica://' } } }))).toBeNull();
  });
});

describe('registro do aparelho', () => {
  it('com a permissão do sistema, manda só o token e a plataforma', async () => {
    permissao(true);
    const { api, cliente: c } = await cliente({ 'PUT /dispositivo': { status: 204 } });
    await expect(registrarAparelho(c, async () => TOKEN)).resolves.toBe(true);
    expect(api.pedidos).toEqual([
      expect.objectContaining({ metodo: 'PUT', caminho: '/dispositivo', corpo: { token: TOKEN, plataforma: 'ios' } }),
    ]);
  });

  it('modo provisório do iOS conta como permitido', async () => {
    permissao(false, Notifications.IosAuthorizationStatus.PROVISIONAL);
    const { api, cliente: c } = await cliente({ 'PUT /dispositivo': { status: 204 } });
    await expect(registrarAparelho(c, async () => TOKEN)).resolves.toBe(true);
    expect(api.pedidos).toHaveLength(1);
  });

  it('sem permissão, nem pede o token; sem token, nada vai para a API', async () => {
    permissao(false);
    const obter = jest.fn(async () => TOKEN);
    const { api, cliente: c } = await cliente();
    await expect(registrarAparelho(c, obter)).resolves.toBe(false);
    expect(obter).not.toHaveBeenCalled();
    permissao(true);
    await expect(registrarAparelho(c, async () => null)).resolves.toBe(false);
    expect(api.pedidos).toEqual([]);
  });

  it('esquecer apaga o token da sessão', async () => {
    const { api, cliente: c } = await cliente({ 'DELETE /dispositivo': { status: 204 } });
    await esquecerAparelho(c);
    expect(api.pedidos).toEqual([expect.objectContaining({ metodo: 'DELETE', caminho: '/dispositivo' })]);
  });
});

describe('useAvisos', () => {
  function Teste({ ligado }: { ligado: boolean }) {
    useAvisos(ligado);
    return null;
  }

  async function montar(ligado: boolean, rotas = {}) {
    const { api, cliente: c } = await cliente(rotas);
    const valor = { cliente: c, local: ESTADO_INICIAL, atualizarLocal: () => {} };
    await render(
      <SessaoContexto.Provider value={valor}>
        <Teste ligado={ligado} />
      </SessaoContexto.Provider>,
    );
    return api;
  }

  it('com os avisos aceitos, registra o token ao abrir', async () => {
    permissao(true);
    jest.mocked(tokenDeEnvio).mockResolvedValue(TOKEN);
    const api = await montar(true, { 'PUT /dispositivo': { status: 204 } });
    await waitFor(() => expect(api.pedidos).toHaveLength(1));
    expect(api.pedidos[0]).toMatchObject({ metodo: 'PUT', caminho: '/dispositivo' });
  });

  it('sem aceitar os avisos, não pede nem registra token', async () => {
    permissao(true);
    jest.mocked(tokenDeEnvio).mockResolvedValue(TOKEN);
    const api = await montar(false);
    expect(Notifications.getPermissionsAsync).not.toHaveBeenCalled();
    expect(tokenDeEnvio).not.toHaveBeenCalled();
    expect(api.pedidos).toEqual([]);
  });

  it('tocar no aviso abre o registro com a fonte', async () => {
    jest.mocked(Notifications.useLastNotificationResponse).mockReturnValue({
      notification: { request: { content: { data: { url: `vidapublica://evento/${ID}` } } } },
    } as unknown as Notifications.NotificationResponse);
    await montar(false);
    expect(router.push).toHaveBeenCalledWith(`/evento/${ID}`);
    expect(Notifications.clearLastNotificationResponse).toHaveBeenCalled();
  });
});

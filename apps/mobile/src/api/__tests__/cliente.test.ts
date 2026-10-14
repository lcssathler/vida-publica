import { apiFalsa, cofreEmMemoria } from '../../test/apiFalsa';
import { ClienteApi } from '../cliente';
import { ErroApi, ErroLimite, ErroRede, segundosRetryAfter } from '../erros';

function novoCliente(api: ReturnType<typeof apiFalsa>, cofre = cofreEmMemoria(), extra = {}) {
  const esperas: number[] = [];
  const cliente = new ClienteApi({
    baseUrl: 'http://api.teste',
    cofre,
    plataforma: 'android',
    fetch: api.fetch,
    esperar: async (ms) => {
      esperas.push(ms);
    },
    ...extra,
  });
  return { cliente, cofre, esperas };
}

describe('ClienteApi: sessão', () => {
  it('primeira abertura cria a conta anônima e guarda só o refresh no cofre', async () => {
    const api = apiFalsa({});
    const { cliente, cofre } = novoCliente(api);
    expect(await cliente.iniciar()).toBe('usuario-1');
    expect(api.pedidos[0]).toMatchObject({ metodo: 'POST', caminho: '/auth/anonimo', corpo: { plataforma: 'android' } });
    expect(cofre.valor).toBe('refresh-1');
  });

  it('com refresh guardado, renova e grava o par novo (o antigo deixa de valer)', async () => {
    const api = apiFalsa({ 'GET /seguindo': { corpo: { itens: [] } } });
    const { cliente, cofre } = novoCliente(api, cofreEmMemoria('refresh-antigo'));
    await cliente.get('/seguindo');
    expect(api.pedidos.map((p) => `${p.metodo} ${p.caminho}`)).toEqual(['POST /auth/renovar', 'GET /seguindo']);
    expect(api.pedidos[0].corpo).toEqual({ refresh: 'refresh-antigo' });
    expect(cofre.valor).toBe('refresh-1');
    expect(api.pedidos[1].autorizacao).toBe('Bearer acesso-1');
  });

  it('renova uma vez só quando várias requisições chegam juntas', async () => {
    const api = apiFalsa({ 'GET /a': { corpo: 1 }, 'GET /b': { corpo: 2 } });
    const { cliente } = novoCliente(api, cofreEmMemoria('refresh-antigo'));
    await Promise.all([cliente.get('/a'), cliente.get('/b'), cliente.get('/a')]);
    expect(api.pedidos.filter((p) => p.caminho === '/auth/renovar')).toHaveLength(1);
  });

  it('renova antes de o token de acesso expirar', async () => {
    let agora = Date.now();
    const api = apiFalsa({ 'GET /a': { corpo: 1 } });
    const { cliente } = novoCliente(api, cofreEmMemoria(), { agora: () => agora });
    await cliente.get('/a');
    agora += 14.5 * 60_000; // falta menos de 1 minuto
    await cliente.get('/a');
    expect(api.pedidos.map((p) => p.caminho)).toEqual(['/auth/anonimo', '/a', '/auth/renovar', '/a']);
  });

  it('401 numa rota: renova e repete a requisição uma vez', async () => {
    let chamadas = 0;
    const api = apiFalsa({ 'GET /a': () => (++chamadas === 1 ? { status: 401 } : { corpo: { ok: true } }) });
    const { cliente } = novoCliente(api);
    expect(await cliente.get('/a')).toEqual({ ok: true });
    expect(api.pedidos.map((p) => p.caminho)).toEqual(['/auth/anonimo', '/a', '/auth/renovar', '/a']);
    expect(api.pedidos[3].autorizacao).toBe('Bearer acesso-2');
  });

  it('refresh recusado (reuso): apaga o cofre, avisa e abre conta anônima nova', async () => {
    const aoEncerrar = jest.fn();
    const api = apiFalsa({ 'POST /auth/renovar': { status: 401, corpo: { message: 'Refresh token já usado' } } });
    const { cliente, cofre } = novoCliente(api, cofreEmMemoria('refresh-vazado'), { aoEncerrarSessao: aoEncerrar });
    await cliente.iniciar();
    expect(aoEncerrar).toHaveBeenCalledTimes(1);
    expect(api.pedidos.map((p) => p.caminho)).toEqual(['/auth/renovar', '/auth/anonimo']);
    expect(cofre.valor).toBe('refresh-1');
  });

  it('falha de rede na renovação mantém o refresh para tentar depois', async () => {
    const cofre = cofreEmMemoria('refresh-guardado');
    const cliente = new ClienteApi({
      baseUrl: 'http://api.teste',
      cofre,
      plataforma: 'ios',
      fetch: (async () => {
        throw new TypeError('Network request failed');
      }) as unknown as typeof fetch,
    });
    await expect(cliente.iniciar()).rejects.toBeInstanceOf(ErroRede);
    expect(cofre.valor).toBe('refresh-guardado');
  });

  it('esquecer apaga o refresh do cofre', async () => {
    const api = apiFalsa({});
    const { cliente, cofre } = novoCliente(api);
    await cliente.iniciar();
    await cliente.esquecer();
    expect(cofre.valor).toBeNull();
    expect(cliente.usuarioId).toBeNull();
  });
});

describe('ClienteApi: 429 e erros', () => {
  it('Retry-After curto: espera e repete uma vez', async () => {
    let chamadas = 0;
    const api = apiFalsa({
      'GET /busca': () =>
        ++chamadas === 1 ? { status: 429, cabecalhos: { 'Retry-After': '2' } } : { corpo: { ok: 1 } },
    });
    const { cliente, esperas } = novoCliente(api);
    expect(await cliente.get('/busca')).toEqual({ ok: 1 });
    expect(esperas).toEqual([2000]);
  });

  it('Retry-After longo: ErroLimite com os segundos, sem esperar', async () => {
    const api = apiFalsa({ 'GET /busca': { status: 429, cabecalhos: { 'Retry-After': '42' } } });
    const { cliente, esperas } = novoCliente(api);
    const erro = await cliente.get('/busca').catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroLimite);
    expect((erro as ErroLimite).segundos).toBe(42);
    expect((erro as ErroLimite).message).toBe('Muitas requisições. Tente de novo em 42 s.');
    expect(esperas).toEqual([]);
  });

  it('429 ao criar a conta anônima vira ErroLimite', async () => {
    const api = apiFalsa({ 'POST /auth/anonimo': { status: 429, cabecalhos: { 'Retry-After': '300' } } });
    const { cliente } = novoCliente(api);
    await expect(cliente.iniciar()).rejects.toMatchObject({ segundos: 300 });
  });

  it('erro da API traz a mensagem do corpo', async () => {
    const api = apiFalsa({ 'PUT /seguindo/pessoa/x': { status: 422, corpo: { message: 'Limite de 500 itens seguidos' } } });
    const { cliente } = novoCliente(api);
    const erro = await cliente.put('/seguindo/pessoa/x').catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroApi);
    expect(erro).toMatchObject({ status: 422, message: 'Limite de 500 itens seguidos' });
  });

  it('204 devolve undefined', async () => {
    const api = apiFalsa({ 'DELETE /seguindo/pessoa/x': { status: 204 } });
    const { cliente } = novoCliente(api);
    await expect(cliente.delete('/seguindo/pessoa/x')).resolves.toBeUndefined();
  });
});

describe('segundosRetryAfter', () => {
  it('aceita segundos e data HTTP; sem cabeçalho, 60', () => {
    const agora = Date.parse('2026-10-14T12:00:00Z');
    expect(segundosRetryAfter('7', agora)).toBe(7);
    expect(segundosRetryAfter('Wed, 14 Oct 2026 12:00:30 GMT', agora)).toBe(30);
    expect(segundosRetryAfter(null, agora)).toBe(60);
    expect(segundosRetryAfter('0', agora)).toBe(1);
  });
});

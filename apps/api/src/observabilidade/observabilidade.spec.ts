import { PingHealthchecks } from './healthchecks';
import { limparEvento, limparSpan, semConsulta } from './limpeza';

describe('limpeza dos eventos do Sentry', () => {
  it('tira a consulta das URLs', () => {
    expect(semConsulta('/busca?q=aborto')).toBe('/busca');
    expect(semConsulta('https://x/feed#a')).toBe('https://x/feed');
    expect(semConsulta('/health')).toBe('/health');
  });

  it('não leva cabeçalhos, corpo, usuário, consulta nem CPF', () => {
    const evento = limparEvento({
      message: 'falhou para 123.456.789-09',
      request: {
        url: 'https://api/busca?q=termo',
        method: 'GET',
        headers: { authorization: 'Bearer x' },
        cookies: { a: 'b' },
        data: { texto: 'x' },
        query_string: 'q=termo',
      },
      user: { ip_address: '1.2.3.4' },
      exception: { values: [{ value: 'cpf 12345678909' }] },
      breadcrumbs: [
        {
          data: {
            url: 'https://hc-ping.com/chave/x?create=1',
            'url.query': 'q',
          },
        },
      ],
      spans: [
        {
          description: 'GET /busca?q=termo',
          data: { 'http.url': '/busca?q=termo', 'url.query': '?q=termo' },
        },
      ],
      contexts: { trace: { data: { 'url.full': 'http://api/busca?q=x' } } },
    });
    expect(evento.request).toEqual({ url: 'https://api/busca', method: 'GET' });
    expect(evento.user).toBeUndefined();
    expect(evento.message).toBe('falhou para [CPF removido]');
    expect(evento.exception?.values?.[0].value).toBe('cpf [CPF removido]');
    expect(evento.breadcrumbs?.[0].data).toEqual({
      url: 'https://hc-ping.com/chave/x',
    });
    expect(evento.spans?.[0]).toEqual({
      description: 'GET /busca',
      data: { 'http.url': '/busca' },
    });
    expect(evento.contexts?.trace?.data).toEqual({
      'url.full': 'http://api/busca',
    });
  });
});

describe('limpeza dos spans', () => {
  it('tira consulta, user-agent e dados de rede de quem acessa', () => {
    const span = limparSpan({
      name: 'GET /busca?q=termo',
      attributes: {
        'url.full': 'http://api/busca?q=termo',
        'url.path': '/busca',
        'url.query': 'q=termo',
        'user_agent.original': 'Android',
        'client.address': '200.1.2.3',
        'network.peer.address': '200.1.2.3',
        'db.query.text': 'SELECT 1 WHERE id = $1',
      },
    });
    expect(span).toEqual({
      name: 'GET /busca',
      attributes: {
        'url.full': 'http://api/busca',
        'url.path': '/busca',
        'db.query.text': 'SELECT 1 WHERE id = $1',
      },
    });
  });
});

describe('segredos nas URLs de saída', () => {
  it('mascara a chave do healthchecks.io', () => {
    const span = limparSpan(
      {
        name: 'POST hc-ping.com',
        attributes: {
          'url.full': 'https://hc-ping.com/chave-secreta/notificador?create=1',
        },
      },
      ['chave-secreta'],
    );
    expect(span.attributes['url.full']).toBe(
      'https://hc-ping.com/[segredo]/notificador',
    );
  });
});

describe('sinal de vida no healthchecks.io', () => {
  it('pinga sucesso ou /fail e não vaza a chave quando falha', async () => {
    const pedidos: Array<{ url: string; corpo: unknown }> = [];
    const falhas: Array<Record<string, unknown>> = [];
    let status = 200;
    const buscar = ((url: string, init: RequestInit) => {
      pedidos.push({ url, corpo: init.body });
      return Promise.resolve(new Response(null, { status }));
    }) as unknown as typeof fetch;
    const ping = new PingHealthchecks(
      'chave-secreta',
      'notificador',
      'https://hc.exemplo/',
      (m) => falhas.push(m),
      buscar,
    );
    await ping.ping(true, 'ciclo ok');
    await ping.ping(false, 'ciclo falhou');
    expect(pedidos).toEqual([
      {
        url: 'https://hc.exemplo/chave-secreta/notificador?create=1',
        corpo: 'ciclo ok',
      },
      {
        url: 'https://hc.exemplo/chave-secreta/notificador/fail?create=1',
        corpo: 'ciclo falhou',
      },
    ]);
    status = 503;
    await ping.ping(true);
    const quebrado = new PingHealthchecks(
      'chave-secreta',
      'x',
      undefined,
      (m) => falhas.push(m),
      () => Promise.reject(new TypeError('rede')),
    );
    await quebrado.ping(true);
    expect(falhas).toEqual([
      { msg: 'ping ao healthchecks.io recusado', status: 503 },
      { msg: 'ping ao healthchecks.io falhou', erro: 'TypeError' },
    ]);
    expect(JSON.stringify(falhas)).not.toContain('chave-secreta');
  });
});

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportPKCS8, generateKeyPair, jwtVerify, type CryptoKey } from 'jose';
import {
  classificar,
  ContaDeServico,
  CredenciaisInvalidas,
  EnviadorFcm,
  lerCredenciais,
} from './enviador-fcm';
import { Dispositivo, MensagemPush } from './enviador';

const MENSAGEM: MensagemPush = {
  titulo: 'Deputada Fictícia votou Sim — PL 1/2026',
  corpo: 'Aprovado. Toque para ver a fonte.',
  dados: { url: 'vidapublica://evento/e1', eventoId: 'e1' },
};
const APARELHO: Dispositivo = {
  sessaoId: 's1',
  token: `fcm-token-${'x'.repeat(40)}`,
  plataforma: 'ios',
};

interface Chamada {
  url: string;
  init: RequestInit;
}

function resposta(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('EnviadorFcm', () => {
  let conta: ContaDeServico;
  let publica: CryptoKey;

  beforeAll(async () => {
    const par = await generateKeyPair('RS256', { extractable: true });
    publica = par.publicKey;
    conta = {
      type: 'service_account',
      project_id: 'vida-publica-teste',
      client_email: 'notificador@vida-publica-teste.iam.gserviceaccount.com',
      private_key: await exportPKCS8(par.privateKey),
      token_uri: 'https://oauth2.googleapis.com/token',
    };
  });

  /** fetch falso: token do Google e, depois, as respostas do FCM em ordem. */
  function falso(respostasFcm: Array<Response | Error>) {
    const chamadas: Chamada[] = [];
    let tokens = 0;
    const fetchFalso = ((url: string, init: RequestInit) => {
      chamadas.push({ url, init });
      if (url === conta.token_uri) {
        tokens += 1;
        return Promise.resolve(
          resposta(200, {
            access_token: `acesso-${tokens}`,
            expires_in: 3599,
            token_type: 'Bearer',
          }),
        );
      }
      const proxima = respostasFcm.shift() ?? resposta(200, { name: 'x' });
      if (proxima instanceof Error) return Promise.reject(proxima);
      return Promise.resolve(proxima);
    }) as unknown as typeof fetch;
    return { fetchFalso, chamadas };
  }

  it('troca um JWT assinado pela conta de serviço por um token de acesso e o reaproveita', async () => {
    const { fetchFalso, chamadas } = falso([]);
    const fcm = new EnviadorFcm(conta, { fetch: fetchFalso });
    await expect(fcm.enviar(MENSAGEM, APARELHO)).resolves.toBe('ok');
    await expect(fcm.enviar(MENSAGEM, APARELHO)).resolves.toBe('ok');
    const pedidosDeToken = chamadas.filter((c) => c.url === conta.token_uri);
    expect(pedidosDeToken).toHaveLength(1);
    const form = new URLSearchParams(pedidosDeToken[0].init.body as string);
    expect(form.get('grant_type')).toBe(
      'urn:ietf:params:oauth:grant-type:jwt-bearer',
    );
    const { payload } = await jwtVerify(form.get('assertion')!, publica, {
      issuer: conta.client_email,
      audience: conta.token_uri,
    });
    expect(payload.scope).toBe(
      'https://www.googleapis.com/auth/firebase.messaging',
    );
    expect(payload.exp! - payload.iat!).toBe(3600);
  });

  it('manda a mensagem v1 com aviso, dados do registro, canal Android e APNs', async () => {
    const { fetchFalso, chamadas } = falso([]);
    await new EnviadorFcm(conta, { fetch: fetchFalso }).enviar(
      MENSAGEM,
      APARELHO,
    );
    const envio = chamadas.find((c) => c.url.includes('fcm.googleapis.com'))!;
    expect(envio.url).toBe(
      'https://fcm.googleapis.com/v1/projects/vida-publica-teste/messages:send',
    );
    expect((envio.init.headers as Record<string, string>).authorization).toBe(
      'Bearer acesso-1',
    );
    expect(JSON.parse(envio.init.body as string)).toEqual({
      message: {
        token: APARELHO.token,
        notification: { title: MENSAGEM.titulo, body: MENSAGEM.corpo },
        data: { url: 'vidapublica://evento/e1', eventoId: 'e1' },
        android: { priority: 'NORMAL', notification: { channel_id: 'avisos' } },
        apns: {
          headers: { 'apns-priority': '5', 'apns-push-type': 'alert' },
          payload: { aps: { 'thread-id': 'avisos' } },
        },
      },
    });
  });

  it('validate_only: o FCM confere a mensagem e o token sem entregar', async () => {
    const { fetchFalso, chamadas } = falso([]);
    await new EnviadorFcm(conta, {
      fetch: fetchFalso,
      validarApenas: true,
    }).enviar(MENSAGEM, APARELHO);
    const envio = chamadas.find((c) => c.url.includes('fcm.googleapis.com'))!;
    expect(JSON.parse(envio.init.body as string)).toMatchObject({
      validate_only: true,
    });
  });

  it('401 descarta o token de acesso e pede outro na próxima vez', async () => {
    const { fetchFalso, chamadas } = falso([
      resposta(401, { error: { code: 401, status: 'UNAUTHENTICATED' } }),
    ]);
    const fcm = new EnviadorFcm(conta, { fetch: fetchFalso });
    await expect(fcm.enviar(MENSAGEM, APARELHO)).resolves.toBe('temporario');
    await expect(fcm.enviar(MENSAGEM, APARELHO)).resolves.toBe('ok');
    expect(chamadas.filter((c) => c.url === conta.token_uri)).toHaveLength(2);
  });

  it('conta de serviço recusada pelo Google: passageira, sem chamar o FCM', async () => {
    const chamadas: string[] = [];
    const recusa = ((url: string) => {
      chamadas.push(url);
      return Promise.resolve(resposta(400, { error: 'invalid_grant' }));
    }) as unknown as typeof fetch;
    await expect(
      new EnviadorFcm(conta, { fetch: recusa }).enviar(MENSAGEM, APARELHO),
    ).resolves.toBe('temporario');
    expect(chamadas).toEqual([conta.token_uri]);
  });

  it('falha de rede é passageira', async () => {
    const { fetchFalso } = falso([new Error('ECONNRESET')]);
    await expect(
      new EnviadorFcm(conta, { fetch: fetchFalso }).enviar(MENSAGEM, APARELHO),
    ).resolves.toBe('temporario');
  });

  it('classifica as respostas de erro do FCM v1', () => {
    const erro = (
      code: number,
      status: string,
      errorCode?: string,
      message = '',
    ) => ({
      error: {
        code,
        status,
        message,
        details: errorCode
          ? [
              {
                '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError',
                errorCode,
              },
            ]
          : [],
      },
    });
    expect(classificar(404, erro(404, 'NOT_FOUND', 'UNREGISTERED'))).toBe(
      'token_invalido',
    );
    expect(
      classificar(403, erro(403, 'PERMISSION_DENIED', 'SENDER_ID_MISMATCH')),
    ).toBe('token_invalido');
    expect(
      classificar(
        400,
        erro(
          400,
          'INVALID_ARGUMENT',
          'INVALID_ARGUMENT',
          'The registration token is not a valid FCM registration token',
        ),
      ),
    ).toBe('token_invalido');
    expect(
      classificar(
        400,
        erro(
          400,
          'INVALID_ARGUMENT',
          'INVALID_ARGUMENT',
          'Invalid value at message.data',
        ),
      ),
    ).toBe('erro');
    expect(
      classificar(429, erro(429, 'RESOURCE_EXHAUSTED', 'QUOTA_EXCEEDED')),
    ).toBe('temporario');
    expect(classificar(503, erro(503, 'UNAVAILABLE', 'UNAVAILABLE'))).toBe(
      'temporario',
    );
    expect(classificar(500, erro(500, 'INTERNAL', 'INTERNAL'))).toBe(
      'temporario',
    );
    expect(
      classificar(401, erro(401, 'UNAUTHENTICATED', 'THIRD_PARTY_AUTH_ERROR')),
    ).toBe('temporario');
    expect(classificar(403, erro(403, 'PERMISSION_DENIED'))).toBe('erro');
  });
});

describe('credenciais do FCM', () => {
  const valida = {
    type: 'service_account',
    project_id: 'vida-publica-teste',
    client_email: 'n@vida-publica-teste.iam.gserviceaccount.com',
    private_key:
      '-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----\n',
  };

  it('sem variável, sem FCM (o notificador usa o adaptador falso)', () => {
    expect(lerCredenciais({})).toBeNull();
    expect(lerCredenciais({ FCM_CREDENCIAIS_JSON: '  ' })).toBeNull();
  });

  it('lê do conteúdo ou de um arquivo fora do repositório', () => {
    expect(
      lerCredenciais({ FCM_CREDENCIAIS_JSON: JSON.stringify(valida) }),
    ).toMatchObject({ project_id: 'vida-publica-teste' });
    const pasta = mkdtempSync(join(tmpdir(), 'fcm-'));
    const arquivo = join(pasta, 'conta.json');
    writeFileSync(arquivo, JSON.stringify(valida));
    expect(lerCredenciais({ FCM_CREDENCIAIS_ARQUIVO: arquivo })).toMatchObject({
      token_uri: 'https://oauth2.googleapis.com/token',
    });
  });

  it('erro sem vazar a chave', () => {
    const semEmail = { ...valida, client_email: 'nao-e-email' };
    const tentar = (env: Record<string, string>) => {
      try {
        lerCredenciais(env);
      } catch (e) {
        expect(e).toBeInstanceOf(CredenciaisInvalidas);
        return (e as Error).message;
      }
      throw new Error('deveria falhar');
    };
    const mensagem = tentar({ FCM_CREDENCIAIS_JSON: JSON.stringify(semEmail) });
    expect(mensagem).toContain('client_email');
    expect(mensagem).not.toContain('PRIVATE KEY');
    expect(tentar({ FCM_CREDENCIAIS_JSON: '{nao json' })).toContain(
      'JSON inválido',
    );
    expect(tentar({ FCM_CREDENCIAIS_ARQUIVO: '/nao/existe.json' })).toContain(
      'FCM_CREDENCIAIS_ARQUIVO',
    );
  });
});

import { Logger } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { importPKCS8, SignJWT } from 'jose';
import { z } from 'zod';
import {
  Dispositivo,
  Enviador,
  MensagemPush,
  ResultadoEnvio,
} from './enviador';

/**
 * Conta de serviço do Firebase (o JSON baixado no console). Só estes campos
 * são usados; a chave privada nunca vai para log nem para mensagem de erro.
 */
const contaSchema = z.object({
  type: z.literal('service_account'),
  project_id: z.string().min(1),
  client_email: z.email(),
  private_key: z.string().includes('PRIVATE KEY'),
  token_uri: z.url().default('https://oauth2.googleapis.com/token'),
});

export type ContaDeServico = z.infer<typeof contaSchema>;

export class CredenciaisInvalidas extends Error {}

/**
 * Lê a conta de serviço de FCM_CREDENCIAIS_JSON (conteúdo) ou de
 * FCM_CREDENCIAIS_ARQUIVO (caminho fora do repositório). Sem nenhuma das
 * duas, devolve null e o notificador usa o adaptador falso.
 */
export function lerCredenciais(env: {
  FCM_CREDENCIAIS_JSON?: string;
  FCM_CREDENCIAIS_ARQUIVO?: string;
}): ContaDeServico | null {
  let bruto = env.FCM_CREDENCIAIS_JSON?.trim();
  if (!bruto && env.FCM_CREDENCIAIS_ARQUIVO) {
    try {
      bruto = readFileSync(env.FCM_CREDENCIAIS_ARQUIVO, 'utf8');
    } catch {
      throw new CredenciaisInvalidas(
        'FCM_CREDENCIAIS_ARQUIVO: arquivo não encontrado ou ilegível',
      );
    }
  }
  if (!bruto) return null;
  let json: unknown;
  try {
    json = JSON.parse(bruto);
  } catch {
    throw new CredenciaisInvalidas('Credenciais do FCM: JSON inválido');
  }
  const conta = contaSchema.safeParse(json);
  if (!conta.success) {
    const campos = conta.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new CredenciaisInvalidas(
      `Credenciais do FCM: conta de serviço inválida (${campos})`,
    );
  }
  return conta.data;
}

type Fetch = typeof fetch;

const ESCOPO = 'https://www.googleapis.com/auth/firebase.messaging';
const CANAL_ANDROID = 'avisos';

interface ErroFcm {
  error?: {
    code?: number;
    status?: string;
    message?: string;
    details?: Array<{ '@type'?: string; errorCode?: string }>;
  };
}

/**
 * Adaptador FCM HTTP v1 (Android e iOS): uma mensagem por token, com o token
 * de acesso OAuth 2.0 da conta de serviço (JWT assinado com a chave dela,
 * trocado no Google e guardado até perto de vencer).
 *
 * Classificação das respostas (documentação do FCM v1):
 * - UNREGISTERED (404) e SENDER_ID_MISMATCH (403): o token não vale mais ou é
 *   de outro projeto → token_invalido (o aparelho é apagado);
 * - INVALID_ARGUMENT (400) citando o token → token_invalido; outro 400 → erro;
 * - QUOTA_EXCEEDED (429), UNAVAILABLE (503), INTERNAL (500) e falha de rede
 *   → temporario (tenta de novo);
 * - 401: token de acesso recusado → renova e conta como temporario;
 * - THIRD_PARTY_AUTH_ERROR (chave da APNs) e o resto → erro.
 */
export class EnviadorFcm extends Enviador {
  readonly nome = 'fcm';
  private acesso: { token: string; validoAte: number } | null = null;
  private readonly log = new Logger('EnviadorFcm');

  constructor(
    private readonly conta: ContaDeServico,
    private readonly opcoes: { validarApenas?: boolean; fetch?: Fetch } = {},
  ) {
    super();
  }

  get projeto(): string {
    return this.conta.project_id;
  }

  private get http(): Fetch {
    return this.opcoes.fetch ?? fetch;
  }

  /** Token de acesso OAuth 2.0, renovado 5 minutos antes de vencer. */
  async tokenDeAcesso(): Promise<string> {
    if (this.acesso && this.acesso.validoAte > Date.now() + 5 * 60_000) {
      return this.acesso.token;
    }
    const chave = await importPKCS8(this.conta.private_key, 'RS256');
    const agora = Math.floor(Date.now() / 1000);
    const assercao = await new SignJWT({ scope: ESCOPO })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuer(this.conta.client_email)
      .setSubject(this.conta.client_email)
      .setAudience(this.conta.token_uri)
      .setIssuedAt(agora)
      .setExpirationTime(agora + 3600)
      .sign(chave);
    const resposta = await this.http(this.conta.token_uri, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: assercao,
      }).toString(),
    });
    if (!resposta.ok) {
      throw new Error(
        `FCM: o Google recusou a conta de serviço (HTTP ${resposta.status})`,
      );
    }
    const corpo = (await resposta.json()) as {
      access_token: string;
      expires_in: number;
    };
    this.acesso = {
      token: corpo.access_token,
      validoAte: Date.now() + corpo.expires_in * 1000,
    };
    return corpo.access_token;
  }

  /** Corpo da mensagem v1: aviso visível e os dados que abrem o registro. */
  mensagemV1(mensagem: MensagemPush, dispositivo: Dispositivo) {
    const dados: Record<string, string> = { url: mensagem.dados.url };
    if (mensagem.dados.eventoId) dados.eventoId = mensagem.dados.eventoId;
    return {
      ...(this.opcoes.validarApenas ? { validate_only: true } : {}),
      message: {
        token: dispositivo.token,
        notification: { title: mensagem.titulo, body: mensagem.corpo },
        data: dados,
        android: {
          priority: 'NORMAL',
          notification: { channel_id: CANAL_ANDROID },
        },
        apns: {
          headers: { 'apns-priority': '5', 'apns-push-type': 'alert' },
          payload: { aps: { 'thread-id': 'avisos' } },
        },
      },
    };
  }

  async enviar(
    mensagem: MensagemPush,
    dispositivo: Dispositivo,
  ): Promise<ResultadoEnvio> {
    let resposta: Response;
    try {
      resposta = await this.http(
        `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(this.conta.project_id)}/messages:send`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${await this.tokenDeAcesso()}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(this.mensagemV1(mensagem, dispositivo)),
        },
      );
    } catch (erro) {
      this.log.warn({ msg: 'FCM inacessível', erro: String(erro) });
      return 'temporario';
    }
    if (resposta.ok) return 'ok';
    const corpo = (await resposta.json().catch(() => ({}))) as ErroFcm;
    const resultado = classificar(resposta.status, corpo);
    if (resposta.status === 401) this.acesso = null;
    if (resultado === 'erro') {
      this.log.warn({
        msg: 'FCM recusou a mensagem',
        status: resposta.status,
        erro: corpo.error?.status,
        detalhe: codigoFcm(corpo),
      });
    }
    return resultado;
  }
}

function codigoFcm(corpo: ErroFcm): string | undefined {
  return corpo.error?.details?.find((d) => d.errorCode)?.errorCode;
}

/** Resposta de erro do FCM v1 → o que fazer com o aviso e o aparelho. */
export function classificar(status: number, corpo: ErroFcm): ResultadoEnvio {
  const codigo = codigoFcm(corpo) ?? corpo.error?.status;
  if (codigo === 'UNREGISTERED' || codigo === 'SENDER_ID_MISMATCH') {
    return 'token_invalido';
  }
  if (status === 404) return 'token_invalido';
  if (status === 400 || codigo === 'INVALID_ARGUMENT') {
    const texto = corpo.error?.message ?? '';
    return /registration token|message\.token/i.test(texto)
      ? 'token_invalido'
      : 'erro';
  }
  if (
    status === 401 ||
    status === 429 ||
    status >= 500 ||
    codigo === 'QUOTA_EXCEEDED' ||
    codigo === 'UNAVAILABLE' ||
    codigo === 'INTERNAL'
  ) {
    return 'temporario';
  }
  return 'erro';
}

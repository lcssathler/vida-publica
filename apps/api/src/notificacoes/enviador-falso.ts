import { Logger } from '@nestjs/common';
import {
  Dispositivo,
  Enviador,
  MensagemPush,
  ResultadoEnvio,
} from './enviador';

export interface EnvioRegistrado {
  em: Date;
  plataforma: Dispositivo['plataforma'];
  sessaoId: string;
  mensagem: MensagemPush;
}

/**
 * Adaptador falso: não sai nada para a rede. Registra cada envio no log (com
 * só o começo do token) e em memória. É o que roda sem credenciais do FCM.
 * Tokens começando com "invalido" respondem como token inválido, para
 * exercitar a limpeza de aparelhos.
 */
export class EnviadorFalso extends Enviador {
  readonly nome = 'falso';
  readonly enviados: EnvioRegistrado[] = [];
  private readonly log = new Logger('EnviadorFalso');

  enviar(
    mensagem: MensagemPush,
    dispositivo: Dispositivo,
  ): Promise<ResultadoEnvio> {
    if (dispositivo.token.startsWith('invalido')) {
      return Promise.resolve('token_invalido');
    }
    this.enviados.push({
      em: new Date(),
      plataforma: dispositivo.plataforma,
      sessaoId: dispositivo.sessaoId,
      mensagem,
    });
    this.log.log({
      msg: 'envio falso',
      plataforma: dispositivo.plataforma,
      token: `${dispositivo.token.slice(0, 8)}…`,
      titulo: mensagem.titulo,
      url: mensagem.dados.url,
    });
    return Promise.resolve('ok');
  }
}

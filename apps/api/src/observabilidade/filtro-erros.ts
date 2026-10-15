import { ArgumentsHost, Catch, HttpException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { capturarErro } from './instrumentar';

/**
 * Filtro global: erros inesperados (não HttpException, ou 5xx) vão ao Sentry;
 * a resposta continua a mesma do Nest. 4xx (token inválido, 404, 429) não são
 * erro do sistema e não vão.
 */
@Catch()
export class FiltroDeErros extends BaseExceptionFilter {
  catch(erro: unknown, host: ArgumentsHost): void {
    if (!(erro instanceof HttpException) || erro.getStatus() >= 500) {
      const req = host
        .switchToHttp()
        .getRequest<{ method?: string; route?: { path?: string } }>();
      capturarErro(erro, { metodo: req?.method, rota: req?.route?.path });
    }
    super.catch(erro, host);
  }
}

import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  Inject,
  Param,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodPipe } from '../comum/zod.pipe';
import { Limite } from '../limite/politicas';
import { Publico, UsuarioAtual } from './auth.guard';
import {
  AuthService,
  ParDeTokens,
  RefreshRecusado,
  ResultadoLogin,
} from './auth.service';
import type { Identificacao } from './tokens';
import {
  IdentidadeInvalida,
  ProvedorDesligado,
} from './verificador-identidade';

const anonimoSchema = z.object({
  plataforma: z.enum(['ios', 'android', 'web']).nullable().default(null),
});

const renovarSchema = z.object({
  refresh: z.string().min(16).max(256),
});

const loginSchema = z.object({
  token: z.string().min(16).max(8192),
});

const provedorSchema = z.enum(['apple', 'google']);

@ApiTags('autenticação')
@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Publico()
  @Limite('contas')
  @Post('anonimo')
  @ApiOperation({ summary: 'Cria a conta anônima do aparelho' })
  anonimo(
    @Body(new ZodPipe(anonimoSchema)) corpo: z.infer<typeof anonimoSchema>,
  ): Promise<ParDeTokens> {
    return this.auth.anonimo(corpo.plataforma);
  }

  @Publico()
  @Post('renovar')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Troca o refresh token por um par novo (o antigo deixa de valer)',
  })
  async renovar(
    @Body(new ZodPipe(renovarSchema)) corpo: z.infer<typeof renovarSchema>,
  ): Promise<ParDeTokens> {
    try {
      return await this.auth.renovar(corpo.refresh);
    } catch (erro) {
      if (erro instanceof RefreshRecusado) {
        throw new UnauthorizedException(
          erro.reusado
            ? 'Refresh token já usado: a sessão foi encerrada'
            : 'Refresh token inválido',
        );
      }
      throw erro;
    }
  }

  @Post('sair')
  @HttpCode(204)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Encerra a sessão deste aparelho' })
  async sair(@UsuarioAtual() usuario: Identificacao): Promise<void> {
    await this.auth.sair(usuario.sessaoId);
  }

  @Post('entrar/:provedor')
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Login com Apple ou Google: vincula à conta do aparelho ou entra numa conta existente',
  })
  async entrar(
    @UsuarioAtual() usuario: Identificacao,
    @Param('provedor', new ZodPipe(provedorSchema))
    provedor: z.infer<typeof provedorSchema>,
    @Body(new ZodPipe(loginSchema)) corpo: z.infer<typeof loginSchema>,
  ): Promise<ResultadoLogin> {
    try {
      return await this.auth.entrar(usuario, provedor, corpo.token);
    } catch (erro) {
      if (erro instanceof IdentidadeInvalida) {
        throw new ForbiddenException('Token do provedor inválido');
      }
      if (erro instanceof ProvedorDesligado) {
        throw new ServiceUnavailableException(
          `Login com ${provedor} não está configurado`,
        );
      }
      throw erro;
    }
  }
}

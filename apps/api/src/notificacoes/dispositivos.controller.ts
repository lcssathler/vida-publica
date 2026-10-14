import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { UsuarioAtual } from '../auth/auth.guard';
import type { Identificacao } from '../auth/tokens';
import { ZodPipe } from '../comum/zod.pipe';
import { DispositivosRepositorio } from './dispositivos.repositorio';
import { Plataforma } from './enviador';

// Token de registro do FCM: só letras, dígitos e _ : . -
const dispositivoSchema = z
  .object({
    token: z.string().regex(/^[A-Za-z0-9_:.-]{32,4096}$/, 'token inválido'),
    plataforma: z.enum(['android', 'ios']),
  })
  .strict();

@ApiTags('notificacoes')
@ApiBearerAuth()
@Controller('dispositivo')
export class DispositivosController {
  constructor(
    @Inject(DispositivosRepositorio)
    private readonly dispositivos: DispositivosRepositorio,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Se esta sessão tem aparelho registrado para avisos',
  })
  async ver(
    @UsuarioAtual() usuario: Identificacao,
  ): Promise<{ registrado: boolean; plataforma: Plataforma | null }> {
    const d = await this.dispositivos.daSessao(usuario.sessaoId);
    return { registrado: !!d, plataforma: d?.plataforma ?? null };
  }

  @Put()
  @HttpCode(204)
  @ApiOperation({
    summary:
      'Registra o token de envio do FCM desta sessão (só o token e a plataforma)',
  })
  async registrar(
    @UsuarioAtual() usuario: Identificacao,
    @Body(new ZodPipe(dispositivoSchema))
    corpo: { token: string; plataforma: Plataforma },
  ): Promise<void> {
    await this.dispositivos.registrar(
      usuario.sessaoId,
      corpo.token,
      corpo.plataforma,
    );
  }

  @Delete()
  @HttpCode(204)
  @ApiOperation({
    summary: 'Apaga o token desta sessão: para de receber avisos',
  })
  async remover(@UsuarioAtual() usuario: Identificacao): Promise<void> {
    await this.dispositivos.remover(usuario.sessaoId);
  }
}

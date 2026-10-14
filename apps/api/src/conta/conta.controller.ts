import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Patch,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { UsuarioAtual } from '../auth/auth.guard';
import type { Identificacao } from '../auth/tokens';
import { ZodPipe } from '../comum/zod.pipe';
import { FUSOS, type Preferencias, UFS } from './conta.repositorio';
import { type Conta, ContaService } from './conta.service';

const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'use HH:MM');

const preferenciasSchema = z
  .object({
    uf: z.enum(UFS).nullable(),
    notificacoes: z.boolean(),
    resumoSemanal: z.boolean(),
    maxPorDia: z.number().int().min(1).max(20),
    silencioInicio: hora,
    silencioFim: hora,
    fuso: z.enum(FUSOS),
  })
  .partial()
  .strict()
  .refine((p) => Object.keys(p).length > 0, 'nada para alterar');

@ApiTags('conta')
@ApiBearerAuth()
@Controller('conta')
export class ContaController {
  constructor(@Inject(ContaService) private readonly conta: ContaService) {}

  @Get()
  @ApiOperation({
    summary: 'Conta do usuário: logins vinculados, o que segue, preferências',
  })
  async ver(@UsuarioAtual() usuario: Identificacao): Promise<Conta> {
    const conta = await this.conta.conta(usuario.usuarioId);
    if (!conta) throw new NotFoundException('Conta não encontrada');
    return conta;
  }

  @Get('preferencias')
  @ApiOperation({ summary: 'Preferências (padrões até a primeira mudança)' })
  preferencias(@UsuarioAtual() usuario: Identificacao): Promise<Preferencias> {
    return this.conta.preferencias(usuario.usuarioId);
  }

  @Patch('preferencias')
  @ApiOperation({ summary: 'Altera só os campos enviados' })
  salvar(
    @UsuarioAtual() usuario: Identificacao,
    @Body(new ZodPipe(preferenciasSchema)) mudancas: Partial<Preferencias>,
  ): Promise<Preferencias> {
    return this.conta.salvarPreferencias(usuario.usuarioId, mudancas);
  }

  @Delete()
  @HttpCode(204)
  @ApiOperation({
    summary: 'Exclui a conta e tudo o que é dela, de forma definitiva',
  })
  async excluir(@UsuarioAtual() usuario: Identificacao): Promise<void> {
    await this.conta.excluir(usuario.usuarioId);
  }
}

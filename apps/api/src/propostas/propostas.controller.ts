import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { UsuarioAtual } from '../auth/auth.guard';
import type { Identificacao } from '../auth/tokens';
import { ZodPipe } from '../comum/zod.pipe';
import { type Proposta, PropostasService } from './propostas.service';

@ApiTags('propostas')
@ApiBearerAuth()
@Controller('propostas')
export class PropostasController {
  constructor(
    @Inject(PropostasService) private readonly propostas: PropostasService,
  ) {}

  @Get(':id')
  @ApiOperation({
    summary:
      'Proposta com autores, temas e linha do tempo (tramitações, votações e eventos)',
  })
  async proposta(
    @UsuarioAtual() usuario: Identificacao,
    @Param('id', new ZodPipe(z.uuid())) id: string,
  ): Promise<Proposta> {
    const proposta = await this.propostas.proposta(id, usuario.usuarioId);
    if (!proposta) throw new NotFoundException('Proposta não encontrada');
    return proposta;
  }
}

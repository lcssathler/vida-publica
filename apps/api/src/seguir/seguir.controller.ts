import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Put,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsuarioAtual } from '../auth/auth.guard';
import type { Identificacao } from '../auth/tokens';
import { ZodPipe } from '../comum/zod.pipe';
import { type Alvo, alvoSchema } from './alvo';
import type { AlvoSeguido, Assunto } from './seguindo.repositorio';
import {
  AlvoInexistente,
  LIMITE_SEGUINDO,
  LimiteSeguindo,
  SeguirService,
} from './seguir.service';

@ApiTags('seguir')
@ApiBearerAuth()
@Controller()
export class SeguirController {
  constructor(@Inject(SeguirService) private readonly seguir: SeguirService) {}

  @Get('seguindo')
  @ApiOperation({ summary: 'Pessoas, partidos, propostas e assuntos seguidos' })
  async listar(
    @UsuarioAtual() usuario: Identificacao,
  ): Promise<{ itens: AlvoSeguido[] }> {
    return { itens: await this.seguir.listar(usuario.usuarioId) };
  }

  @Put('seguindo/:tipo/:id')
  @ApiOperation({ summary: 'Segue uma pessoa, partido, proposta ou assunto' })
  async seguirAlvo(
    @UsuarioAtual() usuario: Identificacao,
    @Param(new ZodPipe(alvoSchema)) alvo: Alvo,
  ): Promise<{ seguindo: true; novo: boolean }> {
    try {
      const novo = await this.seguir.seguir(usuario.usuarioId, alvo);
      return { seguindo: true, novo };
    } catch (erro) {
      if (erro instanceof AlvoInexistente) {
        throw new NotFoundException(`${alvo.tipo} não encontrado`);
      }
      if (erro instanceof LimiteSeguindo) {
        throw new UnprocessableEntityException(
          `Limite de ${LIMITE_SEGUINDO} itens seguidos`,
        );
      }
      throw erro;
    }
  }

  @Delete('seguindo/:tipo/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Deixa de seguir' })
  async deixar(
    @UsuarioAtual() usuario: Identificacao,
    @Param(new ZodPipe(alvoSchema)) alvo: Alvo,
  ): Promise<void> {
    await this.seguir.deixar(usuario.usuarioId, alvo);
  }

  @Get('assuntos')
  @ApiOperation({ summary: 'Temas oficiais das proposições, para seguir' })
  async assuntos(): Promise<{ itens: Assunto[] }> {
    return { itens: await this.seguir.assuntos() };
  }
}

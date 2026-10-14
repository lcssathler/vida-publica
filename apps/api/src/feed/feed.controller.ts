import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { UsuarioAtual } from '../auth/auth.guard';
import type { Identificacao } from '../auth/tokens';
import { ZodPipe } from '../comum/zod.pipe';
import { CursorInvalido } from './cursor';
import type { EventoFeed } from './evento';
import { TIPOS_EVENTO } from './evento';
import { FeedService, type RespostaFeed } from './feed.service';

/** Aceita o parâmetro repetido (?tipo=a&tipo=b) ou separado por vírgula. */
const tipos = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((v) =>
    v === undefined ? [] : [v].flat().flatMap((t) => t.split(',')),
  )
  .pipe(z.array(z.enum(TIPOS_EVENTO)).max(TIPOS_EVENTO.length));

/** Temas têm vírgula no nome: só o parâmetro repetido (?assunto=a&assunto=b). */
const assuntos = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((v) => (v === undefined ? [] : [v].flat()))
  .pipe(z.array(z.string().trim().min(1).max(200)).max(20));

export const consultaFeedSchema = z.object({
  escopo: z.enum(['seguindo', 'todos']).default('seguindo'),
  tipo: tipos,
  assunto: assuntos,
  cursor: z.string().max(200).optional(),
  limite: z.coerce.number().int().min(1).max(50).default(20),
});

export type ConsultaFeedHttp = z.infer<typeof consultaFeedSchema>;

@ApiTags('feed')
@ApiBearerAuth()
@Controller()
export class FeedController {
  constructor(@Inject(FeedService) private readonly feed: FeedService) {}

  @Get('feed')
  @ApiOperation({
    summary:
      'Feed de eventos publicados, do mais recente, com cursor e filtros por tipo e assunto',
  })
  async pagina(
    @UsuarioAtual() usuario: Identificacao,
    @Query(new ZodPipe(consultaFeedSchema)) consulta: ConsultaFeedHttp,
  ): Promise<RespostaFeed> {
    try {
      return await this.feed.pagina({
        usuarioId: usuario.usuarioId,
        escopo: consulta.escopo,
        tipos: consulta.tipo,
        assuntos: consulta.assunto,
        alvo: null,
        cursor: consulta.cursor ?? null,
        limite: consulta.limite,
      });
    } catch (erro) {
      if (erro instanceof CursorInvalido) {
        throw new BadRequestException('Cursor inválido');
      }
      throw erro;
    }
  }

  @Get('eventos/:id')
  @ApiOperation({
    summary: 'Detalhe do evento, com a fonte e a regra que o gerou',
  })
  async evento(
    @UsuarioAtual() usuario: Identificacao,
    @Param('id', new ZodPipe(z.uuid())) id: string,
  ): Promise<EventoFeed> {
    const evento = await this.feed.evento(id, usuario.usuarioId);
    if (!evento) throw new NotFoundException('Evento não encontrado');
    return evento;
  }
}

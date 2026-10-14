import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { UsuarioAtual } from '../auth/auth.guard';
import type { Identificacao } from '../auth/tokens';
import { ZodPipe } from '../comum/zod.pipe';
import { Limite } from '../limite/politicas';
import { BuscaService, type ResultadoBusca } from './busca.service';

const buscaSchema = z
  .object({
    q: z.string().trim().min(2).max(100),
    tipo: z.enum(['pessoa', 'partido', 'proposicao', 'assunto']).optional(),
    limite: z.coerce.number().int().min(1).max(50).optional(),
  })
  // Todos os grupos: até 5 de cada (máx. 20); um grupo só: até 20 (máx. 50).
  .refine((c) => c.tipo !== undefined || (c.limite ?? 5) <= 20, {
    path: ['limite'],
    message: 'sem tipo, o limite é 20 por grupo',
  });

@ApiTags('busca')
@ApiBearerAuth()
@Controller('busca')
export class BuscaController {
  constructor(@Inject(BuscaService) private readonly busca: BuscaService) {}

  @Get()
  @Limite('busca')
  @ApiOperation({
    summary:
      'Busca pessoas, partidos, propostas e assuntos, em português, sem acento',
  })
  buscar(
    @UsuarioAtual() usuario: Identificacao,
    @Query(new ZodPipe(buscaSchema)) c: z.infer<typeof buscaSchema>,
  ): Promise<ResultadoBusca> {
    return this.busca.buscar(
      usuario.usuarioId,
      c.q,
      c.tipo ?? null,
      c.limite ?? (c.tipo ? 20 : 5),
    );
  }
}

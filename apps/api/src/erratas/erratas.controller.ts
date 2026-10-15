import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import { UsuarioAtual } from '../auth/auth.guard';
import type { Identificacao } from '../auth/tokens';
import { semCpf } from '../comum/cpf';
import { ZodPipe } from '../comum/zod.pipe';
import {
  ErratasRepositorio,
  MOTIVOS_REPORTE,
  type ErrataPublica,
} from './erratas.repositorio';

const consultaSchema = z.object({
  cursor: z.string().max(200).optional(),
  limite: z.coerce.number().int().min(1).max(50).default(20),
});

const reporteSchema = z.object({
  motivo: z.enum(MOTIVOS_REPORTE),
  texto: z.string().trim().max(1000).optional(),
});

function lerCursor(cursor: string): { publicadaEm: string; id: string } {
  try {
    const dados = JSON.parse(Buffer.from(cursor, 'base64url').toString()) as {
      p?: unknown;
      i?: unknown;
    };
    if (
      typeof dados.p === 'string' &&
      typeof dados.i === 'string' &&
      z.uuid().safeParse(dados.i).success &&
      !Number.isNaN(Date.parse(dados.p))
    ) {
      return { publicadaEm: dados.p, id: dados.i };
    }
  } catch {
    // cai no erro abaixo
  }
  throw new BadRequestException('Cursor inválido');
}

const escreverCursor = (c: { publicadaEm: string; id: string }) =>
  Buffer.from(JSON.stringify({ p: c.publicadaEm, i: c.id })).toString(
    'base64url',
  );

@ApiTags('erratas')
@ApiBearerAuth()
@Controller()
export class ErratasController {
  constructor(
    @Inject(ErratasRepositorio) private readonly erratas: ErratasRepositorio,
  ) {}

  @Get('erratas')
  @ApiOperation({
    summary:
      'Erratas publicadas, da mais recente: o que estava errado e o que foi corrigido',
  })
  async pagina(
    @UsuarioAtual() usuario: Identificacao,
    @Query(new ZodPipe(consultaSchema))
    consulta: z.infer<typeof consultaSchema>,
  ): Promise<{ erratas: ErrataPublica[]; proximoCursor: string | null }> {
    const pagina = await this.erratas.pagina(
      usuario.usuarioId,
      consulta.cursor ? lerCursor(consulta.cursor) : null,
      consulta.limite,
    );
    return {
      erratas: pagina.erratas,
      proximoCursor: pagina.proximo ? escreverCursor(pagina.proximo) : null,
    };
  }

  @Post('eventos/:id/reporte')
  @HttpCode(201)
  @ApiOperation({
    summary:
      'Reportar erro num evento (um por conta e evento); vai para a revisão humana',
  })
  async reportar(
    @UsuarioAtual() usuario: Identificacao,
    @Param('id', new ZodPipe(z.uuid())) id: string,
    @Body(new ZodPipe(reporteSchema)) corpo: z.infer<typeof reporteSchema>,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ recebido: true }> {
    // CPF nunca é guardado, nem o que a pessoa escreveu por engano.
    const texto = corpo.texto ? semCpf(corpo.texto) : null;
    const resultado = await this.erratas.reportar(
      usuario.usuarioId,
      id,
      corpo.motivo,
      texto,
    );
    if (resultado === 'invisivel') {
      throw new NotFoundException('Evento não encontrado');
    }
    if (resultado === 'repetido') res.status(200);
    return { recebido: true };
  }
}

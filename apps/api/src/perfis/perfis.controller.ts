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
import { CursorInvalido } from '../feed/cursor';
import type { RespostaFeed } from '../feed/feed.service';
import type { Alvo } from '../seguir/alvo';
import { NOMES_CATEGORIAS } from './categorias';
import {
  type DoadoresPessoa,
  type PerfilPartido,
  type PerfilPessoa,
  PerfisService,
} from './perfis.service';

const eventosSchema = z.object({
  categoria: z.enum(NOMES_CATEGORIAS).optional(),
  cursor: z.string().max(200).optional(),
  limite: z.coerce.number().int().min(1).max(50).default(20),
});
type ConsultaEventos = z.infer<typeof eventosSchema>;

const doadoresSchema = z.object({
  ano: z.coerce.number().int().min(1990).max(2100).optional(),
});

const idPessoa = new ZodPipe(z.uuid());
const idPartido = new ZodPipe(z.string().regex(/^[1-9][0-9]{0,8}$/));

@ApiTags('perfis')
@ApiBearerAuth()
@Controller()
export class PerfisController {
  constructor(@Inject(PerfisService) private readonly perfis: PerfisService) {}

  @Get('pessoas/:id')
  @ApiOperation({
    summary:
      'Perfil de pessoa: mandatos, partido, candidaturas, cota e eventos por categoria',
  })
  async pessoa(
    @UsuarioAtual() usuario: Identificacao,
    @Param('id', idPessoa) id: string,
  ): Promise<PerfilPessoa> {
    const perfil = await this.perfis.pessoa(id, usuario.usuarioId);
    if (!perfil) throw new NotFoundException('Pessoa não encontrada');
    return perfil;
  }

  @Get('pessoas/:id/eventos')
  @ApiOperation({ summary: 'Eventos da pessoa, por categoria, com cursor' })
  eventosPessoa(
    @UsuarioAtual() usuario: Identificacao,
    @Param('id', idPessoa) id: string,
    @Query(new ZodPipe(eventosSchema)) consulta: ConsultaEventos,
  ): Promise<RespostaFeed> {
    return this.eventos({ tipo: 'pessoa', id }, usuario, consulta);
  }

  @Get('pessoas/:id/doadores')
  @ApiOperation({
    summary:
      'Quem financiou as candidaturas: pessoa física nomeada só acima de R$ 10 mil',
  })
  async doadores(
    @Param('id', idPessoa) id: string,
    @Query(new ZodPipe(doadoresSchema))
    consulta: z.infer<typeof doadoresSchema>,
  ): Promise<DoadoresPessoa> {
    const doadores = await this.perfis.doadores(id, consulta.ano ?? null);
    if (!doadores) throw new NotFoundException('Sem candidatura nesse ano');
    return doadores;
  }

  @Get('partidos/:id')
  @ApiOperation({
    summary:
      'Perfil de partido: história, parlamentares em exercício, repasses e eventos por categoria',
  })
  async partido(
    @UsuarioAtual() usuario: Identificacao,
    @Param('id', idPartido) id: string,
  ): Promise<PerfilPartido> {
    const perfil = await this.perfis.partido(id, usuario.usuarioId);
    if (!perfil) throw new NotFoundException('Partido não encontrado');
    return perfil;
  }

  @Get('partidos/:id/eventos')
  @ApiOperation({ summary: 'Eventos do partido, por categoria, com cursor' })
  eventosPartido(
    @UsuarioAtual() usuario: Identificacao,
    @Param('id', idPartido) id: string,
    @Query(new ZodPipe(eventosSchema)) consulta: ConsultaEventos,
  ): Promise<RespostaFeed> {
    return this.eventos({ tipo: 'partido', id }, usuario, consulta);
  }

  private async eventos(
    alvo: Alvo,
    usuario: Identificacao,
    consulta: ConsultaEventos,
  ): Promise<RespostaFeed> {
    try {
      return await this.perfis.eventos(
        alvo,
        usuario.usuarioId,
        consulta.categoria ?? null,
        consulta.cursor ?? null,
        consulta.limite,
      );
    } catch (erro) {
      if (erro instanceof CursorInvalido) {
        throw new BadRequestException('Cursor inválido');
      }
      throw erro;
    }
  }
}

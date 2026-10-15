import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { pareceCpf } from '../comum/cpf';
import { ZodPipe } from '../comum/zod.pipe';
import { ContadorRequisicoes } from '../limite/contador';
import { AdminAtual, Livre, SemSessao } from './admin.guard';
import type { SessaoAdmin } from './contas.repositorio';
import { ContasAdminService } from './contas.service';
import { RevisaoRepositorio, Revisor } from './revisao.repositorio';

const pagina = z.coerce.number().int().min(1).max(10_000).default(1);
const paginaSchema = z.object({ pagina });
const nota = z.string().trim().max(1000).optional();
const uuid = z.uuid();

const entrarSchema = z.object({
  email: z.string().trim().toLowerCase().max(200),
  senha: z.string().min(1).max(200),
  codigo: z.string().trim().max(10),
});

const eventosSchema = z.object({
  status: z.enum(['segurado', 'publicado', 'arquivado']).default('segurado'),
  motivo: z
    .enum([
      'carga_inicial',
      'revisao_valor',
      'fonte_removeu',
      'regra_substituida',
      'admin',
    ])
    .optional(),
  tipo: z
    .string()
    .regex(/^[a-z][a-z0-9_]*$/)
    .optional(),
  q: z.string().trim().min(2).max(200).optional(),
  pagina,
});

const revisarSchema = z.object({
  acao: z.enum(['publicar', 'arquivar']),
  itens: z
    .array(
      z.object({ id: uuid, contentHash: z.string().regex(/^[0-9a-f]{64}$/) }),
    )
    .min(1)
    .max(100),
  nota,
});

const fonteSchema = z.enum(['senado', 'camara', 'tse']);

const resolverSchema = z.discriminatedUnion('decisao', [
  z.object({ decisao: z.literal('vincular'), pessoaId: uuid, nota }),
  z.object({ decisao: z.literal('nova'), nota }),
  z.object({
    decisao: z.literal('descartar'),
    nota: z.string().trim().min(3).max(1000),
  }),
]);

const errataSchema = z.object({
  titulo: z.string().trim().min(5).max(200),
  texto: z.string().trim().min(10).max(4000),
  eventoId: uuid.nullable().default(null),
  pessoaId: uuid.nullable().default(null),
  reporteIds: z.array(uuid).max(100).default([]),
  arquivarEvento: z.boolean().default(false),
});

/** Tentativas de login por IP a cada 15 minutos (além do bloqueio por conta). */
const LOGIN_POR_IP = 10;
const JANELA_LOGIN_MS = 15 * 60_000;

const revisor = (admin: SessaoAdmin): Revisor => ({
  id: admin.usuarioId,
  nome: admin.nome,
});

/** Pessoa ou evento citado que não existe (chave estrangeira). */
function chaveInexistente(erro: unknown): boolean {
  return (erro as { code?: string }).code === '23503';
}

/**
 * Rotas do painel de revisão. Rodam só no processo do admin (src/admin/admin.ts),
 * com o usuário vp_admin do banco; a API do app não as tem.
 */
@Controller()
export class AdminController {
  constructor(
    @Inject(ContasAdminService) private readonly contas: ContasAdminService,
    @Inject(RevisaoRepositorio) private readonly revisao: RevisaoRepositorio,
    @Inject(ContadorRequisicoes) private readonly contador: ContadorRequisicoes,
  ) {}

  @Livre()
  @Get('health')
  saude() {
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()) };
  }

  @SemSessao()
  @Post('admin/entrar')
  @HttpCode(200)
  async entrar(
    @Req() req: Request,
    @Body(new ZodPipe(entrarSchema)) corpo: z.infer<typeof entrarSchema>,
  ) {
    const registro = this.contador.registrar(
      `login:${req.ip ?? '?'}`,
      LOGIN_POR_IP,
      JANELA_LOGIN_MS,
    );
    if (!registro.permitido) {
      throw new HttpException(
        'Muitas tentativas: espere alguns minutos',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const resultado = await this.contas.entrar({
      ...corpo,
      ip: req.ip ?? null,
    });
    if (!resultado.ok) {
      throw new UnauthorizedException(
        resultado.motivo === 'bloqueado'
          ? 'Conta bloqueada por tentativas erradas: espere 15 minutos'
          : 'E-mail, senha ou código incorretos',
      );
    }
    return resultado;
  }

  @Post('admin/sair')
  @HttpCode(204)
  async sair(@AdminAtual() admin: SessaoAdmin): Promise<void> {
    await this.contas.sair(admin.sessaoId);
  }

  @Get('admin/eu')
  eu(@AdminAtual() admin: SessaoAdmin) {
    return {
      id: admin.usuarioId,
      nome: admin.nome,
      email: admin.email,
      expiraEm: admin.expiraEm,
    };
  }

  @Get('admin/resumo')
  resumo() {
    return this.revisao.resumo();
  }

  @Get('admin/eventos')
  eventos(
    @Query(new ZodPipe(eventosSchema)) consulta: z.infer<typeof eventosSchema>,
  ) {
    return this.revisao.eventos({ ...consulta, porPagina: 50 });
  }

  @Get('admin/eventos/:id')
  async evento(@Param('id', new ZodPipe(uuid)) id: string) {
    const evento = await this.revisao.evento(id);
    if (!evento) throw new NotFoundException('Evento não encontrado');
    return evento;
  }

  @Post('admin/eventos/revisar')
  @HttpCode(200)
  revisar(
    @AdminAtual() admin: SessaoAdmin,
    @Body(new ZodPipe(revisarSchema)) corpo: z.infer<typeof revisarSchema>,
  ) {
    return this.revisao.revisarEventos(
      corpo.acao,
      corpo.itens,
      revisor(admin),
      corpo.nota ?? null,
    );
  }

  @Get('admin/casamentos')
  casamentos(
    @Query(
      new ZodPipe(
        z.object({
          status: z
            .enum(['pendente', 'resolvido', 'descartado'])
            .default('pendente'),
        }),
      ),
    )
    consulta: {
      status: 'pendente' | 'resolvido' | 'descartado';
    },
  ) {
    return this.revisao.casamentos(consulta.status);
  }

  @Get('admin/casamentos/:fonte/:idFonte')
  async casamento(
    @Param('fonte', new ZodPipe(fonteSchema)) fonte: string,
    @Param('idFonte', new ZodPipe(z.string().max(100))) idFonte: string,
  ) {
    const casamento = await this.revisao.casamento(fonte, idFonte);
    if (!casamento) throw new NotFoundException('Casamento não encontrado');
    return casamento;
  }

  @Get('admin/pessoas')
  pessoas(
    @Query(new ZodPipe(z.object({ q: z.string().trim().min(3).max(200) })))
    consulta: {
      q: string;
    },
  ) {
    return this.revisao.buscarPessoas(consulta.q);
  }

  @Post('admin/casamentos/:fonte/:idFonte')
  @HttpCode(200)
  async resolver(
    @AdminAtual() admin: SessaoAdmin,
    @Param('fonte', new ZodPipe(fonteSchema)) fonte: string,
    @Param('idFonte', new ZodPipe(z.string().max(100))) idFonte: string,
    @Body(new ZodPipe(resolverSchema)) corpo: z.infer<typeof resolverSchema>,
  ) {
    const decisao =
      corpo.decisao === 'vincular'
        ? { tipo: 'vincular' as const, pessoaId: corpo.pessoaId }
        : { tipo: corpo.decisao };
    try {
      const resultado = await this.revisao.resolverCasamento(
        fonte,
        idFonte,
        decisao,
        revisor(admin),
        corpo.nota ?? null,
      );
      if (!resultado.ok) {
        throw new ConflictException('Este casamento não está mais pendente');
      }
      return resultado;
    } catch (erro) {
      if (chaveInexistente(erro)) {
        throw new BadRequestException('Pessoa não encontrada');
      }
      throw erro;
    }
  }

  @Get('admin/reportes')
  reportes(
    @Query(
      new ZodPipe(
        z.object({
          status: z
            .enum(['aberto', 'corrigido', 'descartado'])
            .default('aberto'),
        }),
      ),
    )
    consulta: {
      status: 'aberto' | 'corrigido' | 'descartado';
    },
  ) {
    return this.revisao.reportes(consulta.status);
  }

  @Post('admin/reportes/:id/descartar')
  @HttpCode(204)
  async descartarReporte(
    @AdminAtual() admin: SessaoAdmin,
    @Param('id', new ZodPipe(uuid)) id: string,
    @Body(new ZodPipe(z.object({ nota }))) corpo: { nota?: string },
  ): Promise<void> {
    const ok = await this.revisao.descartarReporte(
      id,
      revisor(admin),
      corpo.nota ?? null,
    );
    if (!ok) throw new ConflictException('Este reporte não está mais aberto');
  }

  @Get('admin/erratas')
  erratas(@Query(new ZodPipe(paginaSchema)) consulta: { pagina: number }) {
    return this.revisao.erratas(consulta.pagina, 50);
  }

  @Post('admin/erratas')
  async publicarErrata(
    @AdminAtual() admin: SessaoAdmin,
    @Body(new ZodPipe(errataSchema)) corpo: z.infer<typeof errataSchema>,
  ) {
    // CPF nunca, também nas erratas.
    if (pareceCpf(corpo.titulo) || pareceCpf(corpo.texto)) {
      throw new BadRequestException(
        'O texto tem algo parecido com CPF: retire antes de publicar',
      );
    }
    if (corpo.arquivarEvento && !corpo.eventoId) {
      throw new BadRequestException('Arquivar exige o evento da errata');
    }
    try {
      const id = await this.revisao.publicarErrata(corpo, revisor(admin));
      return { id };
    } catch (erro) {
      if (chaveInexistente(erro)) {
        throw new BadRequestException('Evento ou pessoa não encontrados');
      }
      throw erro;
    }
  }

  @Get('admin/fontes')
  fontes() {
    return this.revisao.fontes();
  }

  @Get('admin/acoes')
  acoes(@Query(new ZodPipe(paginaSchema)) consulta: { pagina: number }) {
    return this.revisao.acoes(consulta.pagina, 100);
  }
}

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AdminModule } from '../src/admin/admin.module';
import { ContasAdminRepositorio } from '../src/admin/contas.repositorio';
import { RELOGIO_ADMIN } from '../src/admin/contas.service';
import { IpsPermitidos } from '../src/admin/ips';
import {
  cifrar,
  codigoTotp,
  hashSenha,
  lerChave,
  passoTotp,
  segredoTotp,
} from '../src/admin/cripto';
import {
  ItemRevisao,
  RevisaoRepositorio,
  Revisor,
} from '../src/admin/revisao.repositorio';
import { criarApp } from './fakes/app';
import { MemoriaContas } from './fakes/memoria-contas-admin';

// A mesma chave do vitest.config.mts (ADMIN_TOTP_CHAVE).
const CHAVE = 'chave-de-teste-do-2fa-'.repeat(2);

/** Só o que estes testes usam; o resto da porta tem teste de integração. */
class RevisaoFalsa {
  revisoes: Array<{ acao: string; itens: ItemRevisao[]; revisor: Revisor }> =
    [];
  erratas: Array<{ titulo: string }> = [];
  resumo() {
    return Promise.resolve({
      segurados: [],
      casamentosPendentes: 7,
      reportesAbertos: 0,
      erratas: 0,
    });
  }
  revisarEventos(acao: string, itens: ItemRevisao[], revisor: Revisor) {
    this.revisoes.push({ acao, itens, revisor });
    return Promise.resolve({
      revisados: itens.map((i) => i.id),
      recusados: [],
    });
  }
  publicarErrata(dados: { titulo: string }) {
    this.erratas.push(dados);
    return Promise.resolve('errata-1');
  }
}

describe('Painel de revisão (processo do admin)', () => {
  let app: INestApplication<App>;
  let contas: MemoriaContas;
  let revisao: RevisaoFalsa;
  const segredo = segredoTotp();
  let agora = new Date('2026-10-15T12:00:00Z');

  async function iniciar(ips: string) {
    contas = new MemoriaContas();
    contas.contas.set('a1', {
      id: 'a1',
      email: 'revisora@exemplo.org',
      nome: 'Revisora',
      senhaHash: await hashSenha('senha-certa-longa'),
      totpSegredo: cifrar(segredo, lerChave(CHAVE)),
      totpUltimoPasso: 0,
      ativo: true,
      falhas: 0,
      bloqueadoAte: null,
    });
    revisao = new RevisaoFalsa();
    const modulo = await Test.createTestingModule({ imports: [AdminModule] })
      .overrideProvider(ContasAdminRepositorio)
      .useValue(contas)
      .overrideProvider(RevisaoRepositorio)
      .useValue(revisao)
      .overrideProvider(IpsPermitidos)
      .useValue(new IpsPermitidos(ips.split(',').filter(Boolean)))
      .overrideProvider(RELOGIO_ADMIN)
      .useValue(() => agora)
      .compile();
    app = modulo.createNestApplication<INestApplication<App>>();
    await app.init();
  }

  afterEach(async () => {
    await app.close();
  });

  async function entrar() {
    agora = new Date(agora.getTime() + 60_000);
    const resposta = await request(app.getHttpServer())
      .post('/admin/entrar')
      .send({
        email: 'Revisora@Exemplo.org',
        senha: 'senha-certa-longa',
        codigo: codigoTotp(segredo, passoTotp(agora)),
      })
      .expect(200);
    return `Bearer ${(resposta.body as { token: string }).token}`;
  }

  it('IP fora da lista não chega nem ao login; a saúde responde', async () => {
    await iniciar('10.0.0.0/8');
    await request(app.getHttpServer())
      .post('/admin/entrar')
      .send({ email: 'x@y.z', senha: 'x', codigo: '000000' })
      .expect(403);
    await request(app.getHttpServer()).get('/admin/resumo').expect(403);
    await request(app.getHttpServer()).get('/health').expect(200);
  });

  it('lista vazia de IPs: ninguém entra', async () => {
    await iniciar('');
    await request(app.getHttpServer())
      .post('/admin/entrar')
      .send({})
      .expect(403);
  });

  it('sem sessão do painel, 401; com login e 2FA, revisa com o nome de quem revisou', async () => {
    await iniciar('127.0.0.1,::1');
    await request(app.getHttpServer()).get('/admin/resumo').expect(401);
    await request(app.getHttpServer())
      .get('/admin/resumo')
      .set('authorization', 'Bearer token-do-app')
      .expect(401);
    const auth = await entrar();
    const resumo = await request(app.getHttpServer())
      .get('/admin/resumo')
      .set('authorization', auth)
      .expect(200);
    expect(resumo.body).toMatchObject({ casamentosPendentes: 7 });
    const id = '6f1b6f4e-4f3a-4c55-9c39-0d7f2c1e5a11';
    await request(app.getHttpServer())
      .post('/admin/eventos/revisar')
      .set('authorization', auth)
      .send({ acao: 'publicar', itens: [{ id, contentHash: 'a'.repeat(64) }] })
      .expect(200, { revisados: [id], recusados: [] });
    expect(revisao.revisoes[0].revisor).toEqual({ id: 'a1', nome: 'Revisora' });
    // Sem a versão vista (content_hash), recusa.
    await request(app.getHttpServer())
      .post('/admin/eventos/revisar')
      .set('authorization', auth)
      .send({ acao: 'publicar', itens: [{ id }] })
      .expect(400);
    await request(app.getHttpServer())
      .post('/admin/sair')
      .set('authorization', auth)
      .expect(204);
    await request(app.getHttpServer())
      .get('/admin/resumo')
      .set('authorization', auth)
      .expect(401);
  });

  it('errata com algo parecido com CPF não é publicada', async () => {
    await iniciar('127.0.0.1,::1');
    const auth = await entrar();
    await request(app.getHttpServer())
      .post('/admin/erratas')
      .set('authorization', auth)
      .send({
        titulo: 'Correção de doador',
        texto: 'O doador de CPF 123.456.789-09 estava errado.',
      })
      .expect(400);
    await request(app.getHttpServer())
      .post('/admin/erratas')
      .set('authorization', auth)
      .send({
        titulo: 'Correção de doador',
        texto: 'O valor da doação estava somado duas vezes.',
      })
      .expect(201, { id: 'errata-1' });
    expect(revisao.erratas).toHaveLength(1);
  });

  it('login errado responde igual e para de aceitar tentativas do mesmo IP', async () => {
    await iniciar('127.0.0.1,::1');
    for (let i = 0; i < 10; i++) {
      const r = await request(app.getHttpServer())
        .post('/admin/entrar')
        .send({ email: `x${i}@exemplo.org`, senha: 'x', codigo: '000000' });
      expect(r.status).toBe(401);
    }
    await request(app.getHttpServer())
      .post('/admin/entrar')
      .send({ email: 'x@exemplo.org', senha: 'x', codigo: '000000' })
      .expect(429);
  });
});

describe('API do app não tem as rotas do painel', () => {
  it('404 em /admin, com ou sem token do app', async () => {
    const t = await criarApp();
    const { authorization } = await t.anonimo();
    await request(t.app.getHttpServer())
      .get('/admin/resumo')
      .set('authorization', authorization)
      .expect(404);
    await request(t.app.getHttpServer())
      .post('/admin/entrar')
      .send({})
      .expect(404);
    await t.app.close();
  });
});

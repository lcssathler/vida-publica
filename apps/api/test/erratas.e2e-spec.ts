import request from 'supertest';
import { AppDeTeste, criarApp } from './fakes/app';

describe('Erratas e "Reportar erro" (e2e)', () => {
  let t: AppDeTeste;

  beforeAll(async () => {
    t = await criarApp();
  });

  afterAll(async () => {
    await t.app.close();
  });

  it('exige token', async () => {
    await request(t.app.getHttpServer()).get('/erratas').expect(401);
    await request(t.app.getHttpServer())
      .post(`/eventos/${crypto.randomUUID()}/reporte`)
      .send({ motivo: 'outro' })
      .expect(401);
  });

  it('lista as erratas da mais recente, por cursor, com o evento só se visível', async () => {
    const { authorization } = await t.anonimo();
    const visivel = t.feed.adicionar({ ocorridoEm: new Date('2026-10-01') });
    const arquivado = t.feed.adicionar({
      ocorridoEm: new Date('2026-10-02'),
      status: 'arquivado',
    });
    const base = Date.parse('2026-10-15T12:00:00Z');
    t.erratas.publicar('Errata A', visivel, new Date(base));
    t.erratas.publicar('Errata B', arquivado, new Date(base + 1000));
    t.erratas.publicar('Errata C', null, new Date(base + 2000));

    const p1 = await request(t.app.getHttpServer())
      .get('/erratas?limite=2')
      .set('authorization', authorization)
      .expect(200);
    const corpo1 = p1.body as {
      erratas: Array<{ titulo: string; evento: { id: string } | null }>;
      proximoCursor: string;
    };
    expect(corpo1.erratas.map((e) => e.titulo)).toEqual([
      'Errata C',
      'Errata B',
    ]);
    expect(corpo1.erratas[1].evento).toBeNull(); // arquivado: não aparece
    const p2 = await request(t.app.getHttpServer())
      .get(`/erratas?limite=2&cursor=${corpo1.proximoCursor}`)
      .set('authorization', authorization)
      .expect(200);
    const corpo2 = p2.body as typeof corpo1;
    expect(corpo2.erratas.map((e) => e.titulo)).toEqual(['Errata A']);
    expect(corpo2.erratas[0].evento?.id).toBe(visivel);
    expect(corpo2.proximoCursor).toBeNull();
    await request(t.app.getHttpServer())
      .get('/erratas?cursor=lixo')
      .set('authorization', authorization)
      .expect(400);
  });

  it('reporta um evento visível uma vez, sem guardar CPF', async () => {
    const { authorization, usuarioId } = await t.anonimo();
    const evento = t.feed.adicionar({ ocorridoEm: new Date('2026-10-03') });
    await request(t.app.getHttpServer())
      .post(`/eventos/${evento}/reporte`)
      .set('authorization', authorization)
      .send({
        motivo: 'pessoa_errada',
        texto: 'Não é ele. Meu CPF é 123.456.789-09',
      })
      .expect(201, { recebido: true });
    await request(t.app.getHttpServer())
      .post(`/eventos/${evento}/reporte`)
      .set('authorization', authorization)
      .send({ motivo: 'outro' })
      .expect(200, { recebido: true });
    const meus = t.erratas.reportes.filter((r) => r.usuarioId === usuarioId);
    expect(meus).toEqual([
      {
        usuarioId,
        eventoId: evento,
        motivo: 'pessoa_errada',
        texto: 'Não é ele. Meu CPF é [CPF removido]',
      },
    ]);
  });

  it('recusa evento invisível, motivo desconhecido e texto longo', async () => {
    const { authorization } = await t.anonimo();
    const segurado = t.feed.adicionar({
      ocorridoEm: new Date('2026-10-04'),
      status: 'segurado',
    });
    await request(t.app.getHttpServer())
      .post(`/eventos/${segurado}/reporte`)
      .set('authorization', authorization)
      .send({ motivo: 'outro' })
      .expect(404);
    const evento = t.feed.adicionar({ ocorridoEm: new Date('2026-10-04') });
    await request(t.app.getHttpServer())
      .post(`/eventos/${evento}/reporte`)
      .set('authorization', authorization)
      .send({ motivo: 'nao_gostei' })
      .expect(400);
    await request(t.app.getHttpServer())
      .post(`/eventos/${evento}/reporte`)
      .set('authorization', authorization)
      .send({ motivo: 'outro', texto: 'x'.repeat(1001) })
      .expect(400);
  });
});

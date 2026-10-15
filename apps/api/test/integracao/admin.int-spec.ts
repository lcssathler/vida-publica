import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { PostgresContasAdminRepositorio } from '../../src/admin/postgres-contas.repositorio';
import { PostgresRevisaoRepositorio } from '../../src/admin/postgres-revisao.repositorio';
import { Revisor } from '../../src/admin/revisao.repositorio';
import { hashToken } from '../../src/admin/cripto';
import { Db } from '../../src/db/db';
import { dbDeTeste, Semente } from './banco';

/** Conexão com o usuário vp_admin (o processo do painel). */
function dbAdmin(): Db {
  const url = process.env.VP_ADMIN_TEST_DATABASE_URL;
  if (!url)
    throw new Error('Defina VP_ADMIN_TEST_DATABASE_URL (usuário vp_admin)');
  return new Db(new Pool({ connectionString: url, max: 2 }));
}

describe('Painel de revisão no Postgres (integração, usuário vp_admin)', () => {
  let admin: Db;
  let api: Db;
  let semente: Semente;
  let contas: PostgresContasAdminRepositorio;
  let revisao: PostgresRevisaoRepositorio;
  let revisor: Revisor;
  const usuariosApp: string[] = [];
  const erratas: string[] = [];
  const casamentos: string[] = [];

  beforeAll(async () => {
    admin = dbAdmin();
    api = dbDeTeste();
    semente = new Semente();
    contas = new PostgresContasAdminRepositorio(admin);
    revisao = new PostgresRevisaoRepositorio(admin);
    const email = `revisora-${randomUUID().slice(0, 8)}@exemplo.org`;
    const id = await contas.criar({
      email,
      nome: 'Revisora de Teste',
      senhaHash: 'scrypt$1$1$1$a$b',
      totpSegredo: 'v1.a.b.c',
    });
    revisor = { id, nome: 'Revisora de Teste' };
  });

  afterAll(async () => {
    const dono = semente.db;
    await dono.query('DELETE FROM app.usuario WHERE id = ANY($1::uuid[])', [
      usuariosApp,
    ]);
    await dono.query('DELETE FROM feed.errata WHERE id = ANY($1::uuid[])', [
      erratas,
    ]);
    await dono.query(
      `DELETE FROM canon.pessoa_vinculo WHERE fonte = 'senado' AND id_fonte = ANY($1)`,
      [casamentos],
    );
    await dono.query(
      `DELETE FROM canon.match_review WHERE fonte = 'senado' AND id_fonte = ANY($1)`,
      [casamentos],
    );
    await dono.query('DELETE FROM canon.pessoa WHERE nome_exibicao = $1', [
      'Senador da Fila',
    ]);
    await dono.query('DELETE FROM admin.acao WHERE usuario_id = $1', [
      revisor.id,
    ]);
    await dono.query('DELETE FROM admin.usuario WHERE id = $1', [revisor.id]);
    await semente.limpar();
    await admin.fechar();
    await api.fechar();
  });

  it('código do 2FA só vale uma vez; sessão some ao sair e ao desativar', async () => {
    const [{ email }] = await admin.query<{ email: string }>(
      'SELECT email FROM admin.usuario WHERE id = $1',
      [revisor.id],
    );
    await expect(contas.registrarAcesso(revisor.id, 100)).resolves.toBe(true);
    await expect(contas.registrarAcesso(revisor.id, 100)).resolves.toBe(false);
    await expect(contas.registrarAcesso(revisor.id, 99)).resolves.toBe(false);
    const token = randomUUID();
    const sessao = await contas.criarSessao(
      revisor.id,
      hashToken(token),
      '127.0.0.1',
      new Date(Date.now() + 3_600_000),
    );
    await expect(contas.sessaoAtiva(hashToken(token))).resolves.toMatchObject({
      sessaoId: sessao,
      nome: 'Revisora de Teste',
    });
    await contas.encerrarSessao(sessao);
    await expect(contas.sessaoAtiva(hashToken(token))).resolves.toBeNull();
    const outro = randomUUID();
    await contas.criarSessao(
      revisor.id,
      hashToken(outro),
      null,
      new Date(Date.now() + 3_600_000),
    );
    await expect(contas.desativar(email)).resolves.toBe(true);
    await expect(contas.sessaoAtiva(hashToken(outro))).resolves.toBeNull();
    await contas.redefinir(email, {}); // reativa para os outros testes
  });

  it('publica um segurado por valor uma vez, com quem revisou e a ação registrada', async () => {
    const id = await semente.evento({
      ocorridoEm: '2026-10-10T12:00:00Z',
      status: 'segurado',
      tipo: 'repasse',
      valor: 750_000,
    });
    await semente.db.query(
      `UPDATE feed.evento SET motivo = 'revisao_valor' WHERE id = $1`,
      [id],
    );
    const pagina = await revisao.eventos({
      status: 'segurado',
      motivo: 'revisao_valor',
      tipo: 'repasse',
      pagina: 1,
      porPagina: 50,
    });
    const visto = pagina.itens.find((e) => e.id === id);
    expect(visto).toMatchObject({ valor: 750_000, reportesAbertos: 0 });

    const errado = await revisao.revisarEventos(
      'publicar',
      [{ id, contentHash: 'f'.repeat(64) }],
      revisor,
      null,
    );
    expect(errado.recusados).toEqual([{ id, motivo: 'mudou' }]);

    const feito = await revisao.revisarEventos(
      'publicar',
      [{ id, contentHash: visto!.contentHash }],
      revisor,
      'conferido na fonte',
    );
    expect(feito.revisados).toEqual([id]);
    const [linha] = await semente.db.query<{
      status: string;
      motivo: string | null;
      publicado_em: Date | null;
      revisado_por: string;
    }>(
      'SELECT status, motivo, publicado_em, revisado_por FROM feed.evento WHERE id = $1',
      [id],
    );
    expect(linha).toMatchObject({
      status: 'publicado',
      motivo: null,
      revisado_por: `admin:${revisor.id}`,
    });
    expect(linha.publicado_em).not.toBeNull();

    const de_novo = await revisao.revisarEventos(
      'publicar',
      [{ id, contentHash: visto!.contentHash }],
      revisor,
      null,
    );
    expect(de_novo.recusados).toEqual([{ id, motivo: 'nao_segurado' }]);

    const detalhe = await revisao.evento(id);
    expect(detalhe?.revisadoPor).toBe('Revisora de Teste');
    expect(detalhe?.acoes).toHaveLength(1);
    expect(detalhe?.acoes[0]).toMatchObject({
      admin: 'Revisora de Teste',
      acao: 'evento.publicar',
      detalhe: { nota: 'conferido na fonte' },
    });
  });

  it('não publica sem fonte; arquiva com motivo admin', async () => {
    const semFonte = await semente.evento({
      ocorridoEm: '2026-10-10T12:00:00Z',
      status: 'segurado',
      fonteUrl: null,
    });
    const [{ hash }] = await admin.query<{ hash: string }>(
      'SELECT content_hash AS hash FROM feed.evento WHERE id = $1',
      [semFonte],
    );
    const r = await revisao.revisarEventos(
      'publicar',
      [{ id: semFonte, contentHash: hash }],
      revisor,
      null,
    );
    expect(r.recusados).toEqual([{ id: semFonte, motivo: 'sem_fonte' }]);
    const a = await revisao.revisarEventos(
      'arquivar',
      [{ id: semFonte, contentHash: hash }],
      revisor,
      'sem fonte',
    );
    expect(a.revisados).toEqual([semFonte]);
    const [linha] = await admin.query<{ status: string; motivo: string }>(
      'SELECT status, motivo FROM feed.evento WHERE id = $1',
      [semFonte],
    );
    expect(linha).toEqual({ status: 'arquivado', motivo: 'admin' });
  });

  it('errata resolve os reportes, arquiva o evento e não mostra a conta de quem reportou', async () => {
    const evento = await semente.evento({ ocorridoEm: '2026-10-11T12:00:00Z' });
    const [{ id: usuario }] = await api.query<{ id: string }>(
      'INSERT INTO app.usuario DEFAULT VALUES RETURNING id',
    );
    usuariosApp.push(usuario);
    await api.query(
      `INSERT INTO app.reporte (usuario_id, evento_id, motivo, texto)
       VALUES ($1, $2, 'pessoa_errada', 'Não é esta pessoa')`,
      [usuario, evento],
    );
    const abertos = await revisao.reportes('aberto');
    const meu = abertos.find((r) => r.eventoId === evento);
    expect(meu).toMatchObject({
      motivo: 'pessoa_errada',
      texto: 'Não é esta pessoa',
    });
    expect(Object.keys(meu!)).not.toContain('usuarioId');
    await expect(
      admin.query('SELECT usuario_id FROM app.reporte LIMIT 1'),
    ).rejects.toThrow(/permission denied/);

    const errata = await revisao.publicarErrata(
      {
        titulo: 'Voto atribuído à pessoa errada',
        texto:
          'O voto era de outro parlamentar com o mesmo nome. O registro foi retirado.',
        eventoId: evento,
        pessoaId: null,
        reporteIds: [meu!.id],
        arquivarEvento: true,
      },
      revisor,
    );
    erratas.push(errata);
    const corrigidos = await revisao.reportes('corrigido');
    expect(corrigidos.find((r) => r.id === meu!.id)).toMatchObject({
      errataId: errata,
      resolvidoPor: 'Revisora de Teste',
      eventoStatus: 'arquivado',
    });
    const lista = await revisao.erratas(1, 50);
    expect(lista.itens[0]).toMatchObject({
      id: errata,
      publicadaPor: 'Revisora de Teste',
    });
    // A errata não se edita nem se apaga.
    await expect(
      admin.query(`UPDATE feed.errata SET titulo = 'outro' WHERE id = $1`, [
        errata,
      ]),
    ).rejects.toThrow(/permission denied/);
  });

  it('resolve um casamento com pessoa nova e com vínculo manual', async () => {
    const codigo = String(900_000_000 + Math.floor(Math.random() * 1e8));
    casamentos.push(codigo);
    await semente.db.query(
      `INSERT INTO canon.senado_senador (codigo_senado, nome_parlamentar, nome_completo,
                                         em_exercicio, content_hash)
       VALUES ($1, 'Senador da Fila', 'Senador da Fila Completo', false, repeat('0', 64))`,
      [Number(codigo)],
    );
    await semente.db.query(
      `INSERT INTO canon.match_review (fonte, id_fonte, motivo)
       VALUES ('senado', $1, 'sem_data_nascimento')`,
      [codigo],
    );
    const fila = await revisao.casamentos('pendente');
    expect(fila.find((c) => c.idFonte === codigo)).toMatchObject({
      registro: {
        nome: 'Senador da Fila',
        nomeCompleto: 'Senador da Fila Completo',
      },
    });
    const r = await revisao.resolverCasamento(
      'senado',
      codigo,
      { tipo: 'nova' },
      revisor,
      'suplente que nunca concorreu',
    );
    expect(r.ok).toBe(true);
    const [vinculo] = await admin.query<{ pessoa_id: string; metodo: string }>(
      `SELECT pessoa_id, metodo FROM canon.pessoa_vinculo
        WHERE fonte = 'senado' AND id_fonte = $1`,
      [codigo],
    );
    expect(vinculo).toEqual({ pessoa_id: r.pessoaId, metodo: 'manual' });
    const resolvido = await revisao.casamento('senado', codigo);
    expect(resolvido).toMatchObject({
      status: 'resolvido',
      pessoaNome: 'Senador da Fila',
      resolvidoPor: 'Revisora de Teste',
      nota: 'suplente que nunca concorreu',
    });
    // Já resolvido: não resolve de novo.
    await expect(
      revisao.resolverCasamento(
        'senado',
        codigo,
        { tipo: 'descartar' },
        revisor,
        'x',
      ),
    ).resolves.toEqual({ ok: false, pessoaId: null });
  });

  it('o admin não lê ident nem as tabelas de usuário do app', async () => {
    await expect(
      admin.query('SELECT 1 FROM ident.pessoa LIMIT 1'),
    ).rejects.toThrow(/permission denied/);
    await expect(
      admin.query('SELECT 1 FROM app.sessao LIMIT 1'),
    ).rejects.toThrow(/permission denied/);
    await expect(
      admin.query('SELECT 1 FROM app.seguindo LIMIT 1'),
    ).rejects.toThrow(/permission denied/);
  });

  it('a API do app não lê o esquema admin nem escreve erratas', async () => {
    await expect(
      api.query('SELECT 1 FROM admin.usuario LIMIT 1'),
    ).rejects.toThrow(/permission denied/);
    await expect(
      api.query(
        `INSERT INTO feed.errata (titulo, texto, publicada_por)
         VALUES ('Título', 'Texto longo o bastante', gen_random_uuid())`,
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

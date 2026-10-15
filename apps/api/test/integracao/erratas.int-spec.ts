import { Db } from '../../src/db/db';
import { PostgresErratasRepositorio } from '../../src/erratas/postgres-erratas.repositorio';
import { dbDeTeste, Semente } from './banco';

describe('PostgresErratasRepositorio (integração, usuário vp_api)', () => {
  let db: Db;
  let semente: Semente;
  let repo: PostgresErratasRepositorio;
  let usuario: string;
  const erratas: string[] = [];

  beforeAll(async () => {
    db = dbDeTeste();
    semente = new Semente();
    repo = new PostgresErratasRepositorio(db);
    [{ id: usuario }] = await db.query<{ id: string }>(
      'INSERT INTO app.usuario DEFAULT VALUES RETURNING id',
    );
  });

  afterAll(async () => {
    await db.query('DELETE FROM app.usuario WHERE id = $1', [usuario]);
    await semente.db.query(
      'DELETE FROM feed.errata WHERE id = ANY($1::uuid[])',
      [erratas],
    );
    await semente.limpar();
    await db.fechar();
  });

  async function errata(titulo: string, eventoId: string | null, em: string) {
    const [{ id }] = await semente.db.query<{ id: string }>(
      `INSERT INTO feed.errata (evento_id, titulo, texto, publicada_em, publicada_por)
       VALUES ($1, $2, 'Texto fictício da errata', $3, gen_random_uuid()) RETURNING id`,
      [eventoId, titulo, em],
    );
    erratas.push(id);
    return id;
  }

  it('pagina as erratas e só liga o evento quando a conta o vê', async () => {
    const pessoa = await semente.pessoa();
    const visivel = await semente.evento({
      ocorridoEm: '2026-10-01T12:00:00Z',
    });
    const arquivado = await semente.evento({
      ocorridoEm: '2026-10-01T12:00:00Z',
      status: 'arquivado',
    });
    const deSeguidores = await semente.evento({
      ocorridoEm: '2026-10-01T12:00:00Z',
      visibilidade: 'seguidores',
      alvos: [{ tipo: 'pessoa', id: pessoa }],
    });
    // Datas no futuro distante: ficam no topo, à frente das de outros testes.
    await errata('Errata 1', visivel, '9999-01-01T00:00:01Z');
    await errata('Errata 2', arquivado, '9999-01-01T00:00:02Z');
    await errata('Errata 3', deSeguidores, '9999-01-01T00:00:03Z');
    const p1 = await repo.pagina(usuario, null, 2);
    expect(p1.erratas.map((e) => [e.titulo, e.evento?.id ?? null])).toEqual([
      ['Errata 3', null],
      ['Errata 2', null],
    ]);
    const p2 = await repo.pagina(usuario, p1.proximo, 1);
    expect(p2.erratas.map((e) => [e.titulo, e.evento?.id ?? null])).toEqual([
      ['Errata 1', visivel],
    ]);
    // Quem segue a pessoa vê o evento de seguidores.
    await db.query(
      `INSERT INTO app.seguindo (usuario_id, alvo_tipo, alvo_id) VALUES ($1, 'pessoa', $2)`,
      [usuario, pessoa],
    );
    const seguindo = await repo.pagina(usuario, null, 1);
    expect(seguindo.erratas[0].evento?.id).toBe(deSeguidores);
  });

  it('reporta uma vez por conta e evento, só evento visível', async () => {
    const evento = await semente.evento({ ocorridoEm: '2026-10-02T12:00:00Z' });
    const segurado = await semente.evento({
      ocorridoEm: '2026-10-02T12:00:00Z',
      status: 'segurado',
    });
    await expect(
      repo.reportar(usuario, evento, 'outro', 'texto'),
    ).resolves.toBe('criado');
    await expect(
      repo.reportar(usuario, evento, 'fato_errado', null),
    ).resolves.toBe('repetido');
    await expect(repo.reportar(usuario, segurado, 'outro', null)).resolves.toBe(
      'invisivel',
    );
    const [{ n }] = await db.query<{ n: number }>(
      'SELECT count(*)::integer AS n FROM app.reporte WHERE usuario_id = $1',
      [usuario],
    );
    expect(n).toBe(1);
  });
});

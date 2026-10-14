import { randomUUID } from 'node:crypto';
import { MemoriaSeguindo } from '../../test/fakes/memoria-seguindo';
import { alvoSchema } from './alvo';
import {
  AlvoInexistente,
  LIMITE_SEGUINDO,
  LimiteSeguindo,
  SeguirService,
} from './seguir.service';

describe('SeguirService', () => {
  let repo: MemoriaSeguindo;
  let seguir: SeguirService;
  const usuario = 'u-1';

  beforeEach(() => {
    repo = new MemoriaSeguindo();
    seguir = new SeguirService(repo);
  });

  it('segue alvo existente uma vez só', async () => {
    const alvo = repo.cadastrar({ tipo: 'partido', id: '21' }, 'PT');
    await expect(seguir.seguir(usuario, alvo)).resolves.toBe(true);
    await expect(seguir.seguir(usuario, alvo)).resolves.toBe(false);
    await expect(seguir.listar(usuario)).resolves.toMatchObject([
      { tipo: 'partido', id: '21', nome: 'PT' },
    ]);
  });

  it('recusa alvo que não existe no canon', async () => {
    await expect(
      seguir.seguir(usuario, { tipo: 'pessoa', id: randomUUID() }),
    ).rejects.toBeInstanceOf(AlvoInexistente);
  });

  it('deixa de seguir', async () => {
    const alvo = repo.cadastrar({ tipo: 'assunto', id: 'Saúde' }, 'Saúde');
    await seguir.seguir(usuario, alvo);
    await expect(seguir.deixar(usuario, alvo)).resolves.toBe(true);
    await expect(seguir.listar(usuario)).resolves.toEqual([]);
  });

  it(`limita a ${LIMITE_SEGUINDO} itens`, async () => {
    for (let i = 1; i <= LIMITE_SEGUINDO; i++) {
      const alvo = repo.cadastrar({ tipo: 'partido', id: String(i) }, `P${i}`);
      await seguir.seguir(usuario, alvo);
    }
    const mais = repo.cadastrar({ tipo: 'partido', id: '9999' }, 'P9999');
    await expect(seguir.seguir(usuario, mais)).rejects.toBeInstanceOf(
      LimiteSeguindo,
    );
  });
});

describe('alvoSchema', () => {
  it.each([
    ['pessoa', randomUUID()],
    ['proposicao', randomUUID()],
    ['partido', '21'],
    ['assunto', 'Finanças Públicas e Orçamento'],
  ])('aceita %s %s', (tipo, id) => {
    expect(alvoSchema.safeParse({ tipo, id }).success).toBe(true);
  });

  it.each([
    ['pessoa', 'joao'],
    ['partido', 'PT'],
    ['partido', '0'],
    ['proposicao', '123'],
    ['assunto', '   '],
    ['vereador', '1'],
  ])('recusa %s %s', (tipo, id) => {
    expect(alvoSchema.safeParse({ tipo, id }).success).toBe(false);
  });
});

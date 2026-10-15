import { MemoriaContas } from '../../test/fakes/memoria-contas-admin';
import { ContasAdminService, MAX_FALHAS } from './contas.service';
import {
  cifrar,
  codigoTotp,
  hashSenha,
  hashToken,
  lerChave,
  passoTotp,
  segredoTotp,
} from './cripto';

describe('ContasAdminService (login do painel)', () => {
  const chave = lerChave('chave-de-teste-do-servico-'.repeat(2));
  const segredo = segredoTotp();
  let agora = new Date('2026-10-15T12:00:00Z');
  let repo: MemoriaContas;
  let servico: ContasAdminService;

  beforeEach(async () => {
    agora = new Date('2026-10-15T12:00:00Z');
    repo = new MemoriaContas();
    repo.contas.set('a1', {
      id: 'a1',
      email: 'revisora@exemplo.org',
      nome: 'Revisora',
      senhaHash: await hashSenha('senha-certa-longa'),
      totpSegredo: cifrar(segredo, chave),
      totpUltimoPasso: 0,
      ativo: true,
      falhas: 0,
      bloqueadoAte: null,
    });
    servico = new ContasAdminService(
      repo,
      { chaveTotp: chave, sessaoHoras: 8 },
      () => agora,
    );
  });

  const codigo = (deslocamento = 0) =>
    codigoTotp(segredo, passoTotp(agora) + deslocamento);

  it('entra com senha e código; a sessão vale até sair', async () => {
    const r = await servico.entrar({
      email: 'revisora@exemplo.org',
      senha: 'senha-certa-longa',
      codigo: codigo(),
      ip: '127.0.0.1',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.expiraEm.getTime() - agora.getTime()).toBe(8 * 3_600_000);
    expect(repo.sessoes.has(r.token)).toBe(false); // só o hash fica guardado
    const sessao = await servico.sessao(r.token);
    expect(sessao).toMatchObject({ nome: 'Revisora' });
    await servico.sair(sessao!.sessaoId);
    await expect(servico.sessao(r.token)).resolves.toBeNull();
    expect(repo.sessoes.has(hashToken(r.token))).toBe(true);
  });

  it('a mesma resposta para e-mail desconhecido, senha errada e código errado', async () => {
    const tentativas = [
      {
        email: 'outra@exemplo.org',
        senha: 'senha-certa-longa',
        codigo: codigo(),
      },
      { email: 'revisora@exemplo.org', senha: 'errada', codigo: codigo() },
      {
        email: 'revisora@exemplo.org',
        senha: 'senha-certa-longa',
        codigo: '000000',
      },
      {
        email: 'revisora@exemplo.org',
        senha: 'senha-certa-longa',
        codigo: codigo(3),
      },
    ];
    for (const t of tentativas) {
      await expect(servico.entrar({ ...t, ip: null })).resolves.toEqual({
        ok: false,
        motivo: 'credenciais',
      });
    }
  });

  it('o mesmo código não vale duas vezes', async () => {
    const dados = {
      email: 'revisora@exemplo.org',
      senha: 'senha-certa-longa',
      codigo: codigo(),
      ip: null,
    };
    expect((await servico.entrar(dados)).ok).toBe(true);
    expect(await servico.entrar(dados)).toEqual({
      ok: false,
      motivo: 'credenciais',
    });
    // Nem o código do passo anterior, ainda dentro da janela.
    expect((await servico.entrar({ ...dados, codigo: codigo(-1) })).ok).toBe(
      false,
    );
  });

  it(`bloqueia por 15 minutos depois de ${MAX_FALHAS} erros seguidos`, async () => {
    const errado = {
      email: 'revisora@exemplo.org',
      senha: 'errada',
      codigo: codigo(),
      ip: null,
    };
    for (let i = 1; i < MAX_FALHAS; i++) {
      expect(await servico.entrar(errado)).toMatchObject({
        motivo: 'credenciais',
      });
    }
    expect(await servico.entrar(errado)).toMatchObject({ motivo: 'bloqueado' });
    const certo = { ...errado, senha: 'senha-certa-longa' };
    expect(await servico.entrar(certo)).toMatchObject({ motivo: 'bloqueado' });
    agora = new Date(agora.getTime() + 16 * 60_000);
    expect((await servico.entrar({ ...certo, codigo: codigo() })).ok).toBe(
      true,
    );
  });

  it('conta desativada não entra', async () => {
    repo.contas.get('a1')!.ativo = false;
    expect(
      await servico.entrar({
        email: 'revisora@exemplo.org',
        senha: 'senha-certa-longa',
        codigo: codigo(),
        ip: null,
      }),
    ).toEqual({ ok: false, motivo: 'credenciais' });
  });
});

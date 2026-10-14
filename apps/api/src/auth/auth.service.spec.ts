import { configDeTeste } from '../../test/fakes/config';
import { MemoriaUsuarios } from '../../test/fakes/memoria-usuarios';
import { VerificadorFalso } from '../../test/fakes/verificador';
import { AuthService, RefreshRecusado } from './auth.service';
import { Tokens } from './tokens';
import { IdentidadeInvalida } from './verificador-identidade';

describe('AuthService', () => {
  let repo: MemoriaUsuarios;
  let tokens: Tokens;
  let auth: AuthService;

  beforeEach(() => {
    repo = new MemoriaUsuarios();
    tokens = new Tokens(configDeTeste());
    auth = new AuthService(repo, new VerificadorFalso(), tokens);
  });

  it('cria conta anônima com par de tokens', async () => {
    const par = await auth.anonimo('android');
    expect(repo.usuarios.has(par.usuarioId)).toBe(true);
    const id = await tokens.verificarAcesso(par.acesso.token);
    expect(id.usuarioId).toBe(par.usuarioId);
    await expect(auth.sessaoAtiva(id)).resolves.toBe(true);
  });

  it('renova com refresh rotativo: o antigo deixa de valer', async () => {
    const par = await auth.anonimo(null);
    const novo = await auth.renovar(par.refresh.token);
    expect(novo.usuarioId).toBe(par.usuarioId);
    expect(novo.refresh.token).not.toBe(par.refresh.token);
    await expect(auth.renovar(novo.refresh.token)).resolves.toBeDefined();
  });

  it('reuso de refresh encerra a sessão inteira', async () => {
    const par = await auth.anonimo(null);
    const novo = await auth.renovar(par.refresh.token);
    await expect(auth.renovar(par.refresh.token)).rejects.toEqual(
      new RefreshRecusado(true),
    );
    // Nem o token legítimo mais novo vale depois do reuso.
    await expect(auth.renovar(novo.refresh.token)).rejects.toEqual(
      new RefreshRecusado(false),
    );
    const id = await tokens.verificarAcesso(novo.acesso.token);
    await expect(auth.sessaoAtiva(id)).resolves.toBe(false);
  });

  it('recusa refresh desconhecido', async () => {
    await expect(auth.renovar('x'.repeat(43))).rejects.toEqual(
      new RefreshRecusado(false),
    );
  });

  it('sair encerra a sessão e o refresh dela', async () => {
    const par = await auth.anonimo(null);
    const id = await tokens.verificarAcesso(par.acesso.token);
    await auth.sair(id.sessaoId);
    await expect(auth.sessaoAtiva(id)).resolves.toBe(false);
    await expect(auth.renovar(par.refresh.token)).rejects.toBeInstanceOf(
      RefreshRecusado,
    );
  });

  it('primeiro login vincula a identidade à conta do aparelho', async () => {
    const par = await auth.anonimo('ios');
    const id = await tokens.verificarAcesso(par.acesso.token);
    const login = await auth.entrar(id, 'apple', 'valido-token-teste:abc');
    expect(login.usuarioId).toBe(par.usuarioId);
    expect(login.contaExistente).toBe(false);
    await expect(repo.usuarioDaIdentidade('apple', 'abc')).resolves.toBe(
      par.usuarioId,
    );
    // O refresh emitido antes do login não vale mais; o novo vale.
    await expect(auth.renovar(par.refresh.token)).rejects.toBeInstanceOf(
      RefreshRecusado,
    );
    await expect(auth.renovar(login.refresh.token)).resolves.toBeDefined();
  });

  it('login em conta existente funde a conta anônima do aparelho', async () => {
    const primeiro = await auth.anonimo('ios');
    const idPrimeiro = await tokens.verificarAcesso(primeiro.acesso.token);
    await auth.entrar(idPrimeiro, 'google', 'valido-token-teste:g1');

    const fusoes: Array<[string, string]> = [];
    repo.aoFundir.push((origem, destino) => fusoes.push([origem, destino]));

    const segundo = await auth.anonimo('android');
    const idSegundo = await tokens.verificarAcesso(segundo.acesso.token);
    const login = await auth.entrar(
      idSegundo,
      'google',
      'valido-token-teste:g1',
    );

    expect(login.usuarioId).toBe(primeiro.usuarioId);
    expect(login.contaExistente).toBe(true);
    expect(fusoes).toEqual([[segundo.usuarioId, primeiro.usuarioId]]);
    expect(repo.usuarios.has(segundo.usuarioId)).toBe(false);
    const novoId = await tokens.verificarAcesso(login.acesso.token);
    expect(novoId).toEqual({
      usuarioId: primeiro.usuarioId,
      sessaoId: idSegundo.sessaoId,
    });
    await expect(auth.sessaoAtiva(novoId)).resolves.toBe(true);
    await expect(auth.sessaoAtiva(idSegundo)).resolves.toBe(false);
  });

  it('trocar de conta logada não apaga a conta de origem', async () => {
    const a = await auth.anonimo(null);
    const idA = await tokens.verificarAcesso(a.acesso.token);
    await auth.entrar(idA, 'google', 'valido-token-teste:ga');
    const b = await auth.anonimo(null);
    const idB = await tokens.verificarAcesso(b.acesso.token);
    await auth.entrar(idB, 'google', 'valido-token-teste:gb');

    const login = await auth.entrar(idB, 'google', 'valido-token-teste:ga');
    expect(login.usuarioId).toBe(a.usuarioId);
    expect(repo.usuarios.has(b.usuarioId)).toBe(true);
  });

  it('não vincula com token de provedor inválido', async () => {
    const par = await auth.anonimo(null);
    const id = await tokens.verificarAcesso(par.acesso.token);
    await expect(auth.entrar(id, 'apple', 'forjado')).rejects.toBeInstanceOf(
      IdentidadeInvalida,
    );
    expect(repo.identidades.size).toBe(0);
  });
});

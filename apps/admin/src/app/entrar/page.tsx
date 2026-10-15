import { entrar } from './acoes';

export const dynamic = 'force-dynamic';

export default async function Entrar({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; expirou?: string }>;
}) {
  const { erro, expirou } = await searchParams;
  return (
    <main>
      <form action={entrar} className="entrar">
        <h1>Vida Pública · Revisão</h1>
        {expirou ? (
          <p className="aviso" role="status">
            A sessão terminou. Entre de novo.
          </p>
        ) : null}
        {erro ? (
          <p className="aviso erro" role="alert">
            {erro}
          </p>
        ) : null}
        <label>
          E-mail
          <input type="email" name="email" autoComplete="username" required />
        </label>
        <label>
          Senha
          <input type="password" name="senha" autoComplete="current-password" required />
        </label>
        <label>
          Código do app de autenticação
          <input
            type="text"
            name="codigo"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            autoComplete="one-time-code"
            required
          />
        </label>
        <button type="submit">Entrar</button>
        <p className="suave">
          Contas do painel são criadas por quem administra o servidor. Não há cadastro
          aqui.
        </p>
      </form>
    </main>
  );
}

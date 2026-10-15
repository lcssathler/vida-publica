/** Resultado da última ação (vem na URL depois do redirecionamento). */
export function Mensagem({ ok, erro }: { ok?: string; erro?: string }) {
  if (erro) {
    return (
      <p className="aviso erro" role="alert">
        {erro}
      </p>
    );
  }
  if (ok) {
    return (
      <p className="aviso" role="status">
        {ok}
      </p>
    );
  }
  return null;
}

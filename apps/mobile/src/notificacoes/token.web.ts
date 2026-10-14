/** Na versão web (só desenvolvimento) não há envio de avisos nem token. */
export async function tokenDeEnvio(): Promise<string | null> {
  return null;
}

export function ouvirTrocaDeToken(): () => void {
  return () => {};
}

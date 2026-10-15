/** Saúde do painel (healthcheck do contêiner): fora da lista de IPs e sem sessão. */
export function GET() {
  return Response.json({ status: 'ok' });
}

export const dynamic = 'force-dynamic';

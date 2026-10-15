'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITENS = [
  { href: '/', rotulo: 'Resumo' },
  { href: '/eventos', rotulo: 'Eventos segurados' },
  { href: '/casamentos', rotulo: 'Casamentos' },
  { href: '/reportes', rotulo: 'Reportes de erro' },
  { href: '/erratas', rotulo: 'Erratas' },
  { href: '/fontes', rotulo: 'Saúde das fontes' },
  { href: '/acoes', rotulo: 'Registro de ações' },
];

export function Menu() {
  const caminho = usePathname();
  return (
    <nav className="menu" aria-label="Seções do painel">
      {ITENS.map((item) => {
        const atual =
          item.href === '/' ? caminho === '/' : caminho.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={atual ? 'page' : undefined}
          >
            {item.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}

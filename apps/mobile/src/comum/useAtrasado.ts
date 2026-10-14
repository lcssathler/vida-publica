import { useEffect, useState } from 'react';

/** O valor só muda depois de `ms` sem alteração (busca enquanto digita, sem estourar o limite). */
export function useAtrasado<T>(valor: T, ms = 350): T {
  const [atrasado, setAtrasado] = useState(valor);
  useEffect(() => {
    const relogio = setTimeout(() => setAtrasado(valor), ms);
    return () => clearTimeout(relogio);
  }, [valor, ms]);
  return atrasado;
}

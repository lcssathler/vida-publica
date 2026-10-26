/** Busca local tolerante a acentos, sem enviar os termos à API. */
export function correspondeBusca(texto: string, busca: string): boolean {
  const normalizar = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
  return normalizar(texto).includes(normalizar(busca.trim()));
}

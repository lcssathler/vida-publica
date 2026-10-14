import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { useSessao } from '../sessao/Sessao';
import { caminhoFeed, type FiltrosFeed } from '../feed/caminho';
import type {
  Alvo,
  AlvoSeguido,
  Assunto,
  CategoriaPerfil,
  Conta,
  DoadoresPessoa,
  EventoFeed,
  Parlamentar,
  PerfilPartido,
  PerfilPessoa,
  Preferencias,
  Proposta,
  GrupoBusca,
  RespostaFeed,
  ResultadoBusca,
  Uf,
} from './tipos';

export const chaves = {
  seguindo: ['seguindo'] as const,
  assuntos: ['assuntos'] as const,
  parlamentares: (uf: Uf) => ['parlamentares', uf] as const,
  preferencias: ['preferencias'] as const,
  feed: ['feed'] as const,
  evento: (id: string) => ['evento', id] as const,
  pessoa: (id: string) => ['pessoa', id] as const,
  partido: (id: string) => ['partido', id] as const,
  proposta: (id: string) => ['proposta', id] as const,
  conta: ['conta'] as const,
  busca: ['busca'] as const,
};

const chaveAlvo = (alvo: Alvo) => `${alvo.tipo}:${alvo.id}`;

/** Caminho do alvo na API (assuntos têm espaço e vírgula no nome). */
export const caminhoAlvo = (alvo: Alvo) =>
  `/seguindo/${alvo.tipo}/${encodeURIComponent(alvo.id)}`;

export function useSeguindo() {
  const { cliente } = useSessao();
  return useQuery({
    queryKey: chaves.seguindo,
    queryFn: async () => (await cliente.get<{ itens: AlvoSeguido[] }>('/seguindo')).itens,
  });
}

/** Diz se o usuário segue o alvo, pela lista de /seguindo (fonte única). */
export function useEstaSeguindo(): (alvo: Alvo) => boolean {
  const { data } = useSeguindo();
  const conjunto = useMemo(() => new Set((data ?? []).map(chaveAlvo)), [data]);
  return useCallback((alvo: Alvo) => conjunto.has(chaveAlvo(alvo)), [conjunto]);
}

export interface PedidoSeguir {
  alvo: Alvo;
  seguir: boolean;
  /** Nome e detalhe para mostrar na lista antes da resposta da API. */
  nome: string;
  detalhe?: string | null;
}

/** Seguir e deixar de seguir, já refletidos na tela; desfaz se a API recusar. */
export function useSeguir() {
  const { cliente } = useSessao();
  const consultas = useQueryClient();
  return useMutation({
    mutationFn: async ({ alvo, seguir }: PedidoSeguir) => {
      if (seguir) await cliente.put(caminhoAlvo(alvo));
      else await cliente.delete(caminhoAlvo(alvo));
    },
    onMutate: async ({ alvo, seguir, nome, detalhe }) => {
      await consultas.cancelQueries({ queryKey: chaves.seguindo });
      const antes = consultas.getQueryData<AlvoSeguido[]>(chaves.seguindo);
      const sem = (antes ?? []).filter((s) => chaveAlvo(s) !== chaveAlvo(alvo));
      consultas.setQueryData<AlvoSeguido[]>(
        chaves.seguindo,
        seguir
          ? [{ ...alvo, nome, detalhe: detalhe ?? null, desde: new Date().toISOString() }, ...sem]
          : sem,
      );
      return { antes };
    },
    onError: (_erro, _pedido, contexto) => {
      consultas.setQueryData(chaves.seguindo, contexto?.antes);
    },
    onSettled: async () => {
      await consultas.invalidateQueries({ queryKey: chaves.seguindo });
      // O feed "seguindo" e os eventos de campanha dependem de quem se segue.
      await consultas.invalidateQueries({ queryKey: chaves.feed });
      // Perfis trazem "seguindo" e contagens que dependem de quem se segue.
      await consultas.invalidateQueries({ queryKey: ['pessoa'] });
      await consultas.invalidateQueries({ queryKey: ['partido'] });
      await consultas.invalidateQueries({ queryKey: ['proposta'] });
      await consultas.invalidateQueries({ queryKey: chaves.busca });
    },
  });
}

export function useAssuntos() {
  const { cliente } = useSessao();
  return useQuery({
    queryKey: chaves.assuntos,
    queryFn: async () => (await cliente.get<{ itens: Assunto[] }>('/assuntos')).itens,
    staleTime: 24 * 60 * 60 * 1000,
  });
}

export function useParlamentares(uf: Uf | null) {
  const { cliente } = useSessao();
  return useQuery({
    queryKey: chaves.parlamentares(uf ?? 'SP'),
    queryFn: async () =>
      (await cliente.get<{ itens: Parlamentar[] }>(`/parlamentares?uf=${uf}`)).itens,
    enabled: uf !== null,
    staleTime: 60 * 60 * 1000,
  });
}

/** Grava preferências na conta (só os campos enviados). */
export function useSalvarPreferencias() {
  const { cliente } = useSessao();
  const consultas = useQueryClient();
  return useMutation({
    mutationFn: (mudancas: Partial<Preferencias>) =>
      cliente.patch<Preferencias>('/conta/preferencias', mudancas),
    onSuccess: (preferencias) => {
      consultas.setQueryData(chaves.preferencias, preferencias);
      consultas.setQueryData<Conta>(chaves.conta, (conta) => (conta ? { ...conta, preferencias } : conta));
    },
  });
}

export { caminhoFeed, FILTROS_PADRAO, semFiltros, type FiltrosFeed } from '../feed/caminho';

export function useFeed(filtros: FiltrosFeed) {
  const { cliente } = useSessao();
  return useInfiniteQuery({
    queryKey: [...chaves.feed, filtros],
    queryFn: ({ pageParam }) => cliente.get<RespostaFeed>(caminhoFeed(filtros, pageParam)),
    initialPageParam: null as string | null,
    getNextPageParam: (ultima) => ultima.proximoCursor,
  });
}

export function useEvento(id: string) {
  const { cliente } = useSessao();
  return useQuery({
    queryKey: chaves.evento(id),
    queryFn: () => cliente.get<EventoFeed>(`/eventos/${encodeURIComponent(id)}`),
  });
}

export function usePessoa(id: string) {
  const { cliente } = useSessao();
  return useQuery({
    queryKey: chaves.pessoa(id),
    queryFn: () => cliente.get<PerfilPessoa>(`/pessoas/${encodeURIComponent(id)}`),
  });
}

export function usePartido(id: string) {
  const { cliente } = useSessao();
  return useQuery({
    queryKey: chaves.partido(id),
    queryFn: () => cliente.get<PerfilPartido>(`/partidos/${encodeURIComponent(id)}`),
  });
}

export function useDoadores(pessoaId: string, ano: number | null) {
  const { cliente } = useSessao();
  return useQuery({
    queryKey: [...chaves.pessoa(pessoaId), 'doadores', ano],
    queryFn: () =>
      cliente.get<DoadoresPessoa>(`/pessoas/${encodeURIComponent(pessoaId)}/doadores?ano=${ano}`),
    enabled: ano !== null,
  });
}

/** Linha do tempo do perfil (pessoa ou partido), por categoria, com cursor. */
export function useEventosDoPerfil(
  tipo: 'pessoa' | 'partido',
  id: string,
  categoria: CategoriaPerfil | null,
) {
  const { cliente } = useSessao();
  const base = tipo === 'pessoa' ? '/pessoas' : '/partidos';
  return useInfiniteQuery({
    queryKey: [tipo, id, 'eventos', categoria],
    queryFn: ({ pageParam }) => {
      const partes = ['limite=20'];
      if (categoria) partes.push(`categoria=${categoria}`);
      if (pageParam) partes.push(`cursor=${encodeURIComponent(pageParam)}`);
      return cliente.get<RespostaFeed>(`${base}/${encodeURIComponent(id)}/eventos?${partes.join('&')}`);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (ultima) => ultima.proximoCursor,
  });
}

export function useProposta(id: string) {
  const { cliente } = useSessao();
  return useQuery({
    queryKey: chaves.proposta(id),
    queryFn: () => cliente.get<Proposta>(`/propostas/${encodeURIComponent(id)}`),
  });
}

export function useConta() {
  const { cliente } = useSessao();
  return useQuery({ queryKey: chaves.conta, queryFn: () => cliente.get<Conta>('/conta') });
}

/** Busca com no mínimo 2 letras; com grupo, até 50 itens dele. */
export function useBusca(texto: string, grupo: GrupoBusca | null) {
  const { cliente } = useSessao();
  const q = texto.trim();
  return useQuery({
    queryKey: [...chaves.busca, q, grupo],
    queryFn: () =>
      cliente.get<ResultadoBusca>(
        `/busca?q=${encodeURIComponent(q)}${grupo ? `&tipo=${grupo}&limite=50` : ''}`,
      ),
    enabled: q.length >= 2,
    staleTime: 5 * 60 * 1000,
    placeholderData: (anterior) => anterior,
  });
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { useSessao } from '../sessao/Sessao';
import type { Alvo, AlvoSeguido, Assunto, Parlamentar, Preferencias, Uf } from './tipos';

export const chaves = {
  seguindo: ['seguindo'] as const,
  assuntos: ['assuntos'] as const,
  parlamentares: (uf: Uf) => ['parlamentares', uf] as const,
  preferencias: ['preferencias'] as const,
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
    onSettled: () => consultas.invalidateQueries({ queryKey: chaves.seguindo }),
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
    onSuccess: (preferencias) => consultas.setQueryData(chaves.preferencias, preferencias),
  });
}

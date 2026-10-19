import { useSyncExternalStore } from 'react';
import { Appearance, Platform, useColorScheme } from 'react-native';

/** Tema escolhido na Conta: seguir o sistema ou fixar claro ou escuro. */
export type PreferenciaDeTema = 'sistema' | 'claro' | 'escuro';

let atual: PreferenciaDeTema = 'sistema';
const ouvintes = new Set<() => void>();

const DO_SISTEMA = { sistema: 'unspecified', claro: 'light', escuro: 'dark' } as const;

/**
 * Troca o tema do app inteiro. No aparelho também avisa o sistema, para que
 * teclado, painéis nativos e diálogos acompanhem a escolha.
 */
export function definirTema(preferencia: PreferenciaDeTema): void {
  if (preferencia === atual) return;
  atual = preferencia;
  if (Platform.OS !== 'web') Appearance.setColorScheme?.(DO_SISTEMA[preferencia]);
  ouvintes.forEach((ouvir) => ouvir());
}

function ouvir(aviso: () => void) {
  ouvintes.add(aviso);
  return () => ouvintes.delete(aviso);
}

const lerAtual = () => atual;

export function usePreferenciaDeTema(): PreferenciaDeTema {
  return useSyncExternalStore(ouvir, lerAtual, lerAtual);
}

/** O esquema em uso agora: a escolha da pessoa ou, em "sistema", o do aparelho. */
export function useEsquema(): 'light' | 'dark' {
  const preferencia = usePreferenciaDeTema();
  const sistema = useColorScheme();
  if (preferencia === 'claro') return 'light';
  if (preferencia === 'escuro') return 'dark';
  return sistema === 'dark' ? 'dark' : 'light';
}

import Feather from '@expo/vector-icons/Feather';
import type { ComponentProps } from 'react';

export type NomeIcone = ComponentProps<typeof Feather>['name'];

/** Ícone de traço (Feather). Sempre decorativo: o nome do controle vem no rótulo. */
export function Icone({ nome, tamanho = 20, cor }: { nome: NomeIcone; tamanho?: number; cor: string }) {
  return <Feather name={nome} size={tamanho} color={cor} aria-hidden importantForAccessibility="no" />;
}

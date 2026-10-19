import { act, renderHook } from '@testing-library/react-native';
import { Appearance } from 'react-native';
import { definirTema, useEsquema } from '../preferencia';

afterEach(() => act(() => definirTema('sistema')));

it('a escolha da pessoa vence o esquema do aparelho e volta a segui-lo em "sistema"', async () => {
  jest.spyOn(Appearance, 'getColorScheme').mockReturnValue('light');
  const { result } = await renderHook(() => useEsquema());
  expect(result.current).toBe('light');
  await act(() => definirTema('escuro'));
  expect(result.current).toBe('dark');
  await act(() => definirTema('claro'));
  expect(result.current).toBe('light');
});

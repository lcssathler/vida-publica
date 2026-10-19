import {
  dataCurta,
  diaCurto,
  diaIso,
  diaPorExtenso,
  diaRelativo,
  hora,
  inteiro,
  reais,
  semanaCurta,
} from '../../comum/formato';
import { evento } from '../../test/fabricas';
import { montarLinhas } from '../linhas';
import { assuntoDoEvento, fonteDaUrl, protocolo } from '../rotulos';

describe('formato', () => {
  it('converte para o horário de Brasília (UTC−3)', () => {
    expect(hora('2026-10-14T17:32:00.000Z')).toBe('14:32');
    expect(diaIso('2026-10-15T01:00:00.000Z')).toBe('2026-10-14');
    expect(diaCurto('2026-10-14T17:32:00.000Z')).toBe('QUA · 14 OUT 2026');
    expect(diaPorExtenso('2026-10-14T17:32:00.000Z')).toBe('quarta-feira, 14 de outubro de 2026');
    expect(dataCurta('2026-01-05T12:00:00.000Z')).toBe('05/01/2026');
  });

  it('nomeia o dia como Hoje, Ontem ou a data por extenso (no horário de Brasília)', () => {
    const agora = Date.parse('2026-10-15T02:30:00.000Z'); // 14/10, 23:30 em Brasília
    expect(diaRelativo('2026-10-14T12:00:00.000Z', agora)).toBe('Hoje');
    expect(diaRelativo('2026-10-13T12:00:00.000Z', agora)).toBe('Ontem');
    expect(diaRelativo('2026-10-01T12:00:00.000Z', agora)).toBe('1 de outubro');
    expect(diaRelativo('2025-12-31T12:00:00.000Z', agora)).toBe('31 de dezembro de 2025');
    expect(semanaCurta('2026-10-14T12:00:00.000Z')).toBe('qua');
  });

  it('fato só com data (meia-noite em Brasília) não mostra hora', () => {
    expect(hora('2026-10-14T03:00:00.000Z')).toBeNull();
  });

  it('valores em reais e inteiros no formato brasileiro', () => {
    expect(reais(5351.48)).toBe('R$ 5.351,48');
    expect(reais(1234567.5)).toBe('R$ 1.234.567,50');
    expect(reais(0)).toBe('R$ 0,00');
    expect(inteiro(70544)).toBe('70.544');
  });
});

describe('rótulos', () => {
  it('reconhece as fontes oficiais pelo endereço', () => {
    expect(fonteDaUrl('https://dadosabertos.camara.leg.br/api/v2/x')).toEqual({ sigla: 'Câmara', nome: 'Câmara dos Deputados' });
    expect(fonteDaUrl('https://legis.senado.leg.br/dadosabertos/x').sigla).toBe('Senado');
    expect(fonteDaUrl('https://www.senado.gov.br/transparencia/x').sigla).toBe('Senado');
    expect(fonteDaUrl('https://cdn.tse.jus.br/estatistica/x')).toEqual({ sigla: 'TSE', nome: 'Tribunal Superior Eleitoral' });
  });

  it('protocolo com data de Brasília e início do id', () => {
    expect(protocolo(evento({ id: 'abcd1234-0000-4000-8000-000000000000', ocorridoEm: '2026-10-08T15:00:00.000Z' }))).toBe(
      '2026·1008·ABCD',
    );
  });

  it('prefere o assunto que a pessoa segue', () => {
    const e = evento({
      alvos: [
        { tipo: 'assunto', id: 'Saúde', nome: 'Saúde', papel: '', seguindo: false },
        { tipo: 'assunto', id: 'Educação', nome: 'Educação', papel: '', seguindo: true },
      ],
    });
    expect(assuntoDoEvento(e)).toBe('Educação');
    expect(assuntoDoEvento(evento())).toBeNull();
  });
});

describe('montarLinhas', () => {
  const a = evento({ id: 'a', ocorridoEm: '2026-10-14T18:00:00.000Z' });
  const b = evento({ id: 'b', ocorridoEm: '2026-10-14T16:00:00.000Z' });
  const c = evento({ id: 'c', ocorridoEm: '2026-10-13T16:00:00.000Z' });

  const resumo = (linhas: ReturnType<typeof montarLinhas>) =>
    linhas.map((l) => (l.tipo === 'evento' ? `${l.evento.id}${l.novo ? '*' : ''}` : l.tipo === 'dia' ? diaIso(l.iso) : 'PAROU'));

  it('cabeçalho a cada dia de Brasília', () => {
    expect(resumo(montarLinhas([a, b, c], null))).toEqual(['2026-10-14', 'a', 'b', '2026-10-13', 'c']);
  });

  it('grifa o que é mais novo que o marco e põe o divisor antes do já visto', () => {
    expect(resumo(montarLinhas([a, b, c], { ocorridoEm: b.ocorridoEm, id: 'b' }))).toEqual([
      '2026-10-14',
      'a*',
      'PAROU',
      '2026-10-14',
      'b',
      '2026-10-13',
      'c',
    ]);
  });

  it('desempata pelo id no mesmo instante', () => {
    const x = evento({ id: 'x', ocorridoEm: b.ocorridoEm });
    expect(resumo(montarLinhas([x, b], { ocorridoEm: b.ocorridoEm, id: 'b' }))).toEqual([
      '2026-10-14',
      'x*',
      'PAROU',
      '2026-10-14',
      'b',
    ]);
  });

  it('sem nada novo, sem divisor', () => {
    expect(resumo(montarLinhas([b, c], { ocorridoEm: a.ocorridoEm, id: 'a' }))).not.toContain('PAROU');
  });

  it('ignora evento repetido entre páginas', () => {
    expect(resumo(montarLinhas([a, a, b], null))).toEqual(['2026-10-14', 'a', 'b']);
  });
});

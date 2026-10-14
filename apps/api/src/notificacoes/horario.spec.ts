import {
  fimDoSilencio,
  horaLocal,
  inicioDoDia,
  instanteLocal,
} from './horario';

const SP = 'America/Sao_Paulo';

describe('horário no fuso do usuário', () => {
  it('converte instante em hora de parede e de volta', () => {
    const instante = new Date('2026-10-14T01:30:00Z');
    expect(horaLocal(instante, SP)).toMatchObject({
      ano: 2026,
      mes: 10,
      dia: 13,
      minutos: 22 * 60 + 30,
    });
    expect(instanteLocal(2026, 10, 13, 22 * 60 + 30, SP)).toEqual(instante);
    // Manaus é UTC-4; Noronha, UTC-2.
    expect(instanteLocal(2026, 10, 14, 7 * 60, 'America/Manaus')).toEqual(
      new Date('2026-10-14T11:00:00Z'),
    );
    expect(instanteLocal(2026, 10, 14, 7 * 60, 'America/Noronha')).toEqual(
      new Date('2026-10-14T09:00:00Z'),
    );
    // Dia além do fim do mês vira o dia seguinte.
    expect(instanteLocal(2026, 10, 32, 0, SP)).toEqual(
      new Date('2026-11-01T03:00:00Z'),
    );
  });

  it('meia-noite local para o teto diário', () => {
    expect(inicioDoDia(new Date('2026-10-14T02:00:00Z'), SP)).toEqual(
      new Date('2026-10-13T03:00:00Z'),
    );
    expect(inicioDoDia(new Date('2026-10-14T03:00:00Z'), SP)).toEqual(
      new Date('2026-10-14T03:00:00Z'),
    );
  });

  describe('silêncio', () => {
    const noturno = {
      silencioInicio: '22:00',
      silencioFim: '07:00',
      fuso: SP,
    };

    it('atravessando a meia-noite: antes e depois dela', () => {
      // 23:10 em Brasília → termina às 07:00 do dia seguinte
      expect(fimDoSilencio(noturno, new Date('2026-10-15T02:10:00Z'))).toEqual(
        new Date('2026-10-15T10:00:00Z'),
      );
      // 03:00 em Brasília → termina às 07:00 do mesmo dia
      expect(fimDoSilencio(noturno, new Date('2026-10-15T06:00:00Z'))).toEqual(
        new Date('2026-10-15T10:00:00Z'),
      );
    });

    it('fora do silêncio, no início exato e no fim exato', () => {
      expect(
        fimDoSilencio(noturno, new Date('2026-10-15T15:00:00Z')),
      ).toBeNull();
      // 22:00 em ponto já é silêncio; 07:00 em ponto não é.
      expect(fimDoSilencio(noturno, new Date('2026-10-15T01:00:00Z'))).toEqual(
        new Date('2026-10-15T10:00:00Z'),
      );
      expect(
        fimDoSilencio(noturno, new Date('2026-10-15T10:00:00Z')),
      ).toBeNull();
    });

    it('dentro do mesmo dia (13:00–14:00) e desligado (início = fim)', () => {
      const almoco = {
        silencioInicio: '13:00',
        silencioFim: '14:00',
        fuso: SP,
      };
      expect(fimDoSilencio(almoco, new Date('2026-10-15T16:30:00Z'))).toEqual(
        new Date('2026-10-15T17:00:00Z'),
      );
      expect(
        fimDoSilencio(almoco, new Date('2026-10-15T17:30:00Z')),
      ).toBeNull();
      const desligado = {
        silencioInicio: '07:00',
        silencioFim: '07:00',
        fuso: SP,
      };
      for (const h of ['00', '07', '12', '23']) {
        expect(
          fimDoSilencio(desligado, new Date(`2026-10-15T${h}:00:00Z`)),
        ).toBeNull();
      }
    });

    it('usa o fuso do usuário', () => {
      // 23:30 UTC = 20:30 em Brasília, 19:30 em Manaus.
      const agora = new Date('2026-10-15T23:30:00Z');
      const janela = { silencioInicio: '20:00', silencioFim: '06:00' };
      expect(fimDoSilencio({ ...janela, fuso: SP }, agora)).toEqual(
        new Date('2026-10-16T09:00:00Z'),
      );
      expect(
        fimDoSilencio({ ...janela, fuso: 'America/Manaus' }, agora),
      ).toBeNull();
    });
  });
});

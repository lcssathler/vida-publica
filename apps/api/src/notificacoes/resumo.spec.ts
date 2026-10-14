import { EventoFila, MemoriaFila } from '../../test/fakes/memoria-fila';
import { MemoriaResumo } from '../../test/fakes/memoria-resumo';
import { Enviador, Relogio, ResultadoEnvio } from './enviador';
import { EnviadorFalso } from './enviador-falso';
import { CONFIG_FILA_PADRAO, FilaService } from './fila.service';
import { reaisCurto, textoDoResumo } from './resumo';
import { janelaDaSemana, ResumoService } from './resumo.service';

class RelogioFixo extends Relogio {
  constructor(public instante: Date) {
    super();
  }
  agora(): Date {
    return new Date(this.instante);
  }
}

class EnviadorRoteiro extends Enviador {
  readonly nome = 'roteiro';
  constructor(private readonly resposta: ResultadoEnvio) {
    super();
  }
  enviar(): Promise<ResultadoEnvio> {
    return Promise.resolve(this.resposta);
  }
}

const HORA = 3_600_000;
const DIA = 24 * HORA;

describe('texto do resumo semanal', () => {
  it('reais abreviados', () => {
    expect(reaisCurto(950)).toBe('R$ 950');
    expect(reaisCurto(23_400)).toBe('R$ 23,4 mil');
    expect(reaisCurto(100_000)).toBe('R$ 100 mil');
    expect(reaisCurto(1_249_000)).toBe('R$ 1,2 mi');
    expect(reaisCurto(4_961_519_777)).toBe('R$ 5 bi');
  });

  it('só contagens e somas por tipo, período e chamada para o feed', () => {
    expect(
      textoDoResumo('2026-10-05', {
        totais: [
          { tipo: 'doacao', registros: 2, valor: 50_000 },
          { tipo: 'despesa_mensal', registros: 3, valor: 23_400 },
          { tipo: 'repasse', registros: 1, valor: 1_200_000 },
        ],
        excedentes: 8,
      }),
    ).toEqual({
      titulo: 'Resumo da semana de 05/10 a 11/10',
      corpo:
        'Dinheiro de quem você segue: 3 meses de despesas da cota (R$ 23,4 mil); 1 repasse de partido (R$ 1,2 mi); 2 dias de doações (R$ 50 mil). 8 avisos passaram do seu teto diário e estão no feed. Toque para ver no feed.',
      url: 'vidapublica://feed?categorias=gastos,campanha',
    });
  });

  it('só avisos acima do teto, ou nada', () => {
    expect(textoDoResumo('2026-10-12', { totais: [], excedentes: 1 })).toEqual({
      titulo: 'Resumo da semana de 12/10 a 18/10',
      corpo:
        'Nenhum registro novo de dinheiro de quem você segue. 1 aviso passou do seu teto diário e está no feed. Toque para ver no feed.',
      url: 'vidapublica://feed',
    });
    expect(
      textoDoResumo('2026-10-12', { totais: [], excedentes: 0 }),
    ).toBeNull();
  });

  it('janela da semana no fuso: segunda 00:00 até a segunda seguinte', () => {
    expect(janelaDaSemana('2026-10-12', 'America/Sao_Paulo')).toEqual({
      desde: new Date('2026-10-12T03:00:00Z'),
      ate: new Date('2026-10-19T03:00:00Z'),
    });
    expect(janelaDaSemana('2026-10-12', 'America/Manaus').desde).toEqual(
      new Date('2026-10-12T04:00:00Z'),
    );
  });
});

describe('ResumoService', () => {
  // Quarta, 14/10/2026, 15:00 em Brasília: começo da fila.
  const INICIO = new Date('2026-10-14T18:00:00Z');
  // Segunda seguinte, 09:30 em Brasília.
  const SEGUNDA = new Date('2026-10-19T12:30:00Z');
  let fila: MemoriaFila;
  let repo: MemoriaResumo;
  let relogio: RelogioFixo;
  let enviador: EnviadorFalso;
  let filaService: FilaService;
  let resumo: ResumoService;
  let seq = 0;

  function evento(dados: Partial<EventoFila>): EventoFila {
    seq += 1;
    const e: EventoFila = {
      id: `evento-${seq}`,
      tipo: 'repasse',
      titulo: `Fulano recebeu R$ 1.000,00 do diretório (${seq})`,
      resumo: null,
      status: 'publicado',
      fonteUrl: 'https://divulgacandcontas.tse.jus.br',
      ocorridoEm: relogio.agora(),
      publicadoEm: relogio.agora(),
      alvos: ['partido:13'],
      valor: 1000,
      ...dados,
    };
    fila.eventos.push(e);
    return e;
  }

  function criar(e: Enviador = enviador) {
    filaService = new FilaService(fila, e, relogio, CONFIG_FILA_PADRAO);
    resumo = new ResumoService(repo, e, relogio, CONFIG_FILA_PADRAO, {
      hora: '09:00',
    });
  }

  beforeEach(async () => {
    fila = new MemoriaFila();
    repo = new MemoriaResumo(fila);
    relogio = new RelogioFixo(new Date(INICIO.getTime() - DIA));
    enviador = new EnviadorFalso();
    criar();
    fila.seguir('u1', 'partido:13', new Date(INICIO.getTime() - 2 * DIA));
    fila.dispositivos.set('u1', [
      { sessaoId: 's1', token: `tok-${'x'.repeat(40)}`, plataforma: 'android' },
    ]);
    // Publicado antes do início da fila (carga inicial): não entra.
    evento({ valor: 999_999 });
    relogio.instante = INICIO;
    await filaService.ciclo(); // marca o início
    relogio.instante = new Date(INICIO.getTime() + HORA);
  });

  it('na segunda depois da hora, resume a semana anterior e envia uma vez', async () => {
    evento({ valor: 100_000 });
    evento({ valor: 1_100_000 });
    evento({
      tipo: 'despesa_mensal',
      valor: 23_400,
      alvos: ['partido:13', 'pessoa:p1'],
    });
    evento({ tipo: 'doacao', valor: 5_000 });
    evento({ tipo: 'voto_nominal', valor: null }); // não é dinheiro
    evento({ status: 'segurado', valor: 2_000_000 }); // segurado nunca
    evento({ alvos: ['partido:99'], valor: 7 }); // não segue
    // Domingo à noite: ainda não.
    relogio.instante = new Date('2026-10-19T02:00:00Z');
    expect((await resumo.ciclo()).enviados).toBe(0);
    // Segunda 08:59: ainda não.
    relogio.instante = new Date('2026-10-19T11:59:00Z');
    expect((await resumo.ciclo()).gerados).toEqual({});
    relogio.instante = SEGUNDA;
    const r = await resumo.ciclo();
    expect(r).toMatchObject({
      gerados: { pendente: 1 },
      enviados: 1,
      entregas: 1,
    });
    const gravado = repo.de('u1', '2026-10-12')!;
    expect(gravado).toMatchObject({ status: 'enviado', dispositivos: 1 });
    expect(gravado.conteudo.totais).toEqual(
      expect.arrayContaining([
        { tipo: 'repasse', registros: 2, valor: 1_200_000 },
        { tipo: 'despesa_mensal', registros: 1, valor: 23_400 },
        { tipo: 'doacao', registros: 1, valor: 5_000 },
      ]),
    );
    expect(enviador.enviados[0].mensagem).toEqual({
      titulo: 'Resumo da semana de 12/10 a 18/10',
      corpo:
        'Dinheiro de quem você segue: 1 mês de despesas da cota (R$ 23,4 mil); 2 repasses de partido (R$ 1,2 mi); 1 dia de doações (R$ 5 mil). Toque para ver no feed.',
      dados: { url: 'vidapublica://feed?categorias=gastos,campanha' },
    });
    // Rodar de novo, na mesma segunda ou dias depois, não reenvia.
    relogio.instante = new Date(SEGUNDA.getTime() + HORA);
    expect(await resumo.ciclo()).toMatchObject({ gerados: {}, enviados: 0 });
    relogio.instante = new Date(SEGUNDA.getTime() + 3 * DIA);
    expect(await resumo.ciclo()).toMatchObject({ gerados: {}, enviados: 0 });
    expect(enviador.enviados).toHaveLength(1);
  });

  it('inclui os avisos que passaram do teto diário', async () => {
    fila.preferencias.set('u1', { maxPorDia: 1 });
    for (let i = 0; i < 4; i++) evento({ tipo: 'pauta', valor: null });
    expect((await filaService.ciclo()).envio).toMatchObject({
      enviadas: 1,
      resumo: 3,
    });
    relogio.instante = SEGUNDA;
    await resumo.ciclo();
    expect(repo.de('u1', '2026-10-12')).toMatchObject({
      status: 'enviado',
      conteudo: { totais: [], excedentes: 3 },
    });
    expect(enviador.enviados.at(-1)?.mensagem.corpo).toBe(
      'Nenhum registro novo de dinheiro de quem você segue. 3 avisos passaram do seu teto diário e estão no feed. Toque para ver no feed.',
    );
  });

  it('semana sem nada: grava vazio e não manda aviso', async () => {
    relogio.instante = SEGUNDA;
    expect((await resumo.ciclo()).gerados).toEqual({ vazio: 1 });
    expect(enviador.enviados).toEqual([]);
  });

  it('resumo semanal ou avisos desligados: não envia', async () => {
    evento({});
    fila.preferencias.set('u1', { resumoSemanal: false });
    relogio.instante = SEGUNDA;
    expect((await resumo.ciclo()).gerados).toEqual({ descartado: 1 });
    expect(repo.de('u1', '2026-10-12')?.motivo).toBe('desligado');
    expect(enviador.enviados).toEqual([]);
  });

  it('desligar depois de gerado, antes de sair: descarta', async () => {
    evento({});
    fila.preferencias.set('u1', {
      silencioInicio: '09:00',
      silencioFim: '12:00',
    });
    relogio.instante = SEGUNDA;
    expect((await resumo.ciclo()).silencio).toBe(0);
    expect(repo.de('u1', '2026-10-12')).toMatchObject({
      status: 'pendente',
      motivo: 'silencio',
      enviarApos: new Date('2026-10-19T15:00:00Z'),
    });
    fila.preferencias.set('u1', {
      notificacoes: false,
      silencioInicio: '09:00',
      silencioFim: '12:00',
    });
    relogio.instante = new Date('2026-10-19T15:00:00Z');
    expect((await resumo.ciclo()).descartados).toEqual({ desligado: 1 });
  });

  it('respeita o silêncio: espera o fim, no fuso da conta', async () => {
    evento({});
    fila.preferencias.set('u1', {
      silencioInicio: '08:00',
      silencioFim: '10:00',
      fuso: 'America/Manaus',
    });
    // 09:30 em Brasília = 08:30 em Manaus: na hora do resumo de Manaus? Ainda não (09:00 local).
    relogio.instante = SEGUNDA;
    expect((await resumo.ciclo()).gerados).toEqual({});
    // 09:10 em Manaus: devido, mas em silêncio até 10:00 de Manaus.
    relogio.instante = new Date('2026-10-19T13:10:00Z');
    expect((await resumo.ciclo()).gerados).toEqual({ pendente: 1 });
    expect(enviador.enviados).toEqual([]);
    expect(repo.de('u1', '2026-10-12')?.enviarApos).toEqual(
      new Date('2026-10-19T14:00:00Z'),
    );
    relogio.instante = new Date('2026-10-19T14:00:00Z');
    expect((await resumo.ciclo()).enviados).toBe(1);
  });

  it('sem aparelho descarta; token inválido some; falha passageira tenta de novo', async () => {
    evento({});
    fila.seguir('u2', 'partido:13', new Date(INICIO.getTime() - DIA));
    fila.seguir('u3', 'partido:13', new Date(INICIO.getTime() - DIA));
    fila.dispositivos.set('u1', []);
    fila.dispositivos.set('u2', [
      {
        sessaoId: 's2',
        token: `invalido-${'x'.repeat(40)}`,
        plataforma: 'ios',
      },
    ]);
    relogio.instante = SEGUNDA;
    const r = await resumo.ciclo();
    // u1 e u3 sem aparelho; o de u2 era inválido e foi apagado.
    expect(r.descartados).toEqual({ sem_dispositivo: 3 });
    expect(r.tokensRemovidos).toBe(1);
    expect(fila.dispositivos.get('u2')).toEqual([]);

    criar(new EnviadorRoteiro('temporario'));
    fila.dispositivos.set('u3', [
      {
        sessaoId: 's3',
        token: `tok3-${'x'.repeat(40)}`,
        plataforma: 'android',
      },
    ]);
    const u3 = repo.de('u3', '2026-10-12')!;
    u3.status = 'pendente';
    u3.motivo = null;
    expect((await resumo.ciclo()).reagendados).toBe(1);
    expect(u3).toMatchObject({
      status: 'pendente',
      motivo: 'erro_envio',
      tentativas: 1,
    });
  });

  it('usuário com outro notificador fica para a próxima rodada', async () => {
    evento({});
    repo.travados.add('u1');
    relogio.instante = SEGUNDA;
    expect((await resumo.ciclo()).ocupados).toBe(1);
    repo.travados.clear();
    expect((await resumo.ciclo()).enviados).toBe(1);
  });
});

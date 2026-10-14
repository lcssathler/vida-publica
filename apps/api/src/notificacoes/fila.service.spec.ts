import { EventoFila, MemoriaFila } from '../../test/fakes/memoria-fila';
import {
  Dispositivo,
  Enviador,
  MensagemPush,
  Relogio,
  ResultadoEnvio,
} from './enviador';
import { EnviadorFalso } from './enviador-falso';
import { CONFIG_FILA_PADRAO, FilaService } from './fila.service';

class RelogioFixo extends Relogio {
  constructor(public instante: Date) {
    super();
  }
  agora(): Date {
    return new Date(this.instante);
  }
  avancar(ms: number): void {
    this.instante = new Date(this.instante.getTime() + ms);
  }
}

/** Responde o que o teste mandar, por token. */
class EnviadorRoteiro extends Enviador {
  readonly nome = 'roteiro';
  readonly chamadas: Array<{ token: string; mensagem: MensagemPush }> = [];
  constructor(private readonly respostas: Record<string, ResultadoEnvio>) {
    super();
  }
  enviar(mensagem: MensagemPush, d: Dispositivo): Promise<ResultadoEnvio> {
    this.chamadas.push({ token: d.token, mensagem });
    return Promise.resolve(this.respostas[d.token] ?? 'ok');
  }
}

const MIN = 60_000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;
// 15:00 em Brasília, fora do silêncio padrão (22:00–07:00).
const INICIO = new Date('2026-10-15T18:00:00Z');

function aparelho(usuario: string, n = 1): Dispositivo {
  return {
    sessaoId: `sessao-${usuario}-${n}`,
    token: `token-${usuario}-${n}-${'x'.repeat(40)}`,
    plataforma: 'android',
  };
}

describe('FilaService', () => {
  let fila: MemoriaFila;
  let relogio: RelogioFixo;
  let enviador: EnviadorFalso;
  let servico: FilaService;
  let seq = 0;

  function evento(dados: Partial<EventoFila> = {}): EventoFila {
    seq += 1;
    const e: EventoFila = {
      id: `evento-${seq}`,
      tipo: 'voto_nominal',
      titulo: `Deputada Fictícia votou Sim — PL ${seq}/2026`,
      resumo: 'Aprovado. Sim: 300; Não: 100.',
      status: 'publicado',
      fonteUrl: 'https://dadosabertos.camara.leg.br/votacao',
      ocorridoEm: new Date(relogio.instante.getTime() - HORA),
      publicadoEm: relogio.agora(),
      alvos: ['pessoa:p1'],
      ...dados,
    };
    fila.eventos.push(e);
    return e;
  }

  function criar(e: Enviador = enviador, config = CONFIG_FILA_PADRAO) {
    servico = new FilaService(fila, e, relogio, config);
    return servico;
  }

  beforeEach(async () => {
    fila = new MemoriaFila();
    relogio = new RelogioFixo(INICIO);
    enviador = new EnviadorFalso();
    criar();
    // Já existia antes do notificador: nunca vira aviso.
    fila.seguir('u1', 'pessoa:p1', new Date(INICIO.getTime() - DIA));
    fila.dispositivos.set('u1', [aparelho('u1')]);
    evento();
    const primeira = await servico.ciclo();
    expect(primeira.enfileiramento.inicial).toBe(true);
    relogio.avancar(MIN);
  });

  it('a primeira execução não avisa o que já estava publicado', () => {
    expect(fila.avisos).toEqual([]);
    expect(enviador.enviados).toEqual([]);
  });

  it('avisa só quem já seguia um alvo quando o evento foi publicado', async () => {
    fila.seguir('u2', 'partido:13', new Date(INICIO.getTime() - DIA));
    fila.dispositivos.set('u2', [aparelho('u2')]);
    const e = evento({ alvos: ['pessoa:p1', 'partido:13'] });
    // u3 passa a seguir depois da publicação: sem aviso retroativo.
    relogio.avancar(MIN);
    fila.seguir('u3', 'pessoa:p1', relogio.agora());
    fila.dispositivos.set('u3', [aparelho('u3')]);
    const { enfileiramento, envio } = await servico.ciclo();
    expect(enfileiramento.enfileiradas).toBe(2);
    expect(envio.enviadas).toBe(2);
    expect(fila.avisos.map((n) => [n.usuarioId, n.eventoId, n.status])).toEqual(
      [
        ['u1', e.id, 'enviada'],
        ['u2', e.id, 'enviada'],
      ],
    );
    const mensagem = enviador.enviados[0].mensagem;
    expect(mensagem).toEqual({
      titulo: e.titulo,
      corpo: 'Aprovado. Sim: 300; Não: 100. Toque para ver a fonte.',
      dados: { url: `vidapublica://evento/${e.id}`, eventoId: e.id },
    });
  });

  it('nunca avisa segurado, arquivado, sem fonte, dinheiro, presença, fato antigo ou distante', async () => {
    evento({ status: 'segurado', publicadoEm: null });
    evento({ status: 'arquivado' });
    evento({ fonteUrl: null });
    for (const tipo of [
      'despesa_mensal',
      'repasse',
      'doacao',
      'fundo_recebido',
      'presenca',
      'proposta_parada',
    ]) {
      evento({ tipo });
    }
    evento({ ocorridoEm: new Date(relogio.instante.getTime() - 8 * DIA) });
    evento({ ocorridoEm: new Date(relogio.instante.getTime() + 3 * DIA) });
    const pauta = evento({
      tipo: 'pauta',
      ocorridoEm: new Date(relogio.instante.getTime() + DIA),
    });
    const { enfileiramento } = await servico.ciclo();
    expect(enfileiramento.enfileiradas).toBe(1);
    expect(fila.avisos.map((n) => n.eventoId)).toEqual([pauta.id]);
  });

  it('rodar de novo não reenfileira nem reenvia', async () => {
    evento();
    evento();
    const primeira = await servico.ciclo();
    expect(primeira.envio.enviadas).toBe(2);
    for (let i = 0; i < 3; i++) {
      relogio.avancar(MIN);
      const outra = await servico.ciclo();
      expect(outra.enfileiramento.enfileiradas).toBe(0);
      expect(outra.envio.enviadas).toBe(0);
    }
    expect(enviador.enviados).toHaveLength(2);
    expect(fila.avisos).toHaveLength(2);
  });

  it('teto diário: o excedente vai para o resumo; no dia seguinte, volta a enviar', async () => {
    fila.preferencias.set('u1', { maxPorDia: 3 });
    for (let i = 0; i < 7; i++) evento();
    const { envio } = await servico.ciclo();
    expect(envio).toMatchObject({ enviadas: 3, resumo: 4 });
    expect(
      fila.doUsuario('u1').filter((n) => n.status === 'resumo'),
    ).toHaveLength(4);
    expect(
      fila
        .doUsuario('u1')
        .every((n) => n.status !== 'resumo' || n.motivo === 'teto'),
    ).toBe(true);
    // Mais tarde no mesmo dia: teto esgotado.
    relogio.avancar(HORA);
    evento();
    expect((await servico.ciclo()).envio).toMatchObject({
      enviadas: 0,
      resumo: 1,
    });
    // Dia seguinte, 10:00 em Brasília.
    relogio.instante = new Date('2026-10-16T13:00:00Z');
    evento();
    expect((await servico.ciclo()).envio).toMatchObject({
      enviadas: 1,
      resumo: 0,
    });
  });

  it('horário de silêncio: espera o fim, no fuso do usuário, e conta no teto do dia em que sai', async () => {
    fila.preferencias.set('u1', {
      silencioInicio: '22:00',
      silencioFim: '07:00',
      maxPorDia: 1,
    });
    // 23:30 em Brasília
    relogio.instante = new Date('2026-10-16T02:30:00Z');
    evento();
    evento();
    const noite = await servico.ciclo();
    expect(noite.envio).toMatchObject({ enviadas: 0, silencio: 2 });
    const fim = new Date('2026-10-16T10:00:00Z');
    expect(
      fila.doUsuario('u1').map((n) => [n.status, n.motivo, n.enviarApos]),
    ).toEqual([
      ['pendente', 'silencio', fim],
      ['pendente', 'silencio', fim],
    ]);
    // 06:59: ainda nada.
    relogio.instante = new Date(fim.getTime() - MIN);
    expect((await servico.ciclo()).envio.usuarios).toBe(0);
    // 07:00: sai o primeiro; o segundo passa do teto e vai para o resumo.
    relogio.instante = fim;
    expect((await servico.ciclo()).envio).toMatchObject({
      enviadas: 1,
      resumo: 1,
    });
    expect(enviador.enviados).toHaveLength(1);
  });

  it('silêncio desligado (início = fim) envia a qualquer hora', async () => {
    fila.preferencias.set('u1', {
      silencioInicio: '00:00',
      silencioFim: '00:00',
    });
    relogio.instante = new Date('2026-10-16T05:00:00Z'); // 02:00 em Brasília
    evento();
    expect((await servico.ciclo()).envio.enviadas).toBe(1);
  });

  it('avisos desligados: não enfileira; desligar depois descarta o que estava na fila', async () => {
    fila.preferencias.set('u1', { notificacoes: false });
    evento();
    expect((await servico.ciclo()).enfileiramento.enfileiradas).toBe(0);

    // Passada a margem de releitura, religa com silêncio quase o dia todo.
    relogio.avancar(3 * HORA);
    await servico.ciclo();
    fila.preferencias.set('u1', {
      silencioInicio: '00:00',
      silencioFim: '23:59',
    });
    evento();
    await servico.ciclo(); // fica esperando o silêncio
    fila.preferencias.set('u1', { notificacoes: false });
    relogio.avancar(DIA);
    const { envio } = await servico.ciclo();
    expect(envio).toMatchObject({ enviadas: 0, descartadas: { desligada: 1 } });
  });

  it('deixou de seguir ou evento despublicado antes do envio: descarta', async () => {
    fila.preferencias.set('u1', {
      silencioInicio: '00:00',
      silencioFim: '23:59',
    });
    const a = evento();
    const b = evento({ alvos: ['pessoa:p1', 'proposicao:x'] });
    await servico.ciclo();
    a.status = 'arquivado';
    fila.seguindo.get('u1')!.delete('pessoa:p1');
    fila.preferencias.set('u1', {});
    relogio.avancar(DIA);
    const { envio } = await servico.ciclo();
    expect(envio.descartadas).toEqual({ despublicado: 1, nao_segue: 1 });
    expect(fila.doUsuario('u1').find((n) => n.eventoId === b.id)?.motivo).toBe(
      'nao_segue',
    );
  });

  it('sem aparelho: descarta sem gastar o teto', async () => {
    fila.dispositivos.set('u1', []);
    fila.preferencias.set('u1', { maxPorDia: 1 });
    evento();
    evento();
    const { envio } = await servico.ciclo();
    expect(envio).toMatchObject({
      enviadas: 0,
      resumo: 0,
      descartadas: { sem_dispositivo: 2 },
    });
    fila.dispositivos.set('u1', [aparelho('u1')]);
    evento();
    expect((await servico.ciclo()).envio.enviadas).toBe(1);
  });

  it('token inválido é apagado; o outro aparelho recebe', async () => {
    const valido = aparelho('u1', 1);
    const invalido = aparelho('u1', 2);
    fila.dispositivos.set('u1', [invalido, valido]);
    const roteiro = new EnviadorRoteiro({ [invalido.token]: 'token_invalido' });
    criar(roteiro);
    evento();
    evento();
    const { envio } = await servico.ciclo();
    expect(envio).toMatchObject({
      enviadas: 2,
      entregas: 2,
      tokensRemovidos: 1,
    });
    expect(fila.dispositivos.get('u1')).toEqual([valido]);
    // O inválido foi tentado só uma vez.
    expect(
      roteiro.chamadas.filter((c) => c.token === invalido.token),
    ).toHaveLength(1);
  });

  it('falha passageira: tenta de novo com espera crescente e desiste no limite', async () => {
    const d = aparelho('u1');
    criar(new EnviadorRoteiro({ [d.token]: 'temporario' }), {
      ...CONFIG_FILA_PADRAO,
      maxTentativas: 3,
    });
    evento();
    expect((await servico.ciclo()).envio.reagendadas).toBe(1);
    const [n] = fila.doUsuario('u1');
    expect(n).toMatchObject({
      status: 'pendente',
      motivo: 'erro_envio',
      tentativas: 1,
    });
    expect(n.enviarApos).toEqual(new Date(relogio.instante.getTime() + MIN));
    relogio.avancar(MIN);
    expect((await servico.ciclo()).envio.reagendadas).toBe(1);
    expect(n.enviarApos).toEqual(
      new Date(relogio.instante.getTime() + 2 * MIN),
    );
    relogio.avancar(2 * MIN);
    expect((await servico.ciclo()).envio.falhas).toBe(1);
    expect(n).toMatchObject({ status: 'falhou', motivo: 'erro_envio' });
  });

  it('usuário com outro notificador é pulado e fica para a próxima rodada', async () => {
    evento();
    fila.travados.add('u1');
    const ocupado = await servico.ciclo();
    expect(ocupado.envio).toMatchObject({ ocupados: 1, enviadas: 0 });
    fila.travados.clear();
    expect((await servico.ciclo()).envio.enviadas).toBe(1);
  });

  it('texto com algo parecido com CPF não sai', async () => {
    evento({ resumo: 'Doador 123.456.789-09' });
    const { envio } = await servico.ciclo();
    expect(envio.descartadas).toEqual({ texto: 1 });
    expect(enviador.enviados).toEqual([]);
  });
});

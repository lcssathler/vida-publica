/**
 * @jest-environment node
 *
 * Conferência do app contra uma API real (o compose local com a carga
 * publicada), com o próprio código do app: o cliente (sessão, renovação,
 * 429), o caminho do feed e a montagem das linhas. Só roda com
 * VP_CONFERIR_API definido; no CI e no `pnpm test` normal fica pulada.
 *
 *   VP_CONFERIR_API=http://127.0.0.1:3000 VP_CONFERIR_PESSOA=<uuid> VP_CONFERIR_PARTIDO=<id> \
 *     pnpm --filter @vida-publica/mobile exec jest src/__conferencia__
 */
/// <reference types="node" />
import { request } from 'node:http';
import { ClienteApi, type Cofre } from '../api/cliente';
import { ErroLimite } from '../api/erros';
import type { DoadoresPessoa, EventoFeed, RespostaFeed } from '../api/tipos';
import { caminhoFeed } from '../feed/caminho';
import { maisNovo, montarLinhas } from '../feed/linhas';

const API = process.env.VP_CONFERIR_API;
const PESSOA = process.env.VP_CONFERIR_PESSOA ?? '';
const PARTIDO = process.env.VP_CONFERIR_PARTIDO ?? '';
const descrever = API ? describe : describe.skip;

/**
 * fetch mínimo sobre node:http: o ambiente do jest-expo troca o fetch global
 * por um polyfill que não fala com a rede. Entrega só o que o cliente usa.
 */
const fetchNode = ((url: string, init: RequestInit = {}) =>
  new Promise((resolver, rejeitar) => {
    const req = request(url, { method: init.method ?? 'GET', headers: init.headers as Record<string, string> }, (res) => {
      const partes: Buffer[] = [];
      res.on('data', (p: Buffer) => partes.push(p));
      res.on('end', () => {
        const corpo = Buffer.concat(partes).toString('utf8');
        const status = res.statusCode ?? 0;
        resolver({
          status,
          ok: status >= 200 && status < 300,
          headers: { get: (nome: string) => (res.headers[nome.toLowerCase()] as string | undefined) ?? null },
          json: async () => JSON.parse(corpo),
        });
      });
    });
    req.on('error', rejeitar);
    if (typeof init.body === 'string') req.write(init.body);
    req.end();
  })) as unknown as typeof fetch;

function cofre(inicial: string | null = null): Cofre & { valor: () => string | null } {
  let v = inicial;
  return {
    valor: () => v,
    ler: async () => v,
    gravar: async (x) => {
      v = x;
    },
    apagar: async () => {
      v = null;
    },
  };
}

/** espera: Retry-After (s) que o cliente aguarda sozinho; 0 = devolve ErroLimite. */
function cliente(c: Cofre, aoEncerrarSessao?: () => void, espera = 0) {
  return new ClienteApi({
    baseUrl: API as string,
    cofre: c,
    plataforma: 'android',
    fetch: fetchNode,
    esperaAutomatica: espera,
    tempoLimite: 60_000,
    aoEncerrarSessao,
  });
}

descrever('app contra a API real', () => {
  jest.setTimeout(15 * 60 * 1000);
  const relatorio: Record<string, unknown> = {};

  afterAll(() => {
    console.log(JSON.stringify(relatorio, null, 2));
  });

  it('feed "Quem eu sigo" percorrido por cursor: sem repetir, em ordem, todo registro com fonte', async () => {
    // Percorrer milhares de registros passa do limite de 120 por minuto: espera o Retry-After.
    const c = cliente(cofre(), undefined, 70);
    await c.iniciar();
    await c.put(`/seguindo/pessoa/${PESSOA}`);
    await c.put(`/seguindo/partido/${PARTIDO}`);

    const todos: EventoFeed[] = [];
    let cursor: string | null = null;
    let paginas = 0;
    do {
      const pagina: RespostaFeed = await c.get<RespostaFeed>(
        caminhoFeed({ escopo: 'seguindo', categorias: [], assuntos: [] }, cursor, 50),
      );
      todos.push(...pagina.itens);
      cursor = pagina.proximoCursor;
      paginas += 1;
    } while (cursor);

    const ids = new Set(todos.map((e) => e.id));
    expect(ids.size).toBe(todos.length);
    for (let i = 1; i < todos.length; i++) expect(maisNovo(todos[i - 1], todos[i])).toBeGreaterThan(0);
    const semFonte = todos.filter((e) => !e.fonte.url || !e.fonte.coletadoEm);
    expect(semFonte).toEqual([]);
    const semAlvoSeguido = todos.filter((e) => !e.alvos.some((a) => a.seguindo));
    expect(semAlvoSeguido).toEqual([]);
    const linhas = montarLinhas(todos, null).filter((l) => l.tipo === 'evento');
    expect(linhas).toHaveLength(todos.length);

    // Detalhe de uma amostra: abre, com fonte e a regra descrita.
    const amostra = todos.filter((_, i) => i % Math.max(1, Math.floor(todos.length / 25)) === 0).slice(0, 25);
    for (const e of amostra) {
      const d = await c.get<EventoFeed>(`/eventos/${e.id}`);
      expect(d.fonte.url).toBe(e.fonte.url);
      expect(d.regra.descricao).toBeTruthy();
    }

    const doadores = await c.get<DoadoresPessoa>(`/pessoas/${PESSOA}/doadores`);
    const nomeadas = doadores.candidaturas.flatMap((x) => x.pessoasFisicas.nomeadas);
    expect(nomeadas.every((n) => n.total > doadores.limiteNomePessoaFisica)).toBe(true);
    const texto = JSON.stringify(doadores);
    // CPF: 11 dígitos sozinhos ou no formato 000.000.000-00 (CNPJ tem 14, candidatura 12).
    expect(texto).not.toMatch(/"\d{11}"|\d{3}\.\d{3}\.\d{3}-\d{2}/);

    relatorio.feed = {
      eventos: todos.length,
      paginas,
      seguidores: todos.filter((e) => e.visibilidade === 'seguidores').length,
      tipos: [...new Set(todos.map((e) => e.tipo))].length,
      detalhesAbertos: amostra.length,
      primeiro: todos[0]?.ocorridoEm,
      ultimo: todos.at(-1)?.ocorridoEm,
    };
    relatorio.doadores = {
      ano: doadores.ano,
      nomeadas: nomeadas.length,
      menorNomeada: Math.min(...nomeadas.map((n) => n.total)),
      outras: doadores.candidaturas.reduce((s, x) => s + x.pessoasFisicas.outras.doadores, 0),
    };

    await c.delete('/conta');
  });

  it('refresh reapresentado encerra a sessão e o app abre conta nova', async () => {
    const original = cofre();
    const a = cliente(original);
    const usuario = await a.iniciar();
    const vazado = original.valor() as string;

    // O aparelho renova normalmente (o refresh vazado deixa de valer)...
    const b = cliente(cofre(vazado));
    await b.iniciar();
    // ...e alguém reapresenta o refresh antigo: a API encerra a sessão inteira.
    const encerrouC = jest.fn();
    const c = cliente(cofre(vazado), encerrouC);
    const novo = await c.iniciar();
    expect(encerrouC).toHaveBeenCalledTimes(1);
    expect(novo).not.toBe(usuario);

    // O aparelho legítimo também perde a sessão e cai numa conta nova.
    const encerrouB = jest.fn();
    b.ouvirEncerramento(encerrouB);
    await b.esquecer();
    const d = cliente(cofre(vazado), encerrouB);
    await d.iniciar();
    expect(encerrouB).toHaveBeenCalled();
    relatorio.reuso = { sessaoEncerrada: true, contaNova: novo !== usuario };
  });

  it('busca acima do limite: 429 com Retry-After vira espera em segundos', async () => {
    const c = cliente(cofre());
    await c.iniciar();
    let ok = 0;
    let limite: ErroLimite | null = null;
    for (let i = 0; i < 40 && !limite; i++) {
      try {
        await c.get(`/busca?q=${encodeURIComponent(`conferencia ${i}`)}`);
        ok += 1;
      } catch (e) {
        if (e instanceof ErroLimite) limite = e;
        else throw e;
      }
    }
    expect(limite).not.toBeNull();
    expect(limite!.segundos).toBeGreaterThan(0);
    relatorio.limite = { buscasAntesDo429: ok, retryAfterSegundos: limite!.segundos };
    await c.delete('/conta');
  });
});

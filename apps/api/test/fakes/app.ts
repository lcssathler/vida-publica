import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { UsuariosRepositorio } from '../../src/auth/usuarios.repositorio';
import { BuscaRepositorio } from '../../src/busca/busca.repositorio';
import { ContaRepositorio } from '../../src/conta/conta.repositorio';
import { VerificadorIdentidade } from '../../src/auth/verificador-identidade';
import { FeedRepositorio } from '../../src/feed/feed.repositorio';
import { DispositivosRepositorio } from '../../src/notificacoes/dispositivos.repositorio';
import { PerfisRepositorio } from '../../src/perfis/perfis.repositorio';
import { PropostasRepositorio } from '../../src/propostas/propostas.repositorio';
import { SeguindoRepositorio } from '../../src/seguir/seguindo.repositorio';
import { MemoriaFeed } from './memoria-feed';
import { MemoriaBusca } from './memoria-busca';
import { MemoriaConta } from './memoria-conta';
import { MemoriaDispositivos } from './memoria-dispositivos';
import { MemoriaPerfis } from './memoria-perfis';
import { MemoriaPropostas } from './memoria-propostas';
import { MemoriaSeguindo } from './memoria-seguindo';
import { MemoriaUsuarios } from './memoria-usuarios';
import { VerificadorFalso } from './verificador';

export interface AppDeTeste {
  app: INestApplication<App>;
  usuarios: MemoriaUsuarios;
  seguindo: MemoriaSeguindo;
  feed: MemoriaFeed;
  perfis: MemoriaPerfis;
  propostas: MemoriaPropostas;
  busca: MemoriaBusca;
  conta: MemoriaConta;
  dispositivos: MemoriaDispositivos;
  /** Cria uma conta anônima e devolve o cabeçalho de autorização dela. */
  anonimo(): Promise<{ authorization: string; usuarioId: string }>;
}

/**
 * Aplicação completa (guarda, validação, rotas) com os adaptadores de banco
 * trocados por versões em memória. `trocas` substitui outras portas;
 * `preparar` configura a aplicação antes de iniciar (como o main.ts).
 */
export async function criarApp(
  trocas: Array<[abstract new (...args: never[]) => unknown, unknown]> = [],
  preparar?: (app: INestApplication<App>) => void,
): Promise<AppDeTeste> {
  const usuarios = new MemoriaUsuarios();
  const seguindo = new MemoriaSeguindo();
  usuarios.aoFundir.push(seguindo.fundir);
  const feed = new MemoriaFeed(seguindo);
  const perfis = new MemoriaPerfis();
  const propostas = new MemoriaPropostas();
  const busca = new MemoriaBusca();
  const conta = new MemoriaConta(usuarios, seguindo);
  const dispositivos = new MemoriaDispositivos(usuarios);
  let construtor = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(UsuariosRepositorio)
    .useValue(usuarios)
    .overrideProvider(SeguindoRepositorio)
    .useValue(seguindo)
    .overrideProvider(FeedRepositorio)
    .useValue(feed)
    .overrideProvider(PerfisRepositorio)
    .useValue(perfis)
    .overrideProvider(PropostasRepositorio)
    .useValue(propostas)
    .overrideProvider(BuscaRepositorio)
    .useValue(busca)
    .overrideProvider(ContaRepositorio)
    .useValue(conta)
    .overrideProvider(DispositivosRepositorio)
    .useValue(dispositivos)
    .overrideProvider(VerificadorIdentidade)
    .useValue(new VerificadorFalso());
  for (const [porta, adaptador] of trocas) {
    construtor = construtor.overrideProvider(porta).useValue(adaptador);
  }
  const modulo = await construtor.compile();
  const app = modulo.createNestApplication<INestApplication<App>>();
  preparar?.(app);
  await app.init();
  return {
    app,
    usuarios,
    seguindo,
    feed,
    perfis,
    propostas,
    busca,
    conta,
    dispositivos,
    async anonimo() {
      const resposta = await request(app.getHttpServer())
        .post('/auth/anonimo')
        .send({})
        .expect(201);
      const corpo = resposta.body as {
        usuarioId: string;
        acesso: { token: string };
      };
      return {
        authorization: `Bearer ${corpo.acesso.token}`,
        usuarioId: corpo.usuarioId,
      };
    },
  };
}

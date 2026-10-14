import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { UsuariosRepositorio } from '../../src/auth/usuarios.repositorio';
import { VerificadorIdentidade } from '../../src/auth/verificador-identidade';
import { FeedRepositorio } from '../../src/feed/feed.repositorio';
import { SeguindoRepositorio } from '../../src/seguir/seguindo.repositorio';
import { MemoriaFeed } from './memoria-feed';
import { MemoriaSeguindo } from './memoria-seguindo';
import { MemoriaUsuarios } from './memoria-usuarios';
import { VerificadorFalso } from './verificador';

export interface AppDeTeste {
  app: INestApplication<App>;
  usuarios: MemoriaUsuarios;
  seguindo: MemoriaSeguindo;
  feed: MemoriaFeed;
  /** Cria uma conta anônima e devolve o cabeçalho de autorização dela. */
  anonimo(): Promise<{ authorization: string; usuarioId: string }>;
}

/**
 * Aplicação completa (guarda, validação, rotas) com os adaptadores de banco
 * trocados por versões em memória. `trocas` substitui outras portas.
 */
export async function criarApp(
  trocas: Array<[abstract new (...args: never[]) => unknown, unknown]> = [],
): Promise<AppDeTeste> {
  const usuarios = new MemoriaUsuarios();
  const seguindo = new MemoriaSeguindo();
  usuarios.aoFundir.push(seguindo.fundir);
  const feed = new MemoriaFeed(seguindo);
  let construtor = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(UsuariosRepositorio)
    .useValue(usuarios)
    .overrideProvider(SeguindoRepositorio)
    .useValue(seguindo)
    .overrideProvider(FeedRepositorio)
    .useValue(feed)
    .overrideProvider(VerificadorIdentidade)
    .useValue(new VerificadorFalso());
  for (const [porta, adaptador] of trocas) {
    construtor = construtor.overrideProvider(porta).useValue(adaptador);
  }
  const modulo = await construtor.compile();
  const app = modulo.createNestApplication<INestApplication<App>>();
  await app.init();
  return {
    app,
    usuarios,
    seguindo,
    feed,
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

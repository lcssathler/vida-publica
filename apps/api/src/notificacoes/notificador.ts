import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { EnviadorFcm, lerCredenciais } from './enviador-fcm';
import { EnvNotificador, validarEnvNotificador } from './env-notificador';
import { FilaService } from './fila.service';
import { NotificadorModule } from './notificador.module';

/** Tocado a cada volta do modo contínuo; o healthcheck confere a idade. */
const SINAL_DE_VIDA = join(tmpdir(), 'notificador-vivo');

const USO = `Uso: node dist/notificacoes/notificador.js <comando>
  ciclo       enfileira os eventos recém-publicados e envia o que estiver na vez
  enfileirar  só enfileira
  enviar      só envia o que estiver na vez
  continuo    roda um ciclo a cada NOTIF_INTERVALO_SEGUNDOS até receber SIGTERM
  testar-fcm <token> [android|ios] [--entregar]
              manda um aviso de teste a um token pelo FCM, só validando
              (validate_only) ou, com --entregar, de verdade`;

async function main(): Promise<number> {
  const comando = process.argv[2] ?? 'ciclo';
  if (comando === 'testar-fcm') return testarFcm(process.argv.slice(3));
  if (!['ciclo', 'enfileirar', 'enviar', 'continuo'].includes(comando)) {
    process.stderr.write(`${USO}\n`);
    return 2;
  }
  const app = await NestFactory.createApplicationContext(NotificadorModule, {
    bufferLogs: true,
  });
  const log = app.get(Logger);
  app.useLogger(log);
  const fila = app.get(FilaService);
  const imprimir = (r: unknown) =>
    process.stdout.write(`${JSON.stringify(r, null, 2)}\n`);
  try {
    if (comando === 'ciclo') imprimir(await fila.ciclo());
    else if (comando === 'enfileirar') imprimir(await fila.enfileirar());
    else if (comando === 'enviar') imprimir(await fila.enviar());
    else {
      const config =
        app.get<ConfigService<EnvNotificador, true>>(ConfigService);
      await continuo(
        fila,
        log,
        config.get('NOTIF_INTERVALO_SEGUNDOS', { infer: true }) * 1000,
      );
    }
  } finally {
    await app.close();
  }
  return 0;
}

/**
 * Aviso de teste para um token, direto pelo adaptador FCM (sem banco). Por
 * padrão só valida (validate_only): o FCM confere credenciais, mensagem e
 * token sem entregar nada.
 */
async function testarFcm(args: string[]): Promise<number> {
  const token = args.find((a) => !a.startsWith('--') && a.length > 20);
  const plataforma = args.includes('ios') ? 'ios' : 'android';
  if (!token) {
    process.stderr.write(`${USO}\n`);
    return 2;
  }
  const env = validarEnvNotificador({
    DATABASE_URL: 'postgres://sem-banco@127.0.0.1/x',
    ...process.env,
  });
  const conta = lerCredenciais(env);
  if (!conta) {
    process.stderr.write(
      'Defina FCM_CREDENCIAIS_JSON ou FCM_CREDENCIAIS_ARQUIVO (conta de serviço do Firebase).\n',
    );
    return 2;
  }
  const entregar = args.includes('--entregar');
  const fcm = new EnviadorFcm(conta, { validarApenas: !entregar });
  const resultado = await fcm.enviar(
    {
      titulo: 'Vida Pública: aviso de teste',
      corpo: 'Teste do envio de avisos. Toque para abrir o app.',
      dados: { url: 'vidapublica://' },
    },
    { sessaoId: 'teste', token, plataforma },
  );
  const saida = {
    projeto: conta.project_id,
    plataforma,
    validarApenas: !entregar,
    resultado,
  };
  process.stdout.write(`${JSON.stringify(saida)}\n`);
  return resultado === 'ok' ? 0 : 1;
}

/**
 * Um ciclo por intervalo. Erro num ciclo (banco fora do ar, migração ainda não
 * aplicada) fica no log e o próximo tenta de novo; SIGTERM espera o ciclo em
 * andamento terminar. A cada volta, toca o arquivo de sinal de vida que o
 * healthcheck do contêiner confere (o laço está rodando, com ou sem banco).
 */
async function continuo(
  fila: FilaService,
  log: Logger,
  intervaloMs: number,
): Promise<void> {
  let parar = false;
  let acordar: () => void = () => undefined;
  const sinal = () => {
    parar = true;
    acordar();
  };
  process.once('SIGTERM', sinal);
  process.once('SIGINT', sinal);
  while (!parar) {
    try {
      writeFileSync(SINAL_DE_VIDA, new Date().toISOString());
    } catch {
      // Sem onde gravar, só o healthcheck fica sem o sinal.
    }
    try {
      await fila.ciclo();
    } catch (erro) {
      log.error({ msg: 'ciclo da fila falhou', erro: String(erro) });
    }
    if (parar) break;
    await new Promise<void>((resolve) => {
      const espera = setTimeout(resolve, intervaloMs);
      acordar = () => {
        clearTimeout(espera);
        resolve();
      };
    });
  }
}

main().then(
  (codigo) => {
    process.exitCode = codigo;
  },
  (erro: unknown) => {
    process.stderr.write(`${String(erro)}\n`);
    process.exitCode = 1;
  },
);

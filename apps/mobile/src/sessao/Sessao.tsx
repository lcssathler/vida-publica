import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Platform } from 'react-native';
import { ClienteApi } from '../api/cliente';
import { ErroRede, mensagemDeErro } from '../api/erros';
import type { Plataforma } from '../api/tipos';
import { Carregando, Falha } from '../components/Estado';
import { API_URL } from '../config';
import { persistidor } from '../offline/cache';
import { cofre } from './cofre';
import { ESTADO_INICIAL, gravarLocal, lerLocal, type EstadoLocal } from './local';

export interface ValorSessao {
  cliente: ClienteApi;
  local: EstadoLocal;
  /** Altera o estado local; a gravação no aparelho vem em seguida. */
  atualizarLocal(mudancas: Partial<EstadoLocal>): void;
}

const Contexto = createContext<ValorSessao | null>(null);

export function useSessao(): ValorSessao {
  const valor = useContext(Contexto);
  if (!valor) throw new Error('useSessao fora do SessaoProvider');
  return valor;
}

/** Para testes: entrega uma sessão pronta, sem abrir conta. */
export const SessaoContexto = Contexto;

export function criarCliente(): ClienteApi {
  return new ClienteApi({ baseUrl: API_URL, cofre, plataforma: Platform.OS as Plataforma });
}

/**
 * Abre a sessão (conta anônima na primeira abertura) e lê o estado local
 * antes de mostrar o app. Se a API encerrar a sessão (refresh recusado), o
 * aparelho volta ao começo do onboarding com a conta nova.
 */
export function SessaoProvider({ children, cliente: injetado }: { children: ReactNode; cliente?: ClienteApi }) {
  const consultas = useQueryClient();
  const [cliente] = useState(() => injetado ?? criarCliente());
  const [local, setLocal] = useState<EstadoLocal | null>(null);
  const [erro, setErro] = useState<unknown>(null);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let ativo = true;
    Promise.all([cliente.iniciar().then(() => null, (e: unknown) => e), lerLocal()])
      .then(([falha, estado]) => {
        // Sem rede, quem já passou do onboarding abre com o que está guardado;
        // a sessão é renovada na primeira chamada com conexão.
        if (falha && !(falha instanceof ErroRede && estado.onboardingConcluido)) throw falha;
        if (ativo) setLocal(estado);
      })
      .catch((e: unknown) => ativo && setErro(e));
    return () => {
      ativo = false;
    };
  }, [cliente, tentativa]);

  useEffect(() => {
    if (local) void gravarLocal(local).catch(() => {});
  }, [local]);

  useEffect(
    () =>
      cliente.ouvirEncerramento(() => {
        consultas.clear();
        void persistidor.removeClient();
        setLocal(ESTADO_INICIAL);
      }),
    [cliente, consultas],
  );

  const atualizarLocal = useCallback((mudancas: Partial<EstadoLocal>) => {
    setLocal((atual) => ({ ...(atual ?? ESTADO_INICIAL), ...mudancas }));
  }, []);

  const valor = useMemo(
    () => (local ? { cliente, local, atualizarLocal } : null),
    [cliente, local, atualizarLocal],
  );

  if (erro) {
    return (
      <Falha
        titulo="Não foi possível abrir o Vida Pública"
        mensagem={mensagemDeErro(erro)}
        aoTentar={() => {
          setErro(null);
          setTentativa((n) => n + 1);
        }}
      />
    );
  }
  if (!valor) return <Carregando rotulo="Abrindo o Vida Pública" />;
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

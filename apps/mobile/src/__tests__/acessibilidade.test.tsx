import { screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import Busca from '../app/(abas)/busca';
import ContaTela from '../app/(abas)/conta';
import Feed from '../app/(abas)/index';
import Seguindo from '../app/(abas)/seguindo';
import Erratas from '../app/erratas';
import DetalheDoEvento from '../app/evento/[id]';
import EscolherAssuntos from '../app/onboarding/assuntos';
import EscolherEstado from '../app/onboarding/index';
import PrePerguntaNotificacoes from '../app/onboarding/notificacoes';
import QuemSeguir from '../app/onboarding/seguir';
import PerfilDePartido from '../app/partido/[id]';
import PerfilDePessoa from '../app/pessoa/[id]';
import DetalheDaProposta from '../app/proposta/[id]';
import ReportarErro from '../app/reportar/[id]';
import { auditar } from '../test/auditoria';
import { evento } from '../test/fabricas';
import { renderizar } from '../test/renderizar';

const mockRoteador = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), navigate: jest.fn(), canGoBack: () => true };
jest.mock('expo-router', () => ({ useRouter: () => mockRoteador, useLocalSearchParams: () => ({ id: 'x1' }) }));
jest.mock('../notificacoes/permissao', () => ({ pedirPermissaoDoSistema: jest.fn() }));

const categorias = ['votos', 'presenca', 'gastos', 'propostas', 'campanha', 'eleicoes'].map((categoria) => ({
  categoria,
  eventos: categoria === 'votos' ? 1 : 0,
  porTipo: categoria === 'votos' ? { voto_nominal: 1 } : {},
}));
const alvos = [
  { tipo: 'pessoa', id: 'p1', nome: 'Maria Exemplo', papel: 'votante', seguindo: true },
  { tipo: 'assunto', id: 'Saúde', nome: 'Saúde', papel: '', seguindo: false },
] as const;
const comAlvos = evento({
  id: 'x1',
  alvos: [...alvos],
  valor: 1200,
  erratas: [
    { id: 'er1', titulo: 'Voto corrigido', texto: 'O voto era de outra sessão.', publicadaEm: '2026-10-15T12:00:00.000Z' },
  ],
});
const pagina = { corpo: { itens: [comAlvos], proximoCursor: null } };
const seguindo = {
  corpo: {
    itens: [
      { tipo: 'pessoa', id: 'p1', nome: 'Maria Exemplo', detalhe: 'Deputada Federal · SP', desde: '2026-10-01' },
      { tipo: 'assunto', id: 'Saúde', nome: 'Saúde', detalhe: null, desde: '2026-10-01' },
    ],
  },
};
const preferencias = {
  uf: 'SP',
  notificacoes: true,
  resumoSemanal: true,
  maxPorDia: 5,
  silencioInicio: '22:00',
  silencioFim: '07:00',
  fuso: 'America/Sao_Paulo',
};

const rotas = {
  'GET /seguindo': seguindo,
  'GET /assuntos': { corpo: { itens: [{ nome: 'Saúde', proposicoes: 3 }] } },
  'GET /parlamentares?uf=SP': {
    corpo: {
      itens: [
        { id: 'p1', nome: 'Maria Exemplo', casa: 'senado', cargo: 'Senadora', uf: 'SP', partido: 'AAA', foto: null, seguindo: true },
      ],
    },
  },
  'GET /feed': pagina,
  'GET /eventos/x1': { corpo: { ...comAlvos, regra: { versao: 1, descricao: 'Regra fictícia.' } } },
  'GET /pessoas/x1': {
    corpo: {
      id: 'x1',
      nome: 'Maria Exemplo',
      nomeCivil: null,
      foto: { url: 'https://exemplo.invalid/f.jpg', credito: 'Senado Federal' },
      mandatos: [],
      filiacoes: [{ sigla: 'AAA', partidoId: '30', desde: '2020-01-01', ate: null }],
      candidaturas: [],
      partidoAtual: { id: '30', sigla: 'AAA' },
      seguindo: true,
      categorias,
      gastos: [],
      anosDeCampanha: [],
    },
  },
  'GET /pessoas/x1/eventos': pagina,
  'GET /partidos/x1': {
    corpo: {
      id: 'x1',
      sigla: 'AAA',
      nome: 'PARTIDO EXEMPLO',
      numero: 99,
      primeiroAno: 2018,
      ultimoAno: 2026,
      sucessor: null,
      antecessores: [],
      emExercicio: [{ id: 'p1', nome: 'Maria Exemplo', casa: 'senado', cargo: 'Senadora', uf: 'SP' }],
      repasses: [],
      seguindo: false,
      categorias,
    },
  },
  'GET /partidos/x1/eventos': pagina,
  'GET /propostas/x1': {
    corpo: {
      id: 'x1',
      casa: 'senado',
      identificacao: 'PL 1/2026',
      siglaTipo: 'PL',
      numero: 1,
      ano: 2026,
      descricaoTipo: 'Projeto de Lei',
      ementa: 'Ementa fictícia.',
      ementaDetalhada: null,
      apelido: null,
      apresentadaEm: null,
      situacao: null,
      situacaoEm: null,
      orgao: null,
      regime: null,
      tramitando: null,
      urlInteiroTeor: null,
      autores: [{ nome: 'Maria Exemplo', tipo: 'Senador', proponente: true, pessoa: { id: 'p1', nome: 'Maria Exemplo' } }],
      temas: ['Saúde'],
      principal: null,
      fonte: { url: 'https://legis.senado.leg.br/x' },
      seguindo: false,
      linhaDoTempo: [
        {
          tipo: 'votacao',
          data: '2026-09-03T20:00:00.000Z',
          orgao: 'PLEN',
          descricao: null,
          aprovada: null,
          nominal: true,
          placar: { sim: 1, nao: 1, abstencao: 0, outros: 0 },
          fonte: { url: 'https://legis.senado.leg.br/v' },
        },
        { tipo: 'evento', data: '2026-09-02T20:00:00.000Z', evento: comAlvos },
      ],
    },
  },
  'GET /erratas?limite=20': {
    corpo: {
      erratas: [
        {
          id: 'er1',
          titulo: 'Voto corrigido',
          texto: 'O voto era de outra sessão.',
          publicadaEm: '2026-10-15T12:00:00.000Z',
          evento: { id: 'x1', titulo: comAlvos.titulo, tipo: 'voto_nominal', ocorridoEm: comAlvos.ocorridoEm },
        },
      ],
      proximoCursor: null,
    },
  },
  'GET /conta': {
    corpo: { usuarioId: 'u', criadaEm: '2026-10-14T12:00:00.000Z', identidades: [], seguindo: 2, sessoesAtivas: 1, anonima: true, preferencias },
  },
};

const telas: [string, ReactElement, string][] = [
  ['onboarding: estado', <EscolherEstado key="1" />, 'Onde você vota?'],
  ['onboarding: quem seguir', <QuemSeguir key="2" />, 'Quem você quer acompanhar?'],
  ['onboarding: assuntos', <EscolherAssuntos key="3" />, 'Que assuntos interessam a você?'],
  ['onboarding: notificações', <PrePerguntaNotificacoes key="4" />, 'Quer ser avisado?'],
  ['feed', <Feed key="5" />, 'Vida Pública'],
  ['detalhe do registro', <DetalheDoEvento key="6" />, comAlvos.titulo],
  ['perfil de pessoa', <PerfilDePessoa key="7" />, 'Maria Exemplo'],
  ['perfil de partido', <PerfilDePartido key="8" />, 'AAA'],
  ['proposta', <DetalheDaProposta key="9" />, 'PL 1/2026'],
  ['busca', <Busca key="10" />, 'Busca'],
  ['seguindo', <Seguindo key="11" />, 'Seguindo'],
  ['conta', <ContaTela key="12" />, 'Conta'],
  ['reportar erro', <ReportarErro key="13" />, 'O que está errado neste registro?'],
  ['erratas', <Erratas key="14" />, 'Erratas'],
];

describe.each(telas)('acessibilidade: %s', (_nome, tela, titulo) => {
  it('controles com papel, nome e alvo de 48 pt; campos com nome; título', async () => {
    const r = await renderizar(tela, { rotas, local: { uf: 'SP', onboardingConcluido: true } });
    expect(await screen.findByRole('heading', { name: titulo })).toBeOnTheScreen();
    expect(auditar(r.container as never)).toEqual([]);
  });
});

describe('auditoria', () => {
  it('acusa controle sem nome, alvo pequeno, tocável sem papel e tela sem título', async () => {
    const { Pressable, Text, TextInput, View } = jest.requireActual<typeof import('react-native')>('react-native');
    const r = await renderizar(
      <View>
        <Pressable role="button" style={{ height: 20 }} onPress={() => {}} />
        <Pressable onPress={() => {}}>
          <Text>sem papel</Text>
        </Pressable>
        <TextInput />
      </View>,
    );
    expect(auditar(r.container as never)).toEqual([
      'button sem nome',
      'button "" com alvo de 20 pt',
      'elemento tocável sem papel: "sem papel"',
      'campo de texto sem nome',
      'tela sem título (role heading)',
    ]);
  });
});

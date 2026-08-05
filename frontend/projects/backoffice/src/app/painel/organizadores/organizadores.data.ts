/**
 * Dados de apoio das telas de Organizadores (protótipo BoOrganizadores*).
 * Mock local — mesma abordagem das telas de Arenas e Torneios, ainda sem Firestore.
 */

export type VerificationState = 'done' | 'pending' | 'todo';

export interface VerificationItem {
  label: string;
  meta: string;
  state: VerificationState;
  /** Ação disponível quando a checagem não está concluída. */
  action?: string;
}

export type AccountType = 'Pessoa física (CPF)' | 'Pessoa jurídica (CNPJ)';

export interface Athlete {
  id: string;
  name: string;
  elo: string;
  city: string;
  matches: number;
  since: string;
  /** Marca sugerida para o perfil de organizador (vazio = usa o nome do atleta). */
  brand: string;
  accountType: AccountType;
  document: string;
  documentStatus: string;
  email: string;
  whatsapp: string;
  verification: VerificationItem[];
}

export interface AccessRequest {
  id: string;
  athleteId: string;
  reason: string;
  age: string;
}

export interface PermissionDef {
  id: string;
  label: string;
  desc: string;
  /** Permissão bloqueada por regra de plataforma (não pode ser ligada aqui). */
  locked?: boolean;
}

/** Iniciais para os avatares — mesma regra usada na shell do painel. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return '·';
  }
  const first = parts[0]![0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]![0] ?? '') : '';
  return (first + last).toUpperCase();
}

function verificationOf(idDate: string, pixDone: boolean, termsDone: boolean): VerificationItem[] {
  return [
    { label: 'Identidade confirmada', meta: `Selfie + documento · validado em ${idDate}`, state: 'done' },
    { label: 'CPF regular na Receita', meta: 'Consulta automática · Serpro', state: 'done' },
    pixDone
      ? { label: 'Chave PIX validada', meta: 'Micro-depósito confirmado', state: 'done' }
      : {
          label: 'Chave PIX em validação',
          meta: 'Micro-depósito enviado · aguardando confirmação',
          state: 'pending',
          action: 'Reenviar',
        },
    termsDone
      ? { label: 'Termo do organizador', meta: 'Aceito na versão vigente', state: 'done' }
      : { label: 'Termo do organizador', meta: 'Ainda não aceito', state: 'todo', action: 'Enviar link' },
  ];
}

export const ATHLETES: readonly Athlete[] = [
  {
    id: 'gustavo-brito',
    name: 'Gustavo Brito',
    elo: 'Ouro II',
    city: 'João Pessoa · PB',
    matches: 84,
    since: '03/24',
    brand: 'Circuito Paraibano BT',
    accountType: 'Pessoa física (CPF)',
    document: '083.514.229-06',
    documentStatus: 'CPF · válido',
    email: 'gustavo.brito@gmail.com',
    whatsapp: '(83) 99812-4407',
    verification: verificationOf('02/08/26', false, false),
  },
  {
    id: 'gustavo-martins',
    name: 'Gustavo Martins',
    elo: 'Prata II',
    city: 'Natal · RN',
    matches: 31,
    since: '01/25',
    brand: '',
    accountType: 'Pessoa física (CPF)',
    document: '511.203.884-21',
    documentStatus: 'CPF · válido',
    email: 'gustavo.martins@gmail.com',
    whatsapp: '(84) 99631-2210',
    verification: verificationOf('14/07/26', false, false),
  },
  {
    id: 'gustavo-rocha',
    name: 'Gustavo Rocha',
    elo: 'Bronze I',
    city: 'Recife · PE',
    matches: 12,
    since: '06/26',
    brand: '',
    accountType: 'Pessoa física (CPF)',
    document: '702.998.114-70',
    documentStatus: 'CPF · válido',
    email: 'gustavo.rocha@outlook.com',
    whatsapp: '(81) 98844-1907',
    verification: verificationOf('21/07/26', false, false),
  },
  {
    id: 'gustava-almeida',
    name: 'Gustava Almeida',
    elo: 'Ouro I',
    city: 'Fortaleza · CE',
    matches: 112,
    since: '09/23',
    brand: 'Almeida Beach Experience',
    accountType: 'Pessoa jurídica (CNPJ)',
    document: '41.882.330/0001-55',
    documentStatus: 'CNPJ · válido',
    email: 'contato@almeidabeach.com.br',
    whatsapp: '(85) 99120-7788',
    verification: verificationOf('30/06/26', true, true),
  },
  {
    id: 'renata-alves',
    name: 'Renata Alves',
    elo: 'Prata I',
    city: 'Maceió · AL',
    matches: 47,
    since: '11/24',
    brand: 'Arena Jatiúca Torneios',
    accountType: 'Pessoa física (CPF)',
    document: '229.640.115-38',
    documentStatus: 'CPF · válido',
    email: 'renata.alves@gmail.com',
    whatsapp: '(82) 99745-3312',
    verification: verificationOf('28/07/26', true, false),
  },
  {
    id: 'felipe-cardoso',
    name: 'Felipe Cardoso',
    elo: 'Ouro III',
    city: 'Campinas · SP',
    matches: 93,
    since: '05/23',
    brand: 'Cardoso Beach Academy',
    accountType: 'Pessoa jurídica (CNPJ)',
    document: '52.104.776/0001-09',
    documentStatus: 'CNPJ · válido',
    email: 'felipe@cardosobeach.com.br',
    whatsapp: '(19) 99188-6540',
    verification: verificationOf('19/07/26', true, true),
  },
  {
    id: 'mariana-ohana',
    name: 'Mariana Ohana',
    elo: 'Bronze I',
    city: 'Belém · PA',
    matches: 18,
    since: '02/26',
    brand: 'Circuito Paraense',
    accountType: 'Pessoa física (CPF)',
    document: '944.317.802-11',
    documentStatus: 'CPF · válido',
    email: 'mariana.ohana@gmail.com',
    whatsapp: '(91) 98322-4471',
    verification: verificationOf('01/08/26', false, false),
  },
  {
    id: 'diego-santana',
    name: 'Diego Santana',
    elo: 'Prata III',
    city: 'Caxias do Sul · RS',
    matches: 62,
    since: '07/24',
    brand: 'Copa Serrana',
    accountType: 'Pessoa física (CPF)',
    document: '318.775.409-62',
    documentStatus: 'CPF · em análise',
    email: 'diego.santana@gmail.com',
    whatsapp: '(54) 99612-8830',
    verification: verificationOf('26/07/26', false, false),
  },
  {
    id: 'bruno-tavares',
    name: 'Bruno Tavares',
    elo: 'Prata I',
    city: 'Florianópolis · SC',
    matches: 55,
    since: '10/24',
    brand: 'Norte da Ilha Beach',
    accountType: 'Pessoa física (CPF)',
    document: '482.116.930-77',
    documentStatus: 'CPF · válido',
    email: 'bruno.tavares@gmail.com',
    whatsapp: '(48) 99277-1043',
    verification: verificationOf('29/07/26', true, false),
  },
  {
    id: 'fernanda-lima',
    name: 'Fernanda Lima',
    elo: 'Ouro I',
    city: 'Recife · PE',
    matches: 128,
    since: '04/23',
    brand: '',
    accountType: 'Pessoa física (CPF)',
    document: '660.442.187-04',
    documentStatus: 'CPF · em análise',
    email: 'fernanda.lima@gmail.com',
    whatsapp: '(81) 99457-2216',
    verification: verificationOf('31/07/26', false, false),
  },
];

export const ACCESS_REQUESTS: readonly AccessRequest[] = [
  {
    id: 'sol-1042',
    athleteId: 'gustavo-brito',
    reason:
      'Quero organizar o circuito municipal de BT com apoio da prefeitura. Temos 6 etapas previstas e 3 arenas parceiras já confirmadas.',
    age: 'há 2 h',
  },
  {
    id: 'sol-1041',
    athleteId: 'renata-alves',
    reason: 'Já organizo torneios internos da arena onde treino, 4 edições concluídas com 32 duplas cada.',
    age: 'há 5 h',
  },
  {
    id: 'sol-1039',
    athleteId: 'felipe-cardoso',
    reason: 'Sou professor e quero criar um rei da praia mensal para alunos da minha escolinha.',
    age: 'ontem',
  },
  {
    id: 'sol-1036',
    athleteId: 'mariana-ohana',
    reason: 'Primeira etapa do circuito paraense, previsão para outubro em duas arenas de Belém.',
    age: 'há 2 dias',
  },
  {
    id: 'sol-1031',
    athleteId: 'diego-santana',
    reason: 'Retomar a Copa Serrana com 4 etapas na serra gaúcha, já temos patrocínio local.',
    age: 'há 4 dias',
  },
  {
    id: 'sol-1028',
    athleteId: 'fernanda-lima',
    reason: 'Quero levar o formato sideout para as arenas de Boa Viagem, começando com uma etapa piloto.',
    age: 'há 6 dias',
  },
  {
    id: 'sol-1024',
    athleteId: 'bruno-tavares',
    reason: 'Torneio beneficente no Norte da Ilha, duas categorias e renda revertida para o projeto social.',
    age: 'há 8 dias',
  },
];

export const ROLE_PERMISSIONS: readonly PermissionDef[] = [
  {
    id: 'tournaments',
    label: 'Criar e publicar torneios',
    desc: 'Torneios de eliminatória, grupos e chave dupla',
  },
  {
    id: 'king-sideout',
    label: 'Rei da Praia e Sideout',
    desc: 'Formatos individuais com rodízio de parceiros',
  },
  { id: 'leagues', label: 'Ligas e circuitos', desc: 'Séries de etapas com ranking acumulado' },
  {
    id: 'paid-registrations',
    label: 'Receber inscrições pagas',
    desc: 'Cobrança via PIX com repasse pela NexaGO',
  },
  { id: 'staff', label: 'Gerenciar equipe', desc: 'Convidar árbitros, mesários e staff para os eventos' },
  { id: 'broadcast', label: 'Telão e transmissão', desc: 'Painel público de chaves e resultados ao vivo' },
  {
    id: 'edit-results',
    label: 'Editar resultados após encerramento',
    desc: 'Exige verificação completa e 5 torneios concluídos',
    locked: true,
  },
];

/** Permissões ligadas por padrão no perfil "Novato". */
export const DEFAULT_PERMISSIONS: readonly string[] = [
  'tournaments',
  'king-sideout',
  'paid-registrations',
  'staff',
  'broadcast',
];

export const CITY_OPTIONS: readonly string[] = [
  'João Pessoa · PB',
  'Natal · RN',
  'Recife · PE',
  'Maceió · AL',
  'Fortaleza · CE',
  'Salvador · BA',
  'Belém · PA',
  'Campinas · SP',
  'São Paulo · SP',
  'Caxias do Sul · RS',
];

export const ACCOUNT_TYPE_OPTIONS: readonly AccountType[] = [
  'Pessoa física (CPF)',
  'Pessoa jurídica (CNPJ)',
];

export const COMMISSION_OPTIONS: readonly string[] = [
  '8% por inscrição (padrão)',
  '6% por inscrição (parceiro)',
  '5% por inscrição (liga oficial)',
];

export const PAYOUT_OPTIONS: readonly string[] = [
  'Automático · D+1 após o torneio',
  'Automático · D+7 após o torneio',
  'Manual · mediante solicitação',
];

export const LIMIT_OPTIONS: readonly string[] = [
  'R$ 10.000 em inscrições (novato)',
  'R$ 30.000 em inscrições (intermediário)',
  'Sem limite (parceiro)',
];

export function findAthlete(id: string): Athlete | undefined {
  return ATHLETES.find((a) => a.id === id);
}

export function findRequest(id: string): AccessRequest | undefined {
  return ACCESS_REQUESTS.find((r) => r.id === id);
}


export interface PontoRetirada {
  id: string;
  /** Liga ao `Local` do estoque (tela 06). */
  localId: string;
  nome: string;
  endereco: string;
  bairro: string;
  cidade: string;
  balcao: string;
  horario: string;
  responsavel: string | null;
  prazoAbastecimentoH: 24 | 48;
  /** `null` herda o padrão da configuração. */
  comissaoPct: number | null;
  ativo: boolean;
  /** Pedidos `ret` (Pronto p/ retirar) neste ponto. */
  aguardando: number;
}

export interface ModalidadeFrete {
  id: string;
  nome: string;
  descricao: string;
  tipoValor: 'calculado' | 'fixo';
  valorCents: number | null;
  ativo: boolean;
}

export interface ConfigFrete {
  freteGratisAcimaCents: number;
  prazoRetiradaDias: number;
  cepOrigem: string;
  prazoSeparacaoH: number;
  cancelarRetiradaVencida: boolean;
  reembolsoEmSaldo: boolean;
  comissaoPadraoPct: number;
}

export type RemessaStatus = 'em_transito' | 'recebida';

/** Mesmo objeto `Transferencia` da tela de estoque, na visão que esta tela precisa. */
export interface Remessa {
  id: string;
  codigo: string;
  destino: string;
  pedidos: number;
  unidades: number;
  status: RemessaStatus;
  /** Texto pronto: "Saiu hoje 08:30", "Hoje 09:40 · Paula R.". */
  quando: string;
}

export interface RetiradaData {
  pontos: PontoRetirada[];
  modalidades: ModalidadeFrete[];
  config: ConfigFrete;
  remessas: Remessa[];
  melhorEnvioConectado: boolean;
}

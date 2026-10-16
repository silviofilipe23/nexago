export interface PontoRetirada {
  /** Id da arena — o ponto usa o mesmo id (`storePickupPoints/{arenaId}`). */
  id: string;
  /** `false` = arena ativa no nexaGO que ainda não foi configurada como ponto. */
  configurado: boolean;
  /** Local de estoque ligado à arena (tela 06), quando existe. */
  localId: string | null;
  nome: string;
  endereco: string;
  cidade: string;
  balcao: string;
  horario: string;
  responsavel: string;
  prazoAbastecimentoH: 24 | 48;
  /** `null` herda o padrão da configuração. */
  comissaoPct: number | null;
  ativo: boolean;
  /** Pedidos `ret` (Pronto p/ retirar) neste ponto. Zero até a Loja ter pedidos. */
  aguardando: number;
}

export type ModalidadeId = 'padrao' | 'expressa' | 'motoboy';

export interface ModalidadeFrete {
  id: ModalidadeId;
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

export type RemessaStatus = 'separacao' | 'em_transito' | 'recebida';

/** Transferência entre locais de estoque (`storeTransfers`, a mesma da tela 06b). */
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

/** Cadastro/edição de um ponto: o que vai para a callable `saveStorePickupPoint`. */
export interface PontoInput {
  arenaId: string;
  balcao: string;
  horario: string;
  responsavel: string;
  prazoAbastecimentoH: 24 | 48;
  comissaoPct: number | null;
  ativo: boolean;
}

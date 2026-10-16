import { Injectable } from '@angular/core';
import type { RetiradaData } from './retirada.model';

/**
 * Fase de desenho: ainda não há backend de retirada & frete, então a tela lê dados de
 * exemplo. Trocar por Firestore/callable muda só esta classe.
 */
@Injectable({ providedIn: 'root' })
export class RetiradaRepository {
  async load(): Promise<RetiradaData> {
    return {
      melhorEnvioConectado: true,
      pontos: [
        {
          id: 'errejota', localId: 'loc-errejota', nome: 'Arena Errejota', endereco: 'Av. Perimetral, 1200',
          bairro: 'Setor Marista', cidade: 'Goiânia', balcao: 'Recepção', horario: '8h–22h',
          responsavel: 'Paula R.', prazoAbastecimentoH: 24, comissaoPct: null, ativo: true, aguardando: 18,
        },
        {
          id: 'cfc', localId: 'loc-cfc', nome: 'Arena CFC', endereco: 'Rua 90, 410',
          bairro: 'Setor Oeste', cidade: 'Goiânia', balcao: 'Lanchonete', horario: '7h–23h',
          responsavel: 'Diego S.', prazoAbastecimentoH: 24, comissaoPct: null, ativo: true, aguardando: 6,
        },
        {
          id: 'praia-bt-sul', localId: 'loc-praia-bt-sul', nome: 'Praia BT Sul', endereco: 'Av. Goiás, 88',
          bairro: 'Jd. América', cidade: 'Goiânia', balcao: 'Recepção', horario: '6h–22h',
          responsavel: 'Márcia T.', prazoAbastecimentoH: 48, comissaoPct: null, ativo: true, aguardando: 3,
        },
        {
          id: 'beach-club', localId: 'loc-beach-club', nome: 'Arena Beach Club', endereco: 'Q. 12, Lote 4',
          bairro: 'Águas Claras', cidade: 'Brasília', balcao: '', horario: '',
          responsavel: null, prazoAbastecimentoH: 48, comissaoPct: null, ativo: false, aguardando: 0,
        },
      ],
      modalidades: [
        { id: 'padrao', nome: 'Padrão', descricao: 'Correios PAC / Jadlog · 3–5 dias úteis', tipoValor: 'calculado', valorCents: null, ativo: true },
        { id: 'expressa', nome: 'Expressa', descricao: 'Loggi · Goiânia e região em 24 h', tipoValor: 'fixo', valorCents: 3490, ativo: true },
        { id: 'motoboy', nome: 'Motoboy', descricao: 'Mesma cidade · até 3 h', tipoValor: 'fixo', valorCents: 1490, ativo: false },
      ],
      config: {
        freteGratisAcimaCents: 39900, prazoRetiradaDias: 5, cepOrigem: '74215-010',
        prazoSeparacaoH: 24, cancelarRetiradaVencida: true, reembolsoEmSaldo: true, comissaoPadraoPct: 4,
      },
      remessas: [
        { id: 'tr-118', codigo: 'TR-118', destino: 'Arena CFC', pedidos: 6, unidades: 24, status: 'em_transito', quando: 'Saiu hoje 08:30' },
        { id: 'tr-117', codigo: 'TR-117', destino: 'Arena Errejota', pedidos: 9, unidades: 31, status: 'recebida', quando: 'Hoje 09:40 · Paula R.' },
        { id: 'tr-116', codigo: 'TR-116', destino: 'Praia BT Sul', pedidos: 3, unidades: 7, status: 'recebida', quando: 'Ontem 16:12' },
      ],
    };
  }
}

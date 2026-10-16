import { Injectable } from '@angular/core';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { backofficeDb } from '../../data/firebase';
import type { PontoRetirada, RetiradaData } from './retirada.model';

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * As arenas são reais (coleção `arenas`, só as já reivindicadas: pré-cadastro não opera
 * retirada). O resto — configuração do ponto, modalidades, regras e remessas — ainda não
 * tem backend e segue como dado de exemplo. Trocar por Firestore/callable muda só esta classe.
 */
@Injectable({ providedIn: 'root' })
export class RetiradaRepository {
  private async listArenas(): Promise<PontoRetirada[]> {
    const snap = await getDocs(query(collection(backofficeDb(), 'arenas'), orderBy('name')));
    return snap.docs
      .filter((d) => d.data()['unclaimed'] !== true)
      .map((d) => {
        const data = d.data();
        const city = str(data['city']);
        const state = str(data['state']);
        return {
          id: d.id,
          localId: '',
          nome: str(data['name']) || `Arena ${d.id}`,
          endereco: str(data['address']),
          bairro: '',
          cidade: city && state ? `${city} · ${state}` : city || state,
          balcao: '',
          horario: '',
          responsavel: null,
          prazoAbastecimentoH: 24,
          comissaoPct: null,
          ativo: false,
          aguardando: 0,
        };
      });
  }

  async load(): Promise<RetiradaData> {
    return {
      melhorEnvioConectado: true,
      pontos: await this.listArenas(),
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

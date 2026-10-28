/**
 * Convite do NexaSquad (`/indicacao?squad=CODIGO`, para onde `/?squad=` leva): quem convidou e o
 * que o código oferece, pela callable aberta `getSquadReferral` (`functions/src/squad-attribution.ts`).
 * O visitante ainda não tem conta, e contrato e regras do Squad são só do servidor.
 *
 * Espelho à mão de `SquadReferralView`: mudou lá, muda aqui.
 */
import { InjectionToken } from '@angular/core';
import { httpsCallable } from 'firebase/functions';
import { athleteFunctions } from '../data/functions';
import { discountWhere } from '../squad/data/squad-model';
import type { SquadTier } from '../squad/data/squad-view';

export interface SquadReferral {
  ambassador: {
    uid: string;
    name: string;
    photoUrl: string | null;
    tier: SquadTier | null;
    /** "Goiânia, GO · Arena Sol"; `null` quando o perfil não mostra. */
    place: string | null;
  };
  /** Até quanto o seguidor ganha (o teto na taxa corta no checkout). 0 = o nível não dá desconto. */
  discountPct: number;
  firstOnly: boolean;
  scope: { registration: boolean; booking: boolean; club: boolean };
}

/**
 * `inactive` = o servidor não achou contrato vigente para o código (pausado, encerrado, digitado
 * errado). `unknown` = não deu para perguntar (rede, função ainda não publicada): a página não
 * afirma nem nega o desconto em detalhe.
 */
export type SquadReferralLookup =
  | { kind: 'found'; referral: SquadReferral }
  | { kind: 'inactive' }
  | { kind: 'unknown' };

const TIERS: ReadonlySet<string> = new Set<SquadTier>(['ath', 'amb', 'pro', 'cap']);

type Raw = Record<string, unknown>;

function text(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

function isObj(v: unknown): v is Raw {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Resposta da callable (`{referral}`) → estado da página. Formato torto vira `unknown`. */
export function parseSquadReferral(data: unknown): SquadReferralLookup {
  if (!isObj(data) || !('referral' in data)) return { kind: 'unknown' };
  const r = data['referral'];
  if (r === null) return { kind: 'inactive' };
  if (!isObj(r) || !isObj(r['ambassador']) || !isObj(r['scope'])) return { kind: 'unknown' };
  const a = r['ambassador'];
  const uid = text(a['uid']);
  const name = text(a['name']);
  if (!uid || !name) return { kind: 'unknown' };
  const photo = text(a['photoUrl']);
  const city = text(a['city']);
  const state = text(a['state']);
  const town = city && state ? `${city}, ${state}` : city ?? state;
  const place = [town, text(a['arenaName'])].filter(Boolean).join(' · ') || null;
  const pct = r['discountPct'];
  const scope = r['scope'];
  return {
    kind: 'found',
    referral: {
      ambassador: {
        uid,
        name,
        photoUrl: photo && /^https?:\/\//i.test(photo) ? photo : null,
        tier: typeof a['tier'] === 'string' && TIERS.has(a['tier']) ? (a['tier'] as SquadTier) : null,
        place,
      },
      discountPct: typeof pct === 'number' && pct > 0 ? pct : 0,
      firstOnly: r['firstOnly'] !== false,
      scope: {
        registration: scope['registration'] !== false,
        booking: scope['booking'] !== false,
        club: scope['club'] !== false,
      },
    },
  };
}

/** Quem está vendo: sem conta, com conta, ou o próprio embaixador abrindo o próprio link. */
export type ReferralViewer = 'guest' | 'member' | 'self';

export interface ReferralCopy {
  title: string;
  lead: string;
  /** Linha do desconto ("Até 10% OFF na primeira inscrição…"); `null` = nada a prometer. */
  offer: string | null;
}

/** Sem a callable, o que dá para dizer sem errar: o código existe no link e dá desconto na taxa. */
const GENERIC_OFFER = 'Desconto na taxa de serviço da nexaGO';

function offerLine(r: SquadReferral): string | null {
  const where = discountWhere({ followerDiscountFirstOnly: r.firstOnly, followerDiscountScope: r.scope });
  return r.discountPct > 0 && where ? `Até ${r.discountPct}% OFF ${where}` : null;
}

export function referralCopy(lookup: SquadReferralLookup, viewer: ReferralViewer): ReferralCopy {
  if (lookup.kind === 'inactive') {
    return {
      title: 'Este código não está ativo',
      lead:
        viewer === 'guest'
          ? 'Ele foi pausado ou encerrado, então não dá desconto agora. Você ainda pode criar sua conta grátis.'
          : 'Ele foi pausado ou encerrado, então não dá desconto agora.',
      offer: null,
    };
  }
  if (lookup.kind === 'unknown') {
    return {
      title: 'Você recebeu um código de embaixador',
      lead:
        viewer === 'guest'
          ? 'Crie sua conta grátis por este link e o desconto entra sozinho no pagamento.'
          : 'O desconto entra sozinho no pagamento. Se não aparecer, digite o código na hora de pagar.',
      offer: GENERIC_OFFER,
    };
  }
  const { referral } = lookup;
  const offer = offerLine(referral);
  if (viewer === 'self') {
    return {
      title: 'Este é o seu link de embaixador',
      lead: 'Quem abrir por aqui e criar a conta ganha o desconto e conta como sua indicação. No seu próprio pagamento ele não vale.',
      offer,
    };
  }
  const name = referral.ambassador.name;
  if (!offer) {
    return {
      title: `${name} te convidou pro nexaGO`,
      lead:
        viewer === 'guest'
          ? 'Crie sua conta grátis: torneios, reserva de quadra e clubinho num lugar só.'
          : 'Bom jogo! Torneios, reservas e clubinhos estão a um toque.',
      offer: null,
    };
  }
  return {
    title: `${name} te deu desconto no nexaGO`,
    lead:
      viewer === 'guest'
        ? 'Crie sua conta grátis por este link e o desconto entra sozinho no pagamento.'
        : 'O desconto entra sozinho no pagamento. Se não aparecer, digite o código na hora de pagar.',
    offer,
  };
}

/** Consulta do convite; os specs trocam pela resposta que precisam. */
export const SQUAD_REFERRAL_LOOKUP = new InjectionToken<(code: string) => Promise<SquadReferralLookup>>(
  'SQUAD_REFERRAL_LOOKUP',
  {
    providedIn: 'root',
    factory: () => async (code: string) => {
      try {
        const result = await httpsCallable(athleteFunctions(), 'getSquadReferral')({ code });
        return parseSquadReferral(result.data);
      } catch {
        return { kind: 'unknown' } as const;
      }
    },
  },
);

import type { TournamentCategoryOffer } from '../../../data/tournaments-repository';

/** Textos do passo 3 (condições da inscrição) por variante.
 *
 *  Porte fiel de `registration_terms_copy.dart`. Puro de propósito: as quatro variantes (dupla
 *  obrigatória, dupla com reserva solo, equipe trio+, convite recebido) são regra de produto, e
 *  regra testada em módulo puro não some quando alguém mexe no layout. */
export interface RegistrationTermsCopy {
  readonly eyebrow: string;
  readonly title: string;
  readonly body: string;
  readonly ctaLabel: string;
  /** A categoria aceita guardar a vaga sem parceiro definido. */
  readonly allowsSolo: boolean;
  /** Rótulo da ação secundária (`null` = sem ação secundária). */
  readonly secondaryLabel: string | null;
}

export interface RegistrationTermsCopyInput {
  readonly category: Pick<TournamentCategoryOffer, 'teamSize'>;
  readonly requireFormedPair: boolean;
  readonly hasReceivedInvite: boolean;
  readonly inviterName?: string | null;
  /** O convite RECEBIDO é de equipe. Checado ANTES de `category.teamSize` no ramo de convite
   *  porque é o convite — não a categoria — quem diz se é elenco: uma categoria sem `teamSize`
   *  preenchido (dado legado/ausente) ainda pode ter um convite de equipe válido. */
  readonly isTeamInvite?: boolean;
}

export function registrationTermsCopy(input: RegistrationTermsCopyInput): RegistrationTermsCopy {
  if (input.hasReceivedInvite) {
    const who = (input.inviterName ?? '').trim();
    if (input.isTeamInvite === true) {
      return {
        eyebrow: 'CONVITE RECEBIDO',
        title: who.length === 0 ? 'Você foi convidado para este elenco' : `${who} te chamou para o elenco`,
        body: 'Ao aceitar, você entra no elenco e a vaga fica reservada — o pagamento abre em seguida.',
        ctaLabel: 'Aceitar convite',
        allowsSolo: false,
        secondaryLabel: null,
      };
    }
    return {
      eyebrow: 'CONVITE RECEBIDO',
      title: who.length === 0 ? 'Você foi convidado para esta categoria' : `${who} quer jogar com você`,
      body: 'Ao aceitar, vocês ficam com a vaga reservada e o pagamento abre em seguida.',
      ctaLabel: 'Aceitar convite',
      allowsSolo: false,
      secondaryLabel: null,
    };
  }

  const teamSize = input.category.teamSize;
  if (teamSize != null && teamSize > 2) {
    return {
      eyebrow: 'EQUIPE',
      title: `Esta categoria é disputada em equipe de ${teamSize}`,
      body: 'Você monta o elenco e convida os integrantes. A inscrição fecha quando o elenco estiver completo.',
      ctaLabel: 'Montar meu elenco',
      allowsSolo: false,
      secondaryLabel: null,
    };
  }

  if (input.requireFormedPair) {
    return {
      eyebrow: 'DUPLA OBRIGATÓRIA',
      title: 'Este torneio só aceita inscrição com dupla',
      body: 'O organizador não abre vaga individual nesta categoria. Defina o parceiro para seguir com a inscrição.',
      ctaLabel: 'Definir meu parceiro',
      allowsSolo: false,
      secondaryLabel: null,
    };
  }

  return {
    eyebrow: 'DUPLA',
    title: 'Escolha com quem você joga',
    body: 'Você pode convidar o parceiro agora ou guardar sua vaga e definir depois, enquanto as inscrições estiverem abertas.',
    ctaLabel: 'Escolher meu parceiro',
    allowsSolo: true,
    secondaryLabel: 'Guardar minha vaga sem parceiro',
  };
}

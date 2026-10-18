import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NxToastService } from '../shared/feedback';
import {
  ORIGIN_LABELS,
  availableHint,
  brl,
  commissionStatusMeta,
  cyclePill,
  earnedCents,
  funnelSteps,
  levelProgress,
  monthConversions,
  plural,
  promotionCopy,
  rankingRows,
  tournamentShareLink,
  whenLabel,
} from './data/squad-model';
import { promoTournaments, type PromoTournament } from './data/squad-promo';
import { SQUAD_NOW, SQUAD_TOURNAMENTS } from './data/squad-tokens';
import type { AmbassadorView } from './data/squad-view';
import { SquadCodeCardComponent } from './ui/squad-code-card.component';
import { shareLink } from './ui/squad-share';
import { SquadTierComponent } from './ui/squad-tier.component';

/** Iniciais e tom do avatar (o desenho usa uma cor por pessoa; aqui sai do nome, estável). */
export function avatarOf(name: string): { initials: string; hue: number } {
  const parts = name.replace(/\./g, '').trim().split(/\s+/).filter(Boolean);
  const initials = ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '')).toUpperCase() || 'AT';
  let hue = 0;
  for (const ch of name) hue = (hue * 31 + ch.charCodeAt(0)) % 360;
  return { initials, hue };
}

/** 01 · Painel do embaixador. */
@Component({
  selector: 'app-squad-painel',
  imports: [RouterLink, SquadCodeCardComponent, SquadTierComponent],
  templateUrl: './squad-painel.component.html',
  styleUrl: './squad-painel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SquadPainelComponent {
  private readonly toast = inject(NxToastService);
  private readonly loadTournaments = inject(SQUAD_TOURNAMENTS);
  private readonly now = inject(SQUAD_NOW)();

  readonly view = input.required<AmbassadorView>();

  protected readonly member = computed(() => this.view().member);
  protected readonly pill = computed(() => cyclePill(this.member(), this.now));
  protected readonly earned = computed(() => brl(earnedCents(this.member()), false));
  protected readonly available = computed(() => brl(this.member().earnings.availableCents, false));
  protected readonly availableSub = computed(() => availableHint(this.member()));
  protected readonly grossLabel = computed(() => brl(this.member().earnings.revenueCents, false));
  protected readonly cycleName = computed(() => (this.member().cycleId === 'piloto' ? 'no piloto' : 'no ciclo'));
  protected readonly athletesLabel = computed(() => plural(this.member().athletes, 'atleta', 'atletas'));
  protected readonly month = computed(() => monthConversions(this.member(), this.now));

  protected readonly funnel = computed(() => funnelSteps(this.member(), this.view().extras));
  protected readonly ranking = computed(() => {
    const r = this.view().ranking;
    if (!r) return null;
    return rankingRows(r.entries, r.me).map((row) => ({
      ...row,
      label: row.me ? 'Você' : row.name,
      avatar: avatarOf(row.name),
      pointsLabel: row.points.toLocaleString('pt-BR'),
    }));
  });
  protected readonly promotion = computed(() => promotionCopy(this.member()));
  protected readonly level = computed(() => levelProgress(this.member().points));
  protected readonly pointsLabel = computed(() => this.member().points.total.toLocaleString('pt-BR'));
  protected readonly missingLabel = computed(() => {
    const next = this.level().next;
    return next ? `${next.missing.toLocaleString('pt-BR')} p/ ${next.name}` : null;
  });

  protected readonly recent = computed(() =>
    this.member()
      .commissions.slice(0, 5)
      .map((c) => ({
        ...c,
        event: [c.tournamentName, c.categoryName].filter(Boolean).join(' · '),
        avatar: avatarOf(c.label),
        when: `${whenLabel(c.at, this.now)} · ${ORIGIN_LABELS[c.origin]}`,
        amount: `+${brl(c.amountCents)}`,
        meta: commissionStatusMeta(c.status, c.cancelReason),
      })),
  );

  protected readonly promo = signal<PromoTournament[] | null>(null);

  constructor() {
    this.loadTournaments()
      .then((list) => this.promo.set(promoTournaments(list, this.now)))
      .catch(() => this.promo.set([]));
  }

  protected async shareTournament(t: PromoTournament): Promise<void> {
    const code = this.member().code;
    const out = await shareLink({
      title: t.name,
      text: `Bora jogar o ${t.name}? Use meu código ${code} na inscrição.`,
      url: tournamentShareLink(t.id, code),
    });
    if (out === 'copied') this.toast.success('Link copiado', 'Já vai com o seu código.');
    if (out === 'failed') this.toast.error('Não foi possível compartilhar agora.');
  }
}

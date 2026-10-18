import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NxToastService } from '../shared/feedback';
import {
  ORIGIN_LABELS,
  TIER_LABELS,
  availableHint,
  brl,
  commissionStatusMeta,
  cyclePill,
  funnelSteps,
  levelProgress,
  plural,
  promotionCopy,
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

  protected readonly pill = computed(() => cyclePill(this.view().cycle, this.now));
  protected readonly totals = computed(() => this.view().totals);
  protected readonly earned = computed(() => brl(this.totals().earnedCents, false));
  protected readonly available = computed(() => brl(this.totals().availableCents, false));
  protected readonly availableSub = computed(() => availableHint(this.view()));
  protected readonly grossLabel = computed(() => brl(this.totals().grossCents, false));
  protected readonly cycleName = computed(() => (this.view().cycle.id === 'piloto' ? 'no piloto' : 'no ciclo'));
  protected readonly athletesLabel = computed(() => plural(this.totals().athletes, 'atleta', 'atletas'));

  protected readonly funnel = computed(() => funnelSteps(this.view().funnel));
  protected readonly ranking = computed(() =>
    this.view().ranking.rows.map((r) => ({
      ...r,
      label: r.me ? 'Você' : r.name,
      avatar: avatarOf(r.name),
      deltaLabel: r.delta > 0 ? `▲${r.delta}` : r.delta < 0 ? `▼${-r.delta}` : '—',
      deltaTone: r.delta > 0 ? 'up' : r.delta < 0 ? 'down' : 'flat',
      pointsLabel: r.points.toLocaleString('pt-BR'),
    })),
  );
  protected readonly promotion = computed(() => promotionCopy(this.view().promotion));
  protected readonly level = computed(() => levelProgress(this.view().points));
  protected readonly pointsLabel = computed(() => this.view().points.total.toLocaleString('pt-BR'));
  protected readonly tierLabels = TIER_LABELS;

  protected readonly recent = computed(() =>
    this.view()
      .commissions.slice(0, 5)
      .map((c) => ({
        ...c,
        avatar: avatarOf(c.athlete),
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
    const code = this.view().contract.code;
    const out = await shareLink({
      title: t.name,
      text: `Bora jogar o ${t.name}? Use meu código ${code} na inscrição.`,
      url: tournamentShareLink(t.id, code),
    });
    if (out === 'copied') this.toast.success('Link copiado', 'Já vai com o seu código.');
    if (out === 'failed') this.toast.error('Não foi possível compartilhar agora.');
  }
}

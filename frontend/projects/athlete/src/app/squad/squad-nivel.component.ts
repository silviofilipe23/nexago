import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import {
  BENEFIT_STATUS_LABELS,
  benefitsOf,
  contractPeriod,
  levelProgress,
  packageChips,
  pointsRules,
  promotionCopy,
} from './data/squad-model';
import { SquadStore } from './data/squad.store';
import { SquadFrameComponent } from './ui/squad-frame.component';
import { SquadTierComponent } from './ui/squad-tier.component';

/** Regras de divulgação do programa (card "Ao divulgar"). */
export const SQUAD_POSTING_RULES = [
  'Sempre identifique a parceria: #publi ou “parceria paga”.',
  'Use o card oficial ou fale com suas palavras — sem roteiro obrigatório.',
  'O NexaGO pode repostar e impulsionar seu conteúdo por 12 meses.',
] as const;

/** 03 · Nível & benefícios: pacote do contrato, pontos e o caminho da promoção. */
@Component({
  selector: 'app-squad-nivel',
  imports: [SquadFrameComponent, SquadTierComponent],
  templateUrl: './squad-nivel.component.html',
  styleUrl: './squad-nivel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SquadNivelComponent {
  protected readonly store = inject(SquadStore);
  protected readonly statusLabels = BENEFIT_STATUS_LABELS;
  protected readonly postingRules = SQUAD_POSTING_RULES;

  protected readonly period = computed(() => {
    const v = this.store.ambassador();
    return v ? contractPeriod(v.contract) : '';
  });
  protected readonly benefits = computed(() => {
    const v = this.store.ambassador();
    return v ? benefitsOf(v) : [];
  });
  protected readonly level = computed(() => {
    const v = this.store.ambassador();
    return v ? levelProgress(v.points) : null;
  });
  protected readonly pointsLabel = computed(() => (this.store.ambassador()?.points.total ?? 0).toLocaleString('pt-BR'));
  protected readonly earn = computed(() => {
    const v = this.store.ambassador();
    return v ? pointsRules(v.points) : [];
  });
  protected readonly promotion = computed(() => {
    const v = this.store.ambassador();
    return v ? promotionCopy(v.promotion) : null;
  });
  protected readonly criteria = computed(() => {
    const v = this.store.ambassador();
    const p = v?.promotion;
    if (!p || p.kind !== 'promotion') return [];
    const missing = Math.max(0, p.min - p.conversions);
    return [
      { label: `${p.min} conversões pagas`, value: `${p.conversions} de ${p.min}`, ok: missing === 0 },
      ...p.checklist.map((item) => ({ label: item, value: 'avaliado pelo time', ok: null as boolean | null })),
    ];
  });
  protected readonly nextChips = computed(() => {
    const p = this.store.ambassador()?.promotion;
    return p?.kind === 'promotion' ? packageChips(p.nextPackage) : [];
  });
}

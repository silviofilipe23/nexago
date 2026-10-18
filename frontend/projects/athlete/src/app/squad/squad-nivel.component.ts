import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import {
  BENEFIT_STATUS_LABELS,
  benefitsOf,
  contractPeriod,
  levelProgress,
  packageChips,
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
    return v ? contractPeriod(v.member) : '';
  });
  protected readonly benefits = computed(() => {
    const v = this.store.ambassador();
    return v ? benefitsOf(v.member) : [];
  });
  protected readonly level = computed(() => {
    const v = this.store.ambassador();
    return v ? levelProgress(v.member.points) : null;
  });
  protected readonly pointsLabel = computed(() => (this.store.ambassador()?.member.points.total ?? 0).toLocaleString('pt-BR'));
  protected readonly missingLabel = computed(() => {
    const next = this.level()?.next;
    return next ? `Faltam ${next.missing.toLocaleString('pt-BR')} pts para ${next.name}.` : null;
  });
  protected readonly perConversion = computed(() => this.store.ambassador()?.member.points.perConversion ?? 0);
  protected readonly promotion = computed(() => {
    const v = this.store.ambassador();
    return v ? promotionCopy(v.member) : null;
  });
  protected readonly criteria = computed(() => {
    const v = this.store.ambassador();
    const p = v?.member.progress;
    if (!v || !p) return [];
    const missing = Math.max(0, p.minConversions - p.conversions);
    return [
      { label: `${p.minConversions} conversões pagas`, value: `${p.conversions} de ${p.minConversions}`, ok: missing === 0 },
      ...v.extras.promotionChecklist.map((item) => ({ label: item, value: 'avaliado pelo time', ok: null as boolean | null })),
    ];
  });
  protected readonly nextChips = computed(() => {
    const next = this.store.ambassador()?.member.nextPackage;
    return next ? packageChips(next) : [];
  });
}

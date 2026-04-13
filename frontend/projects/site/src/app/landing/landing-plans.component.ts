import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { RevealDirective } from './ui/reveal.directive';

type PlanProfile = 'athlete' | 'arena' | 'organizer';

type PlanCard = {
  profile: PlanProfile;
  title: string;
  priceLine: string;
  subtitle: string;
  highlights: string[];
  cta: string;
  featured?: boolean;
};

@Component({
  selector: 'app-landing-plans',
  standalone: true,
  imports: [RevealDirective],
  templateUrl: './landing-plans.component.html',
  styleUrl: './landing-plans.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingPlansComponent {
  private readonly router = inject(Router);

  /** Perfil cujo CTA está em navegação (feedback visual). */
  protected readonly loadingPlan = signal<PlanProfile | null>(null);

  readonly plans: PlanCard[] = [
    {
      profile: 'athlete',
      title: 'Plano Atleta',
      priceLine: 'Grátis para começar',
      subtitle: 'Para quem quer jogar mais e evoluir com recorrência.',
      highlights: [
        'Reserva rápida de quadras',
        'Histórico de partidas e ranking',
        'Inscrição simplificada em torneios',
      ],
      cta: 'Criar conta de atleta',
    },
    {
      profile: 'arena',
      title: 'Plano Arena Pro',
      priceLine: 'A partir de R$ 149/mes',
      subtitle: 'Gestão centralizada para lotar horários e reduzir no-show.',
      highlights: [
        'Calendário com bloqueios inteligentes',
        'Pagamentos e repasses em um painel',
        'Controle de operação por unidade',
      ],
      cta: 'Falar com time comercial',
      featured: true,
    },
    {
      profile: 'organizer',
      title: 'Plano Organizador',
      priceLine: 'A partir de R$ 99/mes',
      subtitle: 'Crie torneios com etapas, categorias e inscrições online.',
      highlights: [
        'Gestão de chaves e partidas',
        'Checkout de inscrição integrado',
        'Comunicação com atletas e staff',
      ],
      cta: 'Lancar meu torneio',
    },
  ];

  badgeLabel(profile: PlanProfile): string {
    switch (profile) {
      case 'athlete':
        return 'Atleta';
      case 'arena':
        return 'Arena';
      case 'organizer':
        return 'Organizador';
    }
  }

  onMouseMove(event: MouseEvent) {
    const card = event.currentTarget as HTMLElement;
    const rect = card.getBoundingClientRect();

    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;

    card.style.setProperty('--x', `${x}%`);
    card.style.setProperty('--y', `${y}%`);
  }

  protected async selectPlan(plan: PlanCard): Promise<void> {
    if (this.loadingPlan() !== null) {
      return;
    }
    this.loadingPlan.set(plan.profile);
    try {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      switch (plan.profile) {
        case 'athlete':
          await this.router.navigate(['/auth', 'register'], { queryParams: { plan: 'athlete' } });
          break;
        case 'organizer':
          await this.router.navigate(['/onboarding', 'organizer']);
          break;
        case 'arena':
          await this.router.navigate(['/sales']);
          break;
      }
    } finally {
      this.loadingPlan.set(null);
    }
  }
}

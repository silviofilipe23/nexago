import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { LEADS_OPTIONS, TIER_LABELS, TIER_PROFILES, dayMonth, plural } from './data/squad-model';
import { SquadStore } from './data/squad.store';
import type { ApplicationAnswers, CandidateView, LeadsGroup } from './data/squad-view';
import { avatarOf } from './squad-painel.component';
import { SquadTierComponent } from './ui/squad-tier.component';

/** Limites de `submitSquadApplication` (functions/src/squad-applications.ts): mudou lá, muda aqui. */
export const APPLICATION_LIMITS = { instagram: [2, 60], city: [2, 80], why: [10, 1000] } as const;

type Field = 'instagram' | 'city' | 'leadsGroup' | 'why';

/** Mesmas regras do servidor, para o erro aparecer no campo antes de enviar. */
export function applicationErrors(a: { instagram: string; city: string; leadsGroup: LeadsGroup | null; why: string }): Field[] {
  const len = (s: string) => s.trim().length;
  const out: Field[] = [];
  const ig = a.instagram.trim().replace(/^@/, '');
  if (ig && (ig.length < APPLICATION_LIMITS.instagram[0] || ig.length > APPLICATION_LIMITS.instagram[1])) out.push('instagram');
  if (len(a.city) < APPLICATION_LIMITS.city[0] || len(a.city) > APPLICATION_LIMITS.city[1]) out.push('city');
  if (!a.leadsGroup) out.push('leadsGroup');
  if (len(a.why) < APPLICATION_LIMITS.why[0] || len(a.why) > APPLICATION_LIMITS.why[1]) out.push('why');
  return out;
}

/** 04 · Entrar no Squad: quem ainda não é embaixador vê o programa e se candidata. */
@Component({
  selector: 'app-squad-entrar',
  imports: [SquadTierComponent],
  templateUrl: './squad-entrar.component.html',
  styleUrl: './squad-entrar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SquadEntrarComponent {
  private readonly store = inject(SquadStore);

  readonly view = input.required<CandidateView>();

  protected readonly tierProfiles = TIER_PROFILES;
  protected readonly leadsOptions = LEADS_OPTIONS;
  protected readonly tierLabels = TIER_LABELS;
  protected readonly whyMax = APPLICATION_LIMITS.why[1];

  protected readonly steps = computed(() => [
    { n: '01', title: 'Você divulga', sub: 'Código, link ou QR pessoal' },
    {
      n: '02',
      title: 'Seu amigo ganha',
      sub: this.view().followerDiscountPct > 0 ? `Até ${this.view().followerDiscountPct}% OFF na 1ª inscrição` : 'Inscrição pelo seu link',
    },
    { n: '03', title: 'Você recebe', sub: 'Comissão após o pagamento' },
  ]);

  protected readonly profileLine = computed(() => {
    const p = this.view().profile;
    if (!p) return '';
    return [
      p.tournaments !== null ? plural(p.tournaments, 'torneio', 'torneios') : null,
      p.elo,
      p.arenaName,
    ]
      .filter(Boolean)
      .join(' · ');
  });
  protected readonly avatar = computed(() => avatarOf(this.view().profile?.name ?? 'Atleta'));

  /** O que o atleta já mandou (ou recebeu); `form` = pode se candidatar. */
  protected readonly stage = computed<'invite' | 'review' | 'invited' | 'waitlist' | 'form'>(() => {
    const v = this.view();
    if (v.invite) return 'invite';
    const s = v.application?.status;
    if (s === 'review' || s === 'invited' || s === 'waitlist') return s;
    return 'form';
  });
  protected readonly rejected = computed(() => this.view().application?.status === 'rejected');
  protected readonly submittedLabel = computed(() => dayMonth(this.view().application?.submittedAt ?? null));
  protected readonly nextCycleLabel = computed(() => dayMonth(this.view().nextCycleStart));
  protected readonly inviteExpires = computed(() => {
    const at = this.view().invite?.expiresAt;
    return at ? dayMonth(at) : null;
  });
  protected readonly seatsFull = computed(() => this.view().seatsLeft <= 0);
  protected readonly cycleName = computed(() => (this.view().cycle.id === 'piloto' ? 'do piloto' : 'do ciclo'));

  protected readonly instagram = signal('');
  protected readonly city = signal('');
  protected readonly leadsGroup = signal<LeadsGroup | null>(null);
  protected readonly why = signal('');
  protected readonly touched = signal(false);
  protected readonly sending = signal(false);
  protected readonly sendError = signal<string | null>(null);

  protected readonly errors = computed(() =>
    applicationErrors({ instagram: this.instagram(), city: this.city(), leadsGroup: this.leadsGroup(), why: this.why() }),
  );
  protected readonly showErrors = computed(() => (this.touched() ? this.errors() : []));

  constructor() {
    // Cidade do perfil já vem preenchida ("Goiânia, GO"); o atleta corrige se quiser.
    let prefilled = false;
    effect(() => {
      const p = this.view().profile;
      untracked(() => {
        if (prefilled) return;
        prefilled = true;
        if (p?.city && !this.city()) this.city.set([p.city, p.state].filter(Boolean).join(', '));
      });
    });
  }

  protected onInput(field: 'instagram' | 'city' | 'why', event: Event): void {
    const value = (event.target as HTMLInputElement | HTMLTextAreaElement).value;
    if (field === 'instagram') this.instagram.set(value);
    else if (field === 'city') this.city.set(value);
    else this.why.set(value);
  }

  protected pickLeads(value: LeadsGroup): void {
    this.leadsGroup.set(value);
  }

  protected hasError(field: Field): boolean {
    return this.showErrors().includes(field);
  }

  protected async submit(): Promise<void> {
    this.touched.set(true);
    if (this.errors().length > 0 || this.sending()) return;
    const ig = this.instagram().trim().replace(/^@/, '');
    const answers: ApplicationAnswers = {
      instagram: ig || null,
      city: this.city().trim(),
      leadsGroup: this.leadsGroup()!,
      why: this.why().trim(),
    };
    this.sending.set(true);
    this.sendError.set(null);
    try {
      await this.store.submitApplication(answers);
    } catch (e) {
      this.sendError.set(e instanceof Error ? e.message : 'Não foi possível enviar a candidatura agora.');
    } finally {
      this.sending.set(false);
    }
  }
}

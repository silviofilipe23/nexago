import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal, untracked } from '@angular/core';
import { AmbassadorAvatarComponent } from '../../comissoes/ui/ambassador-avatar.component';
import { stamp } from '../../comissoes/data/commission';
import { TierPillComponent } from '../../niveis-regras/ui/tier-pill.component';
import { SQUAD_TIERS, TIER_LABELS, type SquadTier } from '../../niveis-regras/data/squad-rules';
import { REJECTION_MESSAGE } from '../../data/squad-program';
import {
  ARCHIVED_LABELS,
  COLUMN_LABELS,
  LEADS_LABELS,
  SOURCE_LABELS,
  compactCount,
  type Application,
  type Invite,
} from '../data/application';

export type DrawerAction =
  | { kind: 'review' | 'restore' | 'invite' | 'resend' | 'cancel' }
  | { kind: 'reject'; reason: string }
  | { kind: 'waitlist'; reason: string | null }
  | { kind: 'note'; text: string }
  | { kind: 'social'; followers: number; engagementPct: number | null }
  | { kind: 'suggest'; tier: SquadTier | 'auto' };

type Mode = 'view' | 'reject' | 'waitlist';

/** Drawer da candidatura: dados do NexaGO, formulário, redes, notas internas e as ações da coluna. */
@Component({
  selector: 'bo-application-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AmbassadorAvatarComponent, TierPillComponent],
  host: { '(document:keydown.escape)': 'closed.emit()' },
  template: `
    @let a = app();
    <div class="backdrop" (click)="closed.emit()"></div>
    <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="application-title">
      <header>
        <bo-ambassador-avatar [id]="a.athleteId || a.id" [name]="a.name" [size]="44" />
        <div class="who">
          <h2 id="application-title">{{ a.name }}</h2>
          <span class="meta">
            {{ a.answers?.instagram ? '@' + a.answers?.instagram + ' · ' : '' }}{{ place() }}
          </span>
        </div>
        <button type="button" class="x" aria-label="Fechar" (click)="closed.emit()">✕</button>
      </header>

      <div class="stage-line">
        <span class="stage">{{ stageLabel() }}</span>
        <span class="dim">{{ sourceLabel() }}{{ a.submittedAt ? ' · ' + stamp(a.submittedAt) : '' }}</span>
      </div>

      <section class="sug">
        <span class="lbl">Sugestão</span>
        <bo-tier-pill [tier]="a.suggestedTier" size="sm" />
        @if (canEdit() && a.stage !== 'archived') {
          <select class="bo-input small" aria-label="Trocar sugestão" [disabled]="busy()" (change)="suggest($event)">
            <option value="" selected disabled>Trocar…</option>
            <option value="auto">Automática{{ a.suggestedAuto ? ' (atual)' : '' }}</option>
            @for (t of tiers; track t) {
              <option [value]="t">{{ tierLabels[t] }}</option>
            }
          </select>
        }
        <span class="dim">{{ a.suggestedAuto ? 'automática' : 'escolhida pelo time' }}</span>
      </section>

      <section>
        <h3>Dados NexaGO</h3>
        <dl>
          <dt>Torneios</dt><dd>{{ a.snapshot.tournaments ?? '—' }}</dd>
          <dt>Elo</dt><dd>{{ a.snapshot.elo ?? '—' }}</dd>
          <dt>Ranking</dt><dd>{{ a.snapshot.rankingPosition === null ? '—' : '#' + a.snapshot.rankingPosition + ' geral' }}</dd>
          <dt>Arena principal</dt><dd>{{ a.snapshot.arenaName ?? '—' }}</dd>
          <dt>Atletas indicados</dt><dd>{{ a.snapshot.referredCount ?? '—' }}</dd>
          <dt>Conduta</dt><dd>{{ a.snapshot.conductIncidents === null ? '—' : a.snapshot.conductIncidents + ' ocorrências' }}</dd>
          <dt>Membro desde</dt><dd>{{ memberSince() }}</dd>
        </dl>
      </section>

      <section>
        <h3>Formulário</h3>
        @if (a.answers; as f) {
          <dl>
            <dt>Instagram</dt><dd>{{ f.instagram ? '@' + f.instagram : '—' }}</dd>
            <dt>Cidade</dt><dd>{{ f.city || '—' }}</dd>
            <dt>Lidera turma?</dt><dd>{{ f.leadsGroup ? leadsLabels[f.leadsGroup] : '—' }}</dd>
          </dl>
          <p class="why">{{ f.why || '—' }}</p>
        } @else {
          <p class="dim">Convite direto: sem formulário.</p>
        }
      </section>

      <section>
        <h3>Redes</h3>
        @if (a.social; as s) {
          <p class="dim">{{ compact(s.followers) }} seguidores · engajamento {{ s.engagementPct === null ? '—' : s.engagementPct + '%' }}
            · checado {{ stamp(s.checkedAt) }}{{ s.checkedBy ? ' por ' + s.checkedBy : '' }}</p>
        } @else {
          <p class="dim">Ainda não checado.</p>
        }
        @if (canEdit() && a.stage !== 'archived') {
          <div class="inline">
            <label><span>Seguidores</span><input class="bo-input mono" type="number" min="0" [value]="followers() ?? ''" (input)="followers.set(num($event))" /></label>
            <label><span>Engaj. %</span><input class="bo-input mono" type="number" min="0" max="100" step="0.1" [value]="engagement() ?? ''" (input)="engagement.set(num($event))" /></label>
            <button type="button" class="bo-mini-btn" [disabled]="busy() || followers() === null" (click)="saveSocial()">Salvar</button>
          </div>
        }
      </section>

      <section>
        <h3>Notas internas</h3>
        <ol class="notes">
          @for (n of a.notes; track $index) {
            <li><p>{{ n.text }}</p><span>{{ n.by }} · {{ stamp(n.at) }}</span></li>
          } @empty {
            <li class="dim">Nenhuma nota.</li>
          }
        </ol>
        @if (canEdit()) {
          <div class="add-note">
            <textarea class="bo-input" rows="2" maxlength="1000" placeholder="Comentário para o time" [value]="note()" (input)="note.set(text($event))"></textarea>
            <button type="button" class="bo-mini-btn" [disabled]="busy() || note().trim().length === 0" (click)="addNote()">Adicionar</button>
          </div>
        }
      </section>

      @if (a.stage === 'archived') {
        <section class="archived">
          <h3>Arquivada</h3>
          <p>{{ archivedLabel() }}{{ a.internalReason ? ': ' + a.internalReason : '' }}</p>
        </section>
      }

      @if (error(); as e) {
        <div class="bo-alert" role="alert"><span>{{ e }}</span></div>
      }

      @if (canEdit()) {
        <section class="actions">
          @switch (mode()) {
            @case ('reject') {
              <label class="field">
                <span>Motivo interno (nunca vai para o atleta)</span>
                <textarea class="bo-input" rows="3" maxlength="280" [value]="reason()" (input)="reason.set(text($event))"></textarea>
              </label>
              <p class="dim">O atleta recebe: "{{ rejection }}"</p>
              <div class="row">
                <button type="button" class="bo-mini-btn" [disabled]="busy()" (click)="mode.set('view')">Voltar</button>
                <button type="button" class="bo-mini-btn danger" [disabled]="busy() || reason().trim().length < 3" (click)="emit({ kind: 'reject', reason: reason().trim() })">Recusar</button>
              </div>
            }
            @case ('waitlist') {
              <label class="field">
                <span>Motivo interno (opcional)</span>
                <textarea class="bo-input" rows="2" maxlength="280" [value]="reason()" (input)="reason.set(text($event))"></textarea>
              </label>
              <div class="row">
                <button type="button" class="bo-mini-btn" [disabled]="busy()" (click)="mode.set('view')">Voltar</button>
                <button type="button" class="bo-mini-btn bo-mini-btn-primary"
                  [disabled]="busy() || (reason().trim().length > 0 && reason().trim().length < 3)"
                  (click)="emit({ kind: 'waitlist', reason: reason().trim() || null })">Mover para lista de espera</button>
              </div>
            }
            @default {
              <div class="row">
                @switch (a.stage) {
                  @case ('new') {
                    <button type="button" class="bo-mini-btn bo-mini-btn-primary" [disabled]="busy()" (click)="emit({ kind: 'review' })">Analisar</button>
                    <button type="button" class="bo-mini-btn danger" [disabled]="busy()" (click)="start('reject')">Recusar</button>
                  }
                  @case ('review') {
                    <button type="button" class="bo-mini-btn bo-mini-btn-primary" [disabled]="busy()" (click)="emit({ kind: 'invite' })">Convidar</button>
                    <button type="button" class="bo-mini-btn" [disabled]="busy()" (click)="start('waitlist')">Lista de espera</button>
                    <button type="button" class="bo-mini-btn danger" [disabled]="busy()" (click)="start('reject')">Recusar</button>
                  }
                  @case ('invited') {
                    @if (invite()?.status === 'scheduled') {
                      <span class="dim">Agendado para o próximo ciclo.</span>
                    } @else {
                      <button type="button" class="bo-mini-btn bo-mini-btn-primary" [disabled]="busy() || !invite()" (click)="emit({ kind: 'resend' })">Reenviar convite</button>
                    }
                    <button type="button" class="bo-mini-btn danger" [disabled]="busy() || !invite()" (click)="emit({ kind: 'cancel' })">Cancelar convite</button>
                  }
                  @case ('contract') {
                    <button type="button" class="bo-mini-btn bo-mini-btn-primary" [disabled]="busy() || !invite()" (click)="emit({ kind: 'resend' })">Reenviar lembrete</button>
                    <button type="button" class="bo-mini-btn danger" [disabled]="busy() || !invite()" (click)="emit({ kind: 'cancel' })">Cancelar</button>
                  }
                  @case ('archived') {
                    @if (a.archivedReason === 'waitlist' || a.archivedReason === 'rejected') {
                      <button type="button" class="bo-mini-btn" [disabled]="busy()" (click)="emit({ kind: 'restore' })">Voltar para análise</button>
                    }
                    @if (a.archivedReason === 'waitlist' || a.archivedReason === 'canceled') {
                      <button type="button" class="bo-mini-btn bo-mini-btn-primary" [disabled]="busy()" (click)="emit({ kind: 'invite' })">Convidar</button>
                    }
                    @if (a.archivedReason === 'expired') {
                      <button type="button" class="bo-mini-btn bo-mini-btn-primary" [disabled]="busy() || !invite()" (click)="emit({ kind: 'resend' })">Reenviar convite</button>
                    }
                  }
                }
              </div>
            }
          }
        </section>
      }
    </aside>
  `,
  styles: `
    .backdrop { position: fixed; inset: 0; z-index: 40; background: rgba(0, 0, 0, 0.5); }
    .drawer { position: fixed; z-index: 41; top: 0; right: 0; bottom: 0; width: min(480px, 100%); display: flex; flex-direction: column; gap: 18px; padding: 22px; overflow-y: auto; background: var(--nx-surface-0); border-left: 1px solid var(--nx-line-strong); box-shadow: -24px 0 48px rgba(0, 0, 0, 0.45); }
    header { display: flex; align-items: center; gap: 12px; }
    .who { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
    h2 { margin: 0; font-family: var(--nx-font-display); font-weight: 700; font-size: 18px; }
    .meta { font-size: 12.5px; color: var(--nx-text-dim); }
    .x { width: 32px; height: 32px; border: none; border-radius: var(--nx-r-2); background: transparent; color: var(--nx-text-mute); cursor: pointer; }
    .x:hover { background: var(--nx-surface-1); color: var(--nx-text); }
    .stage-line { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .stage { font-family: var(--nx-font-mono); font-size: 10px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; padding: 4px 10px; border-radius: var(--nx-r-pill); border: 1px solid var(--nx-line-strong); }
    .sug { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .lbl, .dim { font-size: 12.5px; color: var(--nx-text-dim); }
    .bo-input.small { height: 30px; width: auto; padding: 0 8px; font-size: 12.5px; }
    h3 { margin: 0 0 10px; font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: var(--nx-text-dim); }
    dl { margin: 0; display: grid; grid-template-columns: 140px minmax(0, 1fr); gap: 8px 12px; font-size: 13px; }
    dt { color: var(--nx-text-dim); }
    dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
    .why { margin: 10px 0 0; padding: 10px 12px; border-radius: var(--nx-r-2); background: var(--nx-surface-1); font-size: 13px; line-height: 1.45; white-space: pre-wrap; }
    p { margin: 0; }
    .inline { display: flex; align-items: flex-end; gap: 8px; margin-top: 10px; }
    .inline label { display: flex; flex-direction: column; gap: 4px; flex: 1; font-size: 11.5px; color: var(--nx-text-dim); }
    .mono { font-family: var(--nx-font-mono); }
    .notes { margin: 0 0 10px; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 10px; }
    .notes li { display: flex; flex-direction: column; gap: 3px; font-size: 13px; }
    .notes li span { font-size: 11.5px; color: var(--nx-text-dim); }
    .add-note { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
    .add-note textarea, .field textarea { width: 100%; height: auto; padding: 10px 12px; resize: vertical; }
    .archived p { font-size: 13px; color: var(--nx-text-mute); }
    .actions { padding-top: 16px; border-top: 1px solid var(--nx-line); display: flex; flex-direction: column; gap: 10px; }
    .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .field { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--nx-text-mute); }
    .bo-mini-btn.danger { color: var(--nx-live); border-color: rgba(255, 59, 48, 0.35); }
  `,
})
export class ApplicationDrawerComponent {
  readonly app = input.required<Application>();
  readonly invite = input<Invite | null>(null);
  readonly place = input.required<string>();
  readonly canEdit = input(false);
  readonly busy = input(false);
  readonly error = input<string | null>(null);

  readonly action = output<DrawerAction>();
  readonly closed = output<void>();

  protected readonly tiers = SQUAD_TIERS;
  protected readonly tierLabels = TIER_LABELS;
  protected readonly leadsLabels = LEADS_LABELS;
  protected readonly rejection = REJECTION_MESSAGE;
  protected readonly stamp = stamp;
  protected readonly compact = compactCount;

  protected readonly mode = signal<Mode>('view');
  protected readonly reason = signal('');
  protected readonly note = signal('');
  protected readonly followers = signal<number | null>(null);
  protected readonly engagement = signal<number | null>(null);

  protected readonly stageLabel = computed(() => {
    const a = this.app();
    return a.stage === 'archived' ? this.archivedLabel() : COLUMN_LABELS[a.stage];
  });
  protected readonly archivedLabel = computed(() => {
    const r = this.app().archivedReason;
    return r ? ARCHIVED_LABELS[r] : 'Arquivada';
  });
  protected readonly sourceLabel = computed(() => SOURCE_LABELS[this.app().source]);
  protected readonly memberSince = computed(() => {
    const d = this.app().snapshot.memberSince;
    return d ? d.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }).replace('.', '') : '—';
  });

  constructor() {
    // Outra candidatura (ou a mesma relida depois de uma ação): volta à visão e repõe as redes.
    effect(() => {
      const a = this.app();
      untracked(() => {
        this.mode.set('view');
        this.reason.set('');
        this.note.set('');
        this.followers.set(a.social?.followers ?? null);
        this.engagement.set(a.social?.engagementPct ?? null);
      });
    });
  }

  protected start(mode: Mode): void {
    this.reason.set('');
    this.mode.set(mode);
  }

  protected emit(a: DrawerAction): void {
    this.action.emit(a);
  }

  protected addNote(): void {
    this.emit({ kind: 'note', text: this.note().trim() });
  }

  protected saveSocial(): void {
    const f = this.followers();
    if (f === null) return;
    this.emit({ kind: 'social', followers: Math.round(f), engagementPct: this.engagement() });
  }

  protected suggest(event: Event): void {
    const el = event.target as HTMLSelectElement;
    const value = el.value as SquadTier | 'auto';
    el.value = '';
    this.emit({ kind: 'suggest', tier: value });
  }

  protected text(event: Event): string {
    return (event.target as HTMLTextAreaElement).value;
  }

  protected num(event: Event): number | null {
    const v = (event.target as HTMLInputElement).valueAsNumber;
    return Number.isFinite(v) ? v : null;
  }
}

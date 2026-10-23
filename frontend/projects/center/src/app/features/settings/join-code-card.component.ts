import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { writeErrorMessage } from '../../data/actions/actor';
import { callCenterFunction } from '../../data/actions/invoices.actions';
import type { TrainingCenter } from '../../domain/models';

/** "XK7Q2M" → "XK7-Q2M" (o aluno digita com ou sem hífen). */
export function displayJoinCode(code: string | null): string {
  if (!code) return '';
  const c = code.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  return c.length === 6 ? `${c.slice(0, 3)}-${c.slice(3)}` : c;
}

/**
 * Configurações › Dados › Código de entrada: o aluno digita no app NexaGO ("Tenho um código") e entra
 * no centro com a própria conta. Gerar de novo invalida o anterior; desligar fecha a entrada por código.
 * Quem gera é o servidor (`setTrainingCenterJoinCode`), que garante o código único.
 */
@Component({
  selector: 'ct-join-code-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="ct-card">
      <div class="ct-card-head">
        <div class="ct-grow">
          <div class="ct-kick">App NexaGO · alunos</div>
          <div class="ct-card-title">Código de entrada</div>
        </div>
        <span class="ct-pill" [class.green]="active()">{{ active() ? 'Ligado' : 'Desligado' }}</span>
      </div>
      @if (active()) {
        <div class="code">{{ code() }}</div>
        <div class="ct-muted">
          O aluno abre Treinos › Adicionar › “Tenho um código” no app e entra no centro com a própria conta. Depois
          é só matricular na turma.
        </div>
      } @else {
        <div class="ct-muted">
          Gere um código para o aluno entrar pelo app sem você precisar cadastrar o e-mail dele.
        </div>
      }
      @if (canEdit()) {
        <div class="actions">
          <button type="button" class="ct-mini-btn ct-mini-btn-primary" [disabled]="busy()" (click)="set(true)">
            {{ busy() ? 'Gerando…' : active() ? 'Gerar novo código' : 'Gerar código' }}
          </button>
          @if (active()) {
            <button type="button" class="ct-ghost-btn" [disabled]="busy()" (click)="set(false)">Desligar</button>
          }
        </div>
        @if (active()) {
          <div class="ct-dim">Gerar um novo invalida o atual — quem já entrou continua aluno.</div>
        }
      }
      @if (error()) {
        <p class="ct-error-text" role="alert">{{ error() }}</p>
      }
    </section>
  `,
  styles: `
    .code { font-family: var(--nx-mono, 'JetBrains Mono', monospace); font-size: 28px; font-weight: 700; letter-spacing: 0.16em; margin: 6px 0 8px; }
    .actions { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
  `,
})
export class JoinCodeCardComponent {
  readonly center = input.required<TrainingCenter>();
  readonly canEdit = input(false);

  protected readonly busy = signal(false);
  protected readonly error = signal('');
  /** Resposta da última ação (o snapshot do centro chega logo depois). */
  private readonly local = signal<{ code: string | null; enabled: boolean } | null>(null);

  protected readonly active = computed(() => {
    const l = this.local();
    return l ? l.enabled && !!l.code : this.center().joinCodeEnabled && !!this.center().joinCode;
  });
  protected readonly code = computed(() => displayJoinCode(this.local()?.code ?? this.center().joinCode));

  protected async set(enabled: boolean): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      const r = await callCenterFunction<{ code: string | null; enabled: boolean }>('setTrainingCenterJoinCode', {
        centerId: this.center().id,
        enabled,
      });
      this.local.set(r);
    } catch (e) {
      this.error.set(writeErrorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}

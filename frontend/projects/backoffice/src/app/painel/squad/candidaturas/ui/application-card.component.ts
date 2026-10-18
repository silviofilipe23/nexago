import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { AmbassadorAvatarComponent } from '../../comissoes/ui/ambassador-avatar.component';
import { TierPillComponent } from '../../niveis-regras/ui/tier-pill.component';
import { highlight, type Application, type Fact } from '../data/application';

/** Card do kanban: avatar, nome, cidade · arena, 2 mini-fatos, nota e a sugestão de nível. */
@Component({
  selector: 'bo-application-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AmbassadorAvatarComponent, TierPillComponent],
  host: {
    role: 'button',
    tabindex: '0',
    '[class.hot]': 'hot()',
    '[class.dragging]': 'dragging()',
    '[attr.draggable]': 'draggable()',
    '[attr.aria-label]': "'Abrir candidatura de ' + app().name",
    '(click)': 'opened.emit()',
    '(keydown.enter)': 'opened.emit()',
  },
  template: `
    <div class="top">
      <bo-ambassador-avatar [id]="app().athleteId || app().id" [name]="app().name" [size]="44" />
      <div class="who">
        <strong>
          @for (part of nameParts(); track $index) {
            @if (part.hit) { <mark>{{ part.text }}</mark> } @else { {{ part.text }} }
          }
        </strong>
        <span>
          @for (part of placeParts(); track $index) {
            @if (part.hit) { <mark>{{ part.text }}</mark> } @else { {{ part.text }} }
          }
        </span>
      </div>
    </div>
    <div class="facts">
      @for (f of facts(); track f.label) {
        <div class="fact"><span>{{ f.label }}</span><strong>{{ f.value }}</strong></div>
      }
    </div>
    @if (note(); as n) {
      <p class="note">{{ n }}</p>
    }
    <div class="sug">
      <span>Sugestão</span>
      <bo-tier-pill [tier]="app().suggestedTier" size="sm" />
    </div>
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 14px; padding: 18px; border-radius: var(--nx-r-4); border: 1px solid var(--nx-line); background: var(--nx-surface-0); cursor: pointer; transition: border-color 140ms var(--nx-ease-out); }
    :host(:hover) { border-color: var(--nx-line-strong); }
    :host(:focus-visible) { outline: 2px solid var(--nx-orange-500); outline-offset: 2px; }
    :host(.hot) { border-color: rgba(255, 106, 26, 0.6); background: linear-gradient(180deg, rgba(255, 106, 26, 0.06), transparent 60%), var(--nx-surface-0); }
    :host(.dragging) { opacity: 0.45; }
    .top { display: flex; align-items: center; gap: 14px; min-width: 0; }
    .who { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .who strong { font-family: var(--nx-font-display); font-weight: 700; font-size: 16px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .who span { font-size: 13px; color: var(--nx-text-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    mark { background: rgba(255, 106, 26, 0.3); color: inherit; border-radius: 3px; }
    .facts { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .fact { display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; border-radius: var(--nx-r-2); background: var(--nx-surface-1); min-width: 0; }
    .fact span { font-family: var(--nx-font-mono); font-size: 9px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: var(--nx-text-dim); }
    .fact strong { font-family: var(--nx-font-mono); font-size: 14px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .note { margin: 0; font-size: 13.5px; line-height: 1.45; color: var(--nx-text-mute); }
    .sug { display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--nx-text-dim); }
  `,
})
export class ApplicationCardComponent {
  readonly app = input.required<Application>();
  readonly facts = input.required<Fact[]>();
  readonly note = input<string | null>(null);
  readonly place = input.required<string>();
  readonly hot = input(false);
  readonly term = input('');
  readonly draggable = input(false);
  readonly dragging = input(false);
  readonly opened = output<void>();

  protected readonly nameParts = computed(() => highlight(this.app().name, this.term()));
  protected readonly placeParts = computed(() => highlight(this.place(), this.term()));
}

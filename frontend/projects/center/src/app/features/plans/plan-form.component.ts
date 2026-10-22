import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit, output, signal } from '@angular/core';
import { CatalogActions } from '../../data/actions/catalog.actions';
import { writeErrorMessage } from '../../data/actions/actor';
import { CenterStore } from '../../data/center-store.service';
import { parseBRL } from '../../domain/money';
import type { Plan, PlanType } from '../../domain/models';
import { ModalComponent, ToggleComponent } from '../../ui/kit';
import { planDraftError, type PlanDraft } from './plan-view';

/** Criar/editar plano. O preço só entra na criação; depois, mudar preço é o fluxo W20. */
@Component({
  selector: 'ct-plan-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent, ToggleComponent],
  template: `
    <ct-modal [kicker]="type() === 'class_pack' ? 'Pacote' : 'Plano mensal'" [title]="plan() ? 'Editar ' + plan()!.name : type() === 'class_pack' ? 'Novo pacote' : 'Novo plano mensal'" [width]="560" (closed)="closed.emit()">
      <div class="ct-field">
        <label for="pf-name">Nome</label>
        <input id="pf-name" class="ct-input" [value]="name()" (input)="name.set(val($event))" [placeholder]="type() === 'class_pack' ? 'Pacote 8 aulas' : 'Mensal 2x/semana'" />
      </div>
      <div class="ct-form-grid">
        @if (!plan()) {
          <div class="ct-field">
            <label for="pf-price">Preço (R$){{ type() === 'class_pack' ? ' total' : ' por mês' }}</label>
            <input id="pf-price" class="ct-input mono" inputmode="decimal" [value]="price()" (input)="price.set(val($event))" placeholder="320,00" />
          </div>
        }
        @if (type() === 'monthly') {
          <div class="ct-field">
            <label for="pf-cpw">Aulas por semana</label>
            <input id="pf-cpw" class="ct-input mono" type="number" min="1" max="7" [value]="classesPerWeek()" (input)="classesPerWeek.set(num($event))" />
          </div>
          <div class="ct-field">
            <label for="pf-mk">Reposições por mês</label>
            <input id="pf-mk" class="ct-input mono" type="number" min="0" [value]="makeupsPerMonth()" (input)="makeupsPerMonth.set(num($event))" />
          </div>
        } @else {
          <div class="ct-field">
            <label for="pf-cr">Créditos</label>
            <input id="pf-cr" class="ct-input mono" type="number" min="1" [value]="credits()" (input)="credits.set(num($event))" />
          </div>
          <div class="ct-field">
            <label for="pf-val">Validade (dias)</label>
            <input id="pf-val" class="ct-input mono" type="number" min="1" [value]="validityDays()" (input)="validityDays.set(num($event))" />
          </div>
        }
      </div>
      @if (plan()) {
        <div class="ct-dim">Para mudar o preço use “Alterar preço” — os contratos ativos mantêm o valor contratado.</div>
      }
      <div class="ct-field">
        <span class="ct-label">Modalidades</span>
        <div class="ct-row ct-wrap" style="gap: 8px">
          @for (p of store.programs(); track p.id) {
            <button type="button" class="ct-chip" [class.active]="programIds().includes(p.id)" (click)="toggleProgram(p.id)">
              <span class="dot" [style.background]="p.color"></span>{{ p.name }}
            </button>
          } @empty {
            <span class="ct-dim">Nenhuma modalidade cadastrada.</span>
          }
        </div>
        <span class="ct-dim">Nenhuma marcada = vale para todas as modalidades.</span>
      </div>
      <div class="ct-row">
        <ct-toggle [(on)]="featured" label="Destacar como mais vendido" />
        <span class="ct-muted">Destacar como “Mais vendido”</span>
      </div>
      @if (error()) {
        <div class="ct-error-text">{{ error() }}</div>
      }
      <div footer class="ct-row">
        <button type="button" class="ct-ghost-btn" [disabled]="busy()" (click)="closed.emit()">Cancelar</button>
        <button type="button" class="ct-mini-btn ct-mini-btn-primary" [disabled]="busy() || !!invalid()" [attr.title]="invalid()" (click)="save()">
          {{ busy() ? 'Salvando…' : plan() ? 'Salvar' : 'Criar plano' }}
        </button>
      </div>
    </ct-modal>
  `,
})
export class PlanFormComponent implements OnInit {
  readonly type = input.required<PlanType>();
  readonly plan = input<Plan | null>(null);
  readonly closed = output<void>();

  protected readonly store = inject(CenterStore);
  private readonly catalog = inject(CatalogActions);

  protected readonly name = signal('');
  protected readonly price = signal('');
  protected readonly classesPerWeek = signal(2);
  protected readonly makeupsPerMonth = signal(1);
  protected readonly credits = signal(8);
  protected readonly validityDays = signal(60);
  protected readonly programIds = signal<string[]>([]);
  protected readonly featured = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  private readonly draft = computed<PlanDraft>(() => ({
    name: this.name(),
    type: this.type(),
    priceCents: parseBRL(this.price()),
    classesPerWeek: this.classesPerWeek(),
    makeupsPerMonth: this.makeupsPerMonth(),
    credits: this.credits(),
    validityDays: this.validityDays(),
  }));
  protected readonly invalid = computed(() => planDraftError(this.draft(), !this.plan()));

  ngOnInit(): void {
    const p = this.plan();
    if (p) {
      this.name.set(p.name);
      this.classesPerWeek.set(p.classesPerWeek ?? 2);
      this.makeupsPerMonth.set(p.makeupsPerMonth ?? 0);
      this.credits.set(p.credits ?? 8);
      this.validityDays.set(p.validityDays ?? 60);
      this.programIds.set([...p.programIds]);
      this.featured.set(p.featured);
    }
  }

  toggleProgram(id: string): void {
    this.programIds.update((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  val(ev: Event): string {
    return (ev.target as HTMLInputElement).value;
  }

  num(ev: Event): number {
    return Number((ev.target as HTMLInputElement).value);
  }

  async save(): Promise<void> {
    if (this.invalid() || this.busy()) {
      return;
    }
    const d = this.draft();
    const monthly = d.type === 'monthly';
    // Campos do outro tipo vão como null pra não deixar regra fantasma no doc.
    const input = {
      name: d.name,
      type: d.type,
      classesPerWeek: monthly ? d.classesPerWeek : null,
      makeupsPerMonth: monthly ? d.makeupsPerMonth : null,
      credits: monthly ? null : d.credits,
      validityDays: monthly ? null : d.validityDays,
      programIds: this.programIds(),
      featured: this.featured(),
    };
    this.busy.set(true);
    this.error.set('');
    try {
      const p = this.plan();
      if (p) {
        await this.catalog.updatePlan(p, input);
      } else {
        await this.catalog.createPlan({ ...input, priceCents: d.priceCents! });
      }
      this.closed.emit();
    } catch (err) {
      this.error.set(writeErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }
}

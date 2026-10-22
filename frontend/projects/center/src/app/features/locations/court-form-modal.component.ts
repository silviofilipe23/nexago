import { ChangeDetectionStrategy, Component, inject, input, OnInit, output, signal } from '@angular/core';
import { writeErrorMessage } from '../../data/actions/actor';
import { CatalogActions } from '../../data/actions/catalog.actions';
import { CenterStore } from '../../data/center-store.service';
import { isValidDayKey } from '../../domain/dates';
import type { CenterLocation, Court } from '../../domain/models';
import { ModalComponent } from '../../ui/kit';

/** Quadra de um local próprio (criar/editar). */
@Component({
  selector: 'ct-court-form-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent],
  template: `
    <ct-modal [kicker]="location().name" [title]="court() ? 'Editar quadra' : 'Nova quadra'" [width]="500" (closed)="closed.emit()">
      <div class="ct-field"><label for="cf-name">Nome</label><input id="cf-name" class="ct-input" placeholder="Ex.: Quadra 1" [value]="name()" (input)="name.set(value($event))" /></div>
      <div class="ct-field"><label for="cf-desc">Descrição</label><input id="cf-desc" class="ct-input" placeholder="Ex.: Areia · coberta" [value]="desc()" (input)="desc.set(value($event))" /></div>
      <div class="ct-form-grid">
        <button type="button" class="ct-option" [class.on]="status() === 'active'" (click)="status.set('active')"><strong>Ativa</strong><span>Disponível para turmas</span></button>
        <button type="button" class="ct-option" [class.on]="status() === 'maintenance'" (click)="status.set('maintenance')"><strong>Em manutenção</strong><span>Some das sugestões de horário</span></button>
      </div>
      @if (status() === 'maintenance') {
        <div class="ct-field"><label for="cf-until">Manutenção até</label><input id="cf-until" class="ct-input mono" type="date" [value]="until()" (input)="until.set(value($event))" /></div>
      }
      @if (error()) {
        <div class="ct-error-text" role="alert">{{ error() }}</div>
      }
      <div footer>
        <button type="button" class="ct-mini-btn" (click)="closed.emit()">Cancelar</button>
        <button type="button" class="ct-mini-btn ct-mini-btn-primary" [disabled]="busy()" (click)="save()">{{ busy() ? 'Salvando…' : 'Salvar' }}</button>
      </div>
    </ct-modal>
  `,
})
export class CourtFormModalComponent implements OnInit {
  private readonly actions = inject(CatalogActions);
  private readonly store = inject(CenterStore);

  readonly location = input.required<CenterLocation>();
  /** null = quadra nova. */
  readonly court = input<Court | null>(null);
  readonly closed = output<void>();

  protected readonly name = signal('');
  protected readonly desc = signal('');
  protected readonly status = signal<'active' | 'maintenance'>('active');
  protected readonly until = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  ngOnInit(): void {
    const c = this.court();
    this.name.set(c?.name ?? '');
    this.desc.set(c?.description ?? '');
    this.status.set(c?.status ?? 'active');
    this.until.set(c?.maintenanceUntil ?? '');
  }

  protected value(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  protected async save(): Promise<void> {
    if (this.busy()) return;
    const current = this.court();
    const loc = this.location();
    const name = this.name().trim();
    const maintenance = this.status() === 'maintenance';
    if (name.length < 2) return this.error.set('Informe o nome da quadra.');
    // Nome único dentro do local: "Quadra 1" pode existir em duas sedes.
    if (this.store.courts().some((c) => c.locationId === loc.id && c.name.toLowerCase() === name.toLowerCase() && c.id !== current?.id)) {
      return this.error.set('Já existe uma quadra com esse nome neste local.');
    }
    if (maintenance && this.until() && !isValidDayKey(this.until())) return this.error.set('Data de fim da manutenção inválida.');
    this.busy.set(true);
    this.error.set('');
    try {
      await this.actions.saveCourt(current?.id ?? null, {
        name,
        description: this.desc(),
        status: this.status(),
        maintenanceUntil: maintenance && this.until() ? this.until() : null,
        locationId: loc.id,
      });
      this.closed.emit();
    } catch (err) {
      this.error.set(writeErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }
}

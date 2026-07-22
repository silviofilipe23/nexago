import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { arenaFunctions } from '../data/functions';
import { fetchCourtsList } from '../courts/courts-repository';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { formatReais, WEEKDAY_LABELS } from './club.model';
import { fetchClub, upsertClub } from './clubs-repository';

interface CourtOption {
  id: string;
  name: string;
}

function parseNumber(raw: string): number {
  return Number(raw.replace(',', '.')) || 0;
}

/** Criar/editar clubinho. Edição só vale para sessões futuras ainda não geradas — cada
 *  sessão guarda snapshot de preço/vagas/prazo (mesma semântica do mensalista). */
@Component({
  selector: 'ar-panel-club-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, IconComponent],
  template: `
    <ar-panel-shell>
      <ar-page-header [title]="isEdit() ? 'Editar clubinho' : 'Novo clubinho'" subtitle="Jogo aberto com lista pública e PIX antecipado">
        <button type="button" class="ar-mini-btn" (click)="goBack()">Cancelar</button>
        <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="!canSave() || saving()" (click)="save()">
          <ar-icon name="check" [size]="14" />
          {{ saving() ? 'Salvando…' : isEdit() ? 'Salvar alterações' : 'Criar clubinho' }}
        </button>
      </ar-page-header>

      <div class="body">
        <div class="col-left">
          @if (errorMessage(); as err) {
            <div class="error-banner">{{ err }}</div>
          }
          @if (isEdit()) {
            <div class="edit-warning">
              As alterações valem para as próximas sessões geradas. Sessões já criadas mantêm
              preço, vagas e horário de quando a lista abriu — cancele e recrie se precisar mudar.
            </div>
          }

          <ar-panel-card title="Identificação">
            <div class="field-label">Nome do clubinho</div>
            <input
              type="text"
              class="input-box"
              placeholder="Ex.: Clubinho de sexta"
              [value]="name()"
              (input)="name.set($any($event.target).value)"
            />
            <div class="field-label spaced">Descrição (opcional)</div>
            <input
              type="text"
              class="input-box"
              placeholder="Ex.: Jogo aberto nível intermediário, chegue 10min antes"
              [value]="description()"
              (input)="description.set($any($event.target).value)"
            />
          </ar-panel-card>

          <ar-panel-card title="Recorrência e horário">
            <div class="type-toggle">
              <button type="button" class="type-btn" [class.active]="isWeekly()" (click)="isWeekly.set(true)">Toda semana</button>
              <button type="button" class="type-btn" [class.active]="!isWeekly()" (click)="isWeekly.set(false)">Só sessões avulsas</button>
            </div>

            @if (isWeekly()) {
              <div class="field-label">Dia da semana</div>
              <div class="weekday-row">
                @for (day of weekdayOptions; track day.value) {
                  <button
                    type="button"
                    class="ar-chip"
                    [class.active]="weekday() === day.value"
                    (click)="weekday.set(day.value)"
                  >
                    {{ day.label }}
                  </button>
                }
              </div>
            }

            <div class="row-2">
              <div>
                <div class="field-label spaced">Início</div>
                <input type="time" class="input-box" [value]="startTime()" (input)="startTime.set($any($event.target).value)" />
              </div>
              <div>
                <div class="field-label spaced">Fim</div>
                <input type="time" class="input-box" [value]="endTime()" (input)="endTime.set($any($event.target).value)" />
              </div>
            </div>
            <p class="hint">O horário bloqueia as quadras selecionadas para reserva avulsa.</p>
          </ar-panel-card>

          <ar-panel-card title="Quadras">
            @if (courts().length === 0) {
              <p class="hint">Nenhuma quadra cadastrada ainda — cadastre em Quadras primeiro.</p>
            } @else {
              <div class="courts-grid">
                @for (court of courts(); track court.id) {
                  <button
                    type="button"
                    class="court-option"
                    [class.active]="selectedCourtIds().has(court.id)"
                    (click)="toggleCourt(court.id)"
                  >
                    <span class="court-check">{{ selectedCourtIds().has(court.id) ? '✓' : '' }}</span>
                    {{ court.name }}
                  </button>
                }
              </div>
            }
          </ar-panel-card>

          <ar-panel-card title="Vagas, valor e cancelamento">
            <div class="row-3">
              <div>
                <div class="field-label">Vagas por sessão</div>
                <input type="text" inputmode="numeric" class="input-box" [value]="capacity()" (input)="capacity.set($any($event.target).value)" />
              </div>
              <div>
                <div class="field-label">Valor por atleta (R$)</div>
                <input type="text" inputmode="decimal" class="input-box" [value]="price()" (input)="price.set($any($event.target).value)" />
              </div>
              <div>
                <div class="field-label">Cancelar até (horas antes)</div>
                <input type="text" inputmode="numeric" class="input-box" [value]="cancelWindow()" (input)="cancelWindow.set($any($event.target).value)" />
              </div>
            </div>
            <p class="hint">
              O atleta só entra na lista após pagar o PIX. Saindo até {{ cancelWindow() || '0' }}h antes,
              o estorno é automático e a vaga reabre.
            </p>
          </ar-panel-card>
        </div>

        <div class="col-right">
          <ar-panel-card title="Resumo">
            <div class="resumo-name">{{ name() || 'Clubinho' }}</div>
            <div class="resumo-line">{{ scheduleSummary() }}</div>
            <div class="resumo-line">{{ selectedCourtIds().size }} quadra{{ selectedCourtIds().size === 1 ? '' : 's' }} · {{ capacity() || '0' }} vagas</div>
            <div class="resumo-highlight">
              <div class="field-label tone-orange">Valor por atleta</div>
              <div class="resumo-value">{{ priceLabel() }}</div>
            </div>
          </ar-panel-card>

          <div class="hint-box">
            A lista é pública: qualquer atleta encontra o clubinho no perfil da arena, entra na
            lista e paga pelo app ou site. O valor cai na carteira da arena (taxa de 5%).
          </div>
        </div>
      </div>
    </ar-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px 32px 28px;
      display: grid;
      grid-template-columns: 1fr 373px;
      gap: 16px;
      align-items: start;
      overflow: auto;
    }

    .error-banner {
      border-radius: var(--nx-r-2);
      border: 1px solid var(--nx-live);
      background: rgba(255, 59, 48, 0.08);
      color: var(--nx-live);
      padding: 10px 14px;
      font-size: 12.5px;
    }

    .edit-warning {
      border-radius: var(--nx-r-2);
      border: 1px solid var(--nx-line-strong);
      background: var(--nx-surface-1);
      padding: 10px 14px;
      font-size: 12.5px;
      line-height: 1.5;
      color: var(--nx-text-mute);
    }

    .col-left,
    .col-right {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-width: 0;
    }

    .field-label {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin-bottom: 10px;
    }

    .field-label.spaced {
      margin-top: 16px;
    }

    .field-label.tone-orange {
      color: var(--nx-orange-500);
    }

    .hint {
      font-size: 12px;
      color: var(--nx-text-dim);
      margin: 10px 0 0;
    }

    .input-box {
      width: 100%;
      height: 46px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 14px;
      padding: 0 14px;
      box-sizing: border-box;
    }

    .input-box:focus {
      outline: none;
      border-color: var(--nx-orange-500);
    }

    .row-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }

    .row-3 {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 16px;
    }

    .type-toggle {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-bottom: 18px;
    }

    .type-btn {
      height: 52px;
      border-radius: var(--nx-r-3);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      color: var(--nx-text-mute);
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 14px;
      cursor: pointer;
      transition: all 140ms var(--nx-ease-out);
    }

    .type-btn:hover {
      background: var(--nx-surface-2);
    }

    .type-btn.active {
      background: var(--nx-orange-tint);
      border-color: var(--nx-orange-500);
      color: var(--nx-orange-500);
    }

    .weekday-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 6px;
    }

    .courts-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 10px;
    }

    .court-option {
      display: flex;
      align-items: center;
      gap: 8px;
      height: 44px;
      padding: 0 12px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      color: var(--nx-text-mute);
      font-family: var(--nx-font-ui);
      font-size: 13px;
      cursor: pointer;
      transition: all 140ms var(--nx-ease-out);
    }

    .court-option.active {
      background: var(--nx-orange-tint);
      border-color: var(--nx-orange-500);
      color: var(--nx-text);
    }

    .court-check {
      width: 14px;
      color: var(--nx-orange-500);
      font-weight: 700;
    }

    .resumo-name {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 18px;
      color: var(--nx-text);
      margin-bottom: 10px;
    }

    .resumo-line {
      font-family: var(--nx-font-mono);
      font-size: 12px;
      color: var(--nx-text-mute);
      margin-bottom: 6px;
    }

    .resumo-highlight {
      margin-top: 12px;
      padding: 16px;
      border-radius: var(--nx-r-3);
      background: var(--nx-orange-tint);
      border: 1px solid rgba(255, 106, 26, 0.3);
    }

    .resumo-value {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 28px;
      letter-spacing: -0.02em;
      color: var(--nx-orange-500);
      margin-top: 4px;
    }

    .hint-box {
      padding: 14px 16px;
      border-radius: var(--nx-r-3);
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      font-size: 12.5px;
      line-height: 1.55;
      color: var(--nx-text-dim);
    }

    @media (max-width: 1180px) {
      .body {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 720px) {
      .row-2,
      .row-3 {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class PanelClubFormComponent {
  private readonly arenaContext = inject(ArenaContextService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly weekdayOptions = Object.entries(WEEKDAY_LABELS).map(([value, label]) => ({
    value: Number(value),
    label,
  }));

  protected readonly clubId = signal<string | null>(null);
  protected readonly isEdit = computed(() => this.clubId() != null);

  protected readonly errorMessage = signal<string | null>(null);
  protected readonly saving = signal(false);

  protected readonly name = signal('');
  protected readonly description = signal('');
  protected readonly isWeekly = signal(true);
  protected readonly weekday = signal(5);
  protected readonly startTime = signal('18:00');
  protected readonly endTime = signal('22:00');
  protected readonly courts = signal<CourtOption[]>([]);
  protected readonly selectedCourtIds = signal<ReadonlySet<string>>(new Set());
  protected readonly capacity = signal('16');
  protected readonly price = signal('15');
  protected readonly cancelWindow = signal('24');

  protected readonly canSave = computed(
    () =>
      this.name().trim().length >= 3 &&
      this.selectedCourtIds().size > 0 &&
      Math.floor(parseNumber(this.capacity())) > 0 &&
      parseNumber(this.price()) > 0 &&
      !this.saving(),
  );

  protected readonly scheduleSummary = computed(() =>
    this.isWeekly()
      ? `Toda ${WEEKDAY_LABELS[this.weekday()] ?? '?'} · ${this.startTime()}–${this.endTime()}`
      : `Sessões avulsas · ${this.startTime()}–${this.endTime()}`,
  );

  protected readonly priceLabel = computed(() => formatReais(parseNumber(this.price())));

  constructor() {
    this.clubId.set(this.route.snapshot.paramMap.get('clubId'));

    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      if (!arenaId) return;
      void this.loadCourts(arenaId);
    });

    const clubId = this.clubId();
    if (clubId) void this.loadClub(clubId);
  }

  private async loadCourts(arenaId: string): Promise<void> {
    try {
      const courts = await fetchCourtsList(arenaFirestore(), arenaId);
      this.courts.set(courts.map((c) => ({ id: c.id, name: c.name })));
    } catch {
      this.courts.set([]);
    }
  }

  private async loadClub(clubId: string): Promise<void> {
    try {
      const club = await fetchClub(arenaFirestore(), clubId);
      if (!club) {
        this.errorMessage.set('Clubinho não encontrado.');
        return;
      }
      this.name.set(club.name);
      this.description.set(club.description ?? '');
      this.isWeekly.set(club.weekday != null);
      if (club.weekday != null) this.weekday.set(club.weekday);
      this.startTime.set(club.startTime);
      this.endTime.set(club.endTime);
      this.selectedCourtIds.set(new Set(club.courtIds));
      this.capacity.set(String(club.capacity));
      this.price.set(String(club.priceReais).replace('.', ','));
      this.cancelWindow.set(String(club.cancelWindowHours));
    } catch {
      this.errorMessage.set('Não foi possível carregar o clubinho.');
    }
  }

  protected toggleCourt(courtId: string): void {
    const next = new Set(this.selectedCourtIds());
    if (next.has(courtId)) {
      next.delete(courtId);
    } else {
      next.add(courtId);
    }
    this.selectedCourtIds.set(next);
  }

  protected async save(): Promise<void> {
    if (!this.canSave()) return;
    const arenaId = this.arenaContext.arenaId();
    if (!arenaId) return;

    this.saving.set(true);
    this.errorMessage.set(null);
    try {
      const result = await upsertClub(arenaFunctions(), {
        clubId: this.clubId() ?? undefined,
        arenaId,
        name: this.name().trim(),
        description: this.description().trim() || null,
        weekday: this.isWeekly() ? this.weekday() : null,
        startTime: this.startTime(),
        endTime: this.endTime(),
        courtIds: [...this.selectedCourtIds()],
        capacity: Math.floor(parseNumber(this.capacity())),
        priceReais: parseNumber(this.price()),
        cancelWindowHours: Math.max(0, Math.floor(parseNumber(this.cancelWindow()))),
      });
      void this.router.navigate(['/painel/clubinho', result.clubId]);
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'Não foi possível salvar o clubinho.');
    } finally {
      this.saving.set(false);
    }
  }

  protected goBack(): void {
    void this.router.navigate(['/painel/clubinho']);
  }
}

import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { ConfirmDialogComponent } from '../../ui/confirm-dialog.component';
import { IconComponent } from '../../ui/icon.component';
import { ToggleComponent } from '../../ui/toggle.component';
import { addTester, removeTester, shortName, TESTERS_MAX, type ClubConfig } from '../data/club-config';
import { clubErrorMessage } from '../data/club-errors';
import { ClubRepository } from '../data/club.repository';
import type { Partner } from '../data/partner';

type LoadState = 'loading' | 'ok' | 'error';

/**
 * `appConfig/benefitsClub`: o card do Hub para todos, quem testa e o "modo patrocinador" do card
 * (`hubSponsorPartnerId`, v2). Carrega e grava sozinho; cada mudança regrava o doc inteiro. Ligar
 * para todos pede confirmação: o card aparece no Hub de todo atleta na hora.
 */
@Component({
  selector: 'bo-club-config-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ToggleComponent, IconComponent, ConfirmDialogComponent],
  template: `
    <section class="cfg" aria-label="Liberação do clube">
      @if (state() === 'loading') {
        <div class="skeleton" aria-hidden="true"></div>
      } @else if (state() === 'error') {
        <div class="bo-alert" role="alert">
          <bo-icon name="alert" [size]="16" />
          <span>{{ error() }}</span>
          <button type="button" class="bo-mini-btn push" (click)="load()">Tentar de novo</button>
        </div>
      } @else {
        <div class="row">
          <bo-toggle
            ariaLabel="Card do clube no Hub para todos os atletas"
            [checked]="config().enabled"
            [disabled]="saving()"
            (checkedChange)="onToggle($event)"
          />
          <div class="text">
            <div class="title">Card no Hub para todos os atletas</div>
            <div class="sub">
              @if (config().enabled) {
                Ligado: todo atleta vê o card do clube no Hub.
              } @else {
                Desligado: só quem testa vê o clube. Ligue depois que o build com o clube estiver na loja.
              }
            </div>
          </div>
          <div class="testers">
            <span class="kicker">Quem testa</span>
            @for (uid of config().testerUids; track uid) {
              <span class="chip" [attr.title]="uid">
                {{ label(uid) }}
                @if (editing()) {
                  <button type="button" class="x" [attr.aria-label]="'Tirar ' + label(uid)" [disabled]="saving()" (click)="remove(uid)">✕</button>
                }
              </span>
            } @empty {
              <span class="none">Só admins</span>
            }
            <button type="button" class="bo-mini-btn" [attr.aria-expanded]="editing()" (click)="toggleEditing()">
              {{ editing() ? 'Fechar' : 'Editar' }}
            </button>
          </div>
        </div>

        <div class="sponsor">
          <label class="kicker" for="cfg-sponsor">Card do Hub oferecido por</label>
          <select
            id="cfg-sponsor"
            class="bo-select"
            [disabled]="saving()"
            (change)="setSponsor(value($event))"
          >
            <option value="" [selected]="!config().hubSponsorPartnerId">Nenhum (card normal)</option>
            @for (p of sponsorOptions(); track p.id) {
              <option [value]="p.id" [selected]="p.id === config().hubSponsorPartnerId">{{ p.name }}</option>
            }
            @if (sponsorMissing(); as id) {
              <option [value]="id" selected>{{ id }} (inativo ou excluído)</option>
            }
          </select>
          <span class="hint">
            @if (sponsorMissing()) {
              O parceiro escolhido não está ativo: o app mostra o card normal. Escolha outro ou "Nenhum".
            } @else if (config().hubSponsorPartnerId) {
              O card do Hub mostra "Oferecido por" com a cor da marca do parceiro.
            } @else {
              Só parceiros ativos. O card vira "Oferecido por &lt;parceiro&gt;" na cor da marca.
            }
          </span>
        </div>

        @if (editing()) {
          <form class="add" (submit)="$event.preventDefault(); add()">
            <input
              class="bo-input"
              placeholder="Uid do atleta (Firebase Auth)"
              aria-label="Uid do atleta para testar"
              [value]="draftUid()"
              [disabled]="saving() || full()"
              (input)="draftUid.set(value($event))"
            />
            <button type="submit" class="bo-mini-btn bo-mini-btn-primary" [disabled]="saving() || full() || !draftUid().trim()">
              @if (saving()) {
                <span class="bo-spinner small" aria-hidden="true"></span>
              }
              Adicionar
            </button>
          </form>
          <p class="note">
            Admins sempre veem o clube. Quem está aqui vê o card no Hub e os parceiros "Só quem testa", sem build novo.
            {{ config().testerUids.length }}/{{ max }}.
          </p>
        }
        @if (error(); as e) {
          <div class="bo-alert" role="alert"><bo-icon name="alert" [size]="16" /><span>{{ e }}</span></div>
        }
      }
    </section>

    <bo-confirm-dialog
      [open]="confirmOn()"
      title="Ligar o clube para todos?"
      description="O card do Clube de Vantagens aparece no Hub de todos os atletas na hora. Faça isso só depois que o build com o clube estiver na loja."
      confirmLabel="Ligar para todos"
      [busy]="saving()"
      [error]="confirmError()"
      (confirmed)="save(true, config().testerUids, config().hubSponsorPartnerId)"
      (dismissed)="confirmOn.set(false)"
    />
  `,
  styles: `
    :host { display: block; }
    .cfg { display: flex; flex-direction: column; gap: 12px; padding: 16px 18px; border-radius: var(--nx-r-4); border: 1px solid var(--nx-line); background: var(--nx-surface-0); }
    .row { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
    .text { flex: 1; min-width: 240px; }
    .title { font-family: var(--nx-font-display); font-weight: 700; font-size: 14px; color: var(--nx-text); }
    .sub { margin-top: 3px; font-size: 12.5px; line-height: 1.45; color: var(--nx-text-mute); }
    .testers { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .kicker { font-family: var(--nx-font-mono); font-size: 10px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .chip { display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 10px; border-radius: var(--nx-r-pill); border: 1px solid var(--nx-line-strong); background: var(--nx-surface-1); font-size: 12px; color: var(--nx-text); white-space: nowrap; }
    .x { border: none; background: transparent; color: var(--nx-text-mute); cursor: pointer; padding: 0 0 0 2px; font-size: 11px; line-height: 1; }
    .x:hover:not(:disabled) { color: var(--nx-live); }
    .none { font-size: 12px; color: var(--nx-text-dim); }
    .add { display: flex; gap: 8px; max-width: 520px; }
    .add .bo-input { flex: 1; }
    .note { margin: 0; font-size: 11.5px; line-height: 1.5; color: var(--nx-text-dim); }
    .push { margin-left: auto; flex: none; }
    .sponsor { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding-top: 12px; border-top: 1px solid var(--nx-line); }
    .sponsor .bo-select { width: auto; min-width: 220px; max-width: 320px; height: 36px; }
    .hint { font-size: 11.5px; line-height: 1.4; color: var(--nx-text-dim); flex: 1; min-width: 200px; }
    .skeleton { height: 48px; border-radius: var(--nx-r-3); background: var(--nx-surface-1); opacity: 0.6; }
    .bo-spinner.small { width: 13px; height: 13px; border-width: 2px; }
  `,
})
export class ClubConfigCardComponent {
  private readonly repository = inject(ClubRepository);

  /** Os parceiros carregados pela aba (para o modo patrocinador). */
  readonly partners = input<readonly Partner[]>([]);

  protected readonly max = TESTERS_MAX;
  protected readonly state = signal<LoadState>('loading');
  protected readonly config = signal<ClubConfig>({
    enabled: false,
    testerUids: [],
    hubSponsorPartnerId: null,
    updatedAt: null,
    updatedByName: '',
  });
  protected readonly sponsorOptions = computed(() => this.partners().filter((p) => p.active));
  /** O id gravado que não é de um parceiro ativo (a lista ainda carregando conta como ativo). */
  protected readonly sponsorMissing = computed(() => {
    const id = this.config().hubSponsorPartnerId;
    if (!id || this.partners().length === 0) return null;
    return this.sponsorOptions().some((p) => p.id === id) ? null : id;
  });
  /** uid → nome. `null` = não existe em `users`; ausente/`undefined` = não deu para saber. */
  private readonly names = signal<ReadonlyMap<string, string | null | undefined>>(new Map());
  protected readonly editing = signal(false);
  protected readonly draftUid = signal('');
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly confirmOn = signal(false);
  protected readonly confirmError = signal<string | null>(null);
  protected readonly full = computed(() => this.config().testerUids.length >= TESTERS_MAX);

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.state.set('loading');
    this.error.set('');
    try {
      const config = await this.repository.config();
      this.config.set(config);
      this.state.set('ok');
      this.names.set(await this.repository.userNames(config.testerUids));
    } catch (error) {
      this.error.set(clubErrorMessage(error));
      this.state.set(this.state() === 'ok' ? 'ok' : 'error');
    }
  }

  protected label(uid: string): string {
    const name = this.names().get(uid);
    if (name === null) return `${uid.slice(0, 8)}… (sem cadastro)`;
    return name ? shortName(name) : `${uid.slice(0, 8)}…`;
  }

  protected toggleEditing(): void {
    this.editing.update((v) => !v);
    this.error.set('');
  }

  protected onToggle(enabled: boolean): void {
    if (enabled) {
      this.confirmError.set(null);
      this.confirmOn.set(true);
      return;
    }
    void this.save(false, this.config().testerUids, this.config().hubSponsorPartnerId);
  }

  protected setSponsor(id: string): void {
    const c = this.config();
    void this.save(c.enabled, c.testerUids, id || null);
  }

  /** Confere o uid em `users/{uid}` antes de gravar: uid errado não testaria nada. */
  protected async add(): Promise<void> {
    const result = addTester(this.config().testerUids, this.draftUid());
    if ('error' in result) {
      this.error.set(result.error);
      return;
    }
    const uid = this.draftUid().trim();
    this.saving.set(true);
    this.error.set('');
    const found = await this.repository.userNames([uid]);
    this.saving.set(false);
    if (found.get(uid) === null) {
      this.error.set('Nenhum usuário com esse uid neste projeto. Confira no perfil do atleta.');
      return;
    }
    this.names.update((m) => new Map([...m, ...found]));
    if (await this.save(this.config().enabled, result.list, this.config().hubSponsorPartnerId)) {
      this.draftUid.set('');
    }
  }

  protected remove(uid: string): void {
    void this.save(this.config().enabled, removeTester(this.config().testerUids, uid), this.config().hubSponsorPartnerId);
  }

  protected async save(enabled: boolean, testerUids: readonly string[], hubSponsorPartnerId: string | null): Promise<boolean> {
    this.saving.set(true);
    this.error.set('');
    this.confirmError.set(null);
    try {
      await this.repository.saveConfig(enabled, testerUids, hubSponsorPartnerId);
      this.config.update((c) => ({ ...c, enabled, testerUids: [...testerUids], hubSponsorPartnerId, updatedAt: new Date() }));
      this.confirmOn.set(false);
      return true;
    } catch (error) {
      const message = clubErrorMessage(error);
      if (this.confirmOn()) this.confirmError.set(message);
      else this.error.set(message);
      return false;
    } finally {
      this.saving.set(false);
    }
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }
}

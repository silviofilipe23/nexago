import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ConfirmDialogComponent } from '../../ui/confirm-dialog.component';
import { FieldComponent } from '../../ui/field.component';
import { IconComponent } from '../../ui/icon.component';
import { PanelShellComponent } from '../../ui/panel-shell.component';
import { PillComponent } from '../../ui/pill.component';
import { saoPauloDate } from '../planos/data/tournament-plans';
import { saveErrorText } from '../planos/data/save-errors';
import {
  CONTRACT_STATUS_VIEW,
  STATUS_DONE,
  isOpen,
  nextStep,
  tierUsage,
  validateSponsorLogo,
  type ContractStatus,
  type PlanContract,
  type PlanSponsor,
} from './data/plan-contracts';
import { PlanContractsRepository, type OrganizerContact } from './data/plan-contracts.repository';
import { ContractPlanCardComponent } from './ui/contract-plan-card.component';
import { ContractSideComponent } from './ui/contract-side.component';
import { ContractSponsorsCardComponent } from './ui/contract-sponsors-card.component';
import { ContractStatusDialogComponent } from './ui/contract-status-dialog.component';
import { NexagoSponsorDialogComponent, type NexagoSponsorDraft } from './ui/nexago-sponsor-dialog.component';

type LoadState = 'loading' | 'ok' | 'missing' | 'error';
type Dialog = 'next' | 'cancel' | 'reject' | 'remove' | 'add' | null;

const REASON_MAX = 280;

/** Torneios › Contratos › evento: status, contas, plano congelado e as cotas com as logos. */
@Component({
  selector: 'bo-contrato-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ConfirmDialogComponent, ContractPlanCardComponent, ContractSideComponent, ContractSponsorsCardComponent,
    ContractStatusDialogComponent, FieldComponent, IconComponent, NexagoSponsorDialogComponent, PanelShellComponent,
    PillComponent, RouterLink,
  ],
  template: `
    <bo-panel-shell>
      <header class="head">
        <div class="titles">
          <nav class="crumb" aria-label="Trilha"><a routerLink="/painel/torneios">Torneios</a> › <a routerLink="/painel/torneios/contratos">Contratos</a></nav>
          <div class="title-row">
            <h1>{{ contract()?.tournamentName ?? 'Contrato' }}</h1>
            @if (contract(); as c) { <bo-pill [tone]="view().tone">{{ view().label }}</bo-pill> }
          </div>
          @if (contract()?.cancelReason; as r) { <p class="reason">Cancelado: {{ r }}</p> }
        </div>
        <div class="spacer"></div>
        @if (contract(); as c) {
          @if (open()) {
            <button type="button" class="danger-ghost" [disabled]="busy()" (click)="openDialog('cancel')">Cancelar contrato</button>
          }
          @if (step(); as s) {
            <span [title]="s.blocked ?? ''">
              <button type="button" class="bo-mini-btn bo-mini-btn-primary" [disabled]="busy() || s.blocked !== null" (click)="openDialog('next')">
                <bo-icon name="check" [size]="13" /> {{ s.label }}
              </button>
            </span>
          }
        }
      </header>

      <div class="body">
        @if (toast(); as t) { <div class="bo-feedback" role="status"><bo-icon name="check" [size]="15" /><span>{{ t }}</span></div> }
        @if (error(); as e) { <div class="bo-alert" role="alert"><bo-icon name="alert" [size]="16" /><span>{{ e }}</span></div> }
        @switch (state()) {
          @case ('loading') { <div class="grid"><div class="skel tall"></div><div class="skel"></div></div> }
          @case ('missing') { <div class="bo-alert" role="alert"><bo-icon name="alert" [size]="16" /><span>Contrato não encontrado.</span></div> }
          @case ('error') {
            <div class="bo-alert" role="alert"><bo-icon name="alert" [size]="16" /><span>Não foi possível carregar o contrato.</span>
              <button type="button" class="bo-mini-btn push" (click)="load()">Tentar de novo</button></div>
          }
          @case ('ok') {
            @if (contract(); as c) {
              @if (step()?.blocked; as why) { <p class="hint">{{ why }}</p> }
              <div class="grid">
                <div class="main">
                  <bo-contract-sponsors-card [contract]="c" [sponsors]="sponsors()" [editable]="open()" [busyId]="busySponsor()"
                    (approve)="approve($event)" (reject)="openSponsorDialog('reject', $event)" (add)="openDialog('add')"
                    (changeLogo)="pickLogoFor($event)" (remove)="openSponsorDialog('remove', $event)" />
                  <bo-contract-plan-card [contract]="c" />
                </div>
                <bo-contract-side [contract]="c" [contact]="contact()" [today]="today" />
              </div>
            }
          }
        }
      </div>
      <input #logoInput type="file" class="hidden-file" accept="image/png,image/jpeg,image/webp,image/svg+xml" (change)="onLogoPicked($event)" />
    </bo-panel-shell>

    <bo-contract-status-dialog [contract]="dialog() === 'next' || dialog() === 'cancel' ? contract() : null"
      [kind]="dialog() === 'cancel' ? 'cancel' : 'next'" [today]="today" [busy]="busy()" [error]="dialogError()"
      (confirmed)="changeStatus($event)" (dismissed)="closeDialog()" />

    <bo-confirm-dialog [open]="dialog() === 'reject'" [title]="'Recusar a logo de ' + (sponsor()?.name ?? '') + '?'"
      confirmLabel="Recusar logo" tone="danger" size="md" [busy]="busy()" [error]="dialogError()"
      description="O organizador vê &quot;Logo recusada&quot; no portal e pode enviar outra, que volta para análise."
      (confirmed)="reject()" (dismissed)="closeDialog()">
      <bo-field label="Motivo (opcional)" hint="Fica no contrato para quem atender depois. Ex.: fundo branco some no placar.">
        <textarea class="bo-input area" [attr.maxlength]="reasonMax" [value]="reason()" (input)="reason.set(val($event))"></textarea>
      </bo-field>
    </bo-confirm-dialog>

    <bo-confirm-dialog [open]="dialog() === 'remove'" [title]="'Remover ' + (sponsor()?.name ?? '') + '?'"
      confirmLabel="Remover" tone="danger" [busy]="busy()" [error]="dialogError()"
      description="A cota volta a ficar livre neste evento e a logo é apagada."
      (confirmed)="remove()" (dismissed)="closeDialog()" />

    <bo-nexago-sponsor-dialog [open]="dialog() === 'add'" [usage]="usage()" [busy]="busy()" [error]="dialogError()"
      (submitted)="add($event)" (dismissed)="closeDialog()" />
  `,
  styles: `
    :host { display: block; }
    .head { display: flex; align-items: center; gap: 10px; padding: 18px 32px; border-bottom: 1px solid var(--nx-line); flex-wrap: wrap; }
    .titles { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .crumb { font-family: var(--nx-font-mono); font-size: 10px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .crumb a { color: inherit; text-decoration: none; }
    .crumb a:hover { color: var(--nx-text); }
    .title-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    h1 { margin: 0; font-family: var(--nx-font-display); font-weight: 800; font-size: 21px; letter-spacing: -0.02em; }
    .reason { margin: 2px 0 0; font-size: 12px; color: var(--nx-live); }
    .spacer { flex: 1; }
    .danger-ghost { height: 32px; padding: 0 10px; border: none; background: none; color: var(--nx-live); font-family: var(--nx-font-display); font-weight: 600; font-size: 12.5px; cursor: pointer; }
    .danger-ghost:hover:not(:disabled) { text-decoration: underline; }
    .danger-ghost:disabled, .bo-mini-btn:disabled { opacity: 0.45; cursor: not-allowed; }
    .body { padding: 20px 32px 40px; display: flex; flex-direction: column; gap: 14px; }
    .push { margin-left: auto; flex: none; }
    .grid { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 16px; align-items: start; }
    .main { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .hint { margin: 0; font-size: 12.5px; color: var(--nx-text-mute); }
    .skel { height: 220px; border-radius: var(--nx-r-4); background: var(--nx-surface-1); opacity: 0.6; }
    .skel.tall { height: 420px; }
    .area { height: 80px; padding: 9px 12px; resize: vertical; }
    .hidden-file { display: none; }
    @media (max-width: 1100px) { .grid { grid-template-columns: minmax(0, 1fr); } }
    @media (max-width: 760px) { .head, .body { padding-left: 16px; padding-right: 16px; } }
  `,
})
export class ContratoDetailComponent {
  private readonly repo = inject(PlanContractsRepository);
  private readonly route = inject(ActivatedRoute);
  private readonly logoInput = viewChild.required<ElementRef<HTMLInputElement>>('logoInput');

  protected readonly today = saoPauloDate(new Date());
  protected readonly reasonMax = REASON_MAX;

  protected readonly state = signal<LoadState>('loading');
  protected readonly contract = signal<PlanContract | null>(null);
  protected readonly sponsors = signal<PlanSponsor[]>([]);
  protected readonly contact = signal<OrganizerContact | null>(null);
  protected readonly busy = signal(false);
  protected readonly busySponsor = signal<string | null>(null);
  protected readonly toast = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly dialog = signal<Dialog>(null);
  protected readonly dialogError = signal<string | null>(null);
  protected readonly sponsor = signal<PlanSponsor | null>(null);
  protected readonly reason = signal('');
  private logoTarget: PlanSponsor | null = null;

  protected readonly view = computed(() => CONTRACT_STATUS_VIEW[this.contract()?.status ?? 'requested']);
  protected readonly open = computed(() => !!this.contract() && isOpen(this.contract()!.status));
  protected readonly step = computed(() => (this.contract() ? nextStep(this.contract()!, this.today) : null));
  protected readonly usage = computed(() => tierUsage(this.contract()?.sponsors.tiers ?? [], this.sponsors()));

  private readonly id = this.route.snapshot.paramMap.get('id') ?? '';

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.state.set(this.contract() ? 'ok' : 'loading');
    try {
      const c = await this.repo.get(this.id);
      if (!c) {
        this.contract.set(null);
        this.state.set('missing');
        return;
      }
      const [sponsors, contact] = await Promise.all([
        c.sponsors.enabled ? this.repo.sponsors(c.id) : Promise.resolve([]),
        this.contact() ? Promise.resolve(this.contact()) : this.repo.organizerContact(c.organizerId),
      ]);
      this.contract.set(c);
      this.sponsors.set(sponsors);
      this.contact.set(contact);
      this.state.set('ok');
    } catch {
      this.state.set('error');
    }
  }

  protected openDialog(d: Exclude<Dialog, null>): void {
    this.dialogError.set(null);
    this.dialog.set(d);
  }

  protected openSponsorDialog(d: 'reject' | 'remove', s: PlanSponsor): void {
    this.sponsor.set(s);
    this.reason.set('');
    this.openDialog(d);
  }

  protected closeDialog(): void {
    if (!this.busy()) this.dialog.set(null);
  }

  protected async changeStatus(note: string | null): Promise<void> {
    const c = this.contract();
    const to: ContractStatus | undefined = this.dialog() === 'cancel' ? 'cancelled' : this.step()?.to;
    if (!c || !to) return;
    await this.run(async () => {
      await this.repo.setStatus({ tournamentId: c.id, from: c.status, to, note });
      return `Pronto: ${STATUS_DONE[to]}`;
    });
  }

  protected async approve(s: PlanSponsor): Promise<void> {
    const c = this.contract();
    if (!c || !s.logoUrl) return;
    this.busySponsor.set(s.id);
    this.error.set(null);
    try {
      await this.repo.reviewLogo({ tournamentId: c.id, sponsorId: s.id, decision: 'approve', logoUrl: s.logoUrl, reason: null });
      this.toast.set(`Logo de ${s.name} aprovada.`);
      await this.load();
    } catch (err) {
      this.error.set(saveErrorText(err));
    } finally {
      this.busySponsor.set(null);
    }
  }

  protected async reject(): Promise<void> {
    const c = this.contract();
    const s = this.sponsor();
    if (!c || !s?.logoUrl) return;
    await this.run(async () => {
      await this.repo.reviewLogo({ tournamentId: c.id, sponsorId: s.id, decision: 'reject', logoUrl: s.logoUrl!,
        reason: this.reason().trim() || null });
      return `Logo de ${s.name} recusada: o organizador já vê no portal.`;
    });
  }

  protected async remove(): Promise<void> {
    const c = this.contract();
    const s = this.sponsor();
    if (!c || !s) return;
    await this.run(async () => {
      await this.repo.removeNexagoSponsor(c.id, s.id);
      return `${s.name} saiu das cotas.`;
    });
  }

  protected async add(draft: NexagoSponsorDraft): Promise<void> {
    const c = this.contract();
    if (!c) return;
    await this.run(async () => {
      const sponsorId = this.repo.newSponsorId(c.id);
      const logoUrl = draft.file ? await this.upload(c.id, sponsorId, draft.file) : null;
      await this.repo.addNexagoSponsor({ tournamentId: c.id, sponsorId, name: draft.name, tierId: draft.tierId, logoUrl });
      return `${draft.name} entrou nas cotas.`;
    });
  }

  protected pickLogoFor(s: PlanSponsor): void {
    this.logoTarget = s;
    this.logoInput().nativeElement.click();
  }

  protected async onLogoPicked(e: Event): Promise<void> {
    const el = e.target as HTMLInputElement;
    const file = el.files?.[0] ?? null;
    el.value = '';
    const c = this.contract();
    const s = this.logoTarget;
    this.logoTarget = null;
    if (!file || !c || !s) return;
    const issue = validateSponsorLogo(file);
    if (issue) {
      this.error.set(issue);
      return;
    }
    this.busySponsor.set(s.id);
    this.error.set(null);
    try {
      const url = await this.upload(c.id, s.id, file);
      await this.repo.setNexagoSponsorLogo(c.id, s.id, url);
      this.toast.set(`Logo de ${s.name} atualizada.`);
      await this.load();
    } catch (err) {
      this.error.set(saveErrorText(err));
    } finally {
      this.busySponsor.set(null);
    }
  }

  private async upload(tournamentId: string, sponsorId: string, file: File): Promise<string> {
    try {
      return await this.repo.uploadLogo(tournamentId, sponsorId, file);
    } catch {
      throw new Error('Não foi possível enviar a logo. Tente de novo.');
    }
  }

  /** Ação de diálogo: trava, mostra o erro dentro do diálogo e recarrega no sucesso. */
  private async run(action: () => Promise<string>): Promise<void> {
    this.busy.set(true);
    this.dialogError.set(null);
    this.error.set(null);
    try {
      const done = await action();
      this.dialog.set(null);
      this.toast.set(done);
      await this.load();
    } catch (err) {
      this.dialogError.set(saveErrorText(err));
    } finally {
      this.busy.set(false);
    }
  }

  protected val(e: Event): string {
    return (e.target as HTMLTextAreaElement).value;
  }
}

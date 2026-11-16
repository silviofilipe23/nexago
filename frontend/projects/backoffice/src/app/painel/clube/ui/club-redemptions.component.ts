import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { IconComponent } from '../../ui/icon.component';
import {
  EMPTY_IMPORT_RESULT,
  IMPORT_BATCH_SIZE,
  REDEMPTION_STATUSES,
  REDEMPTION_STATUS_LABELS,
  addResults,
  chunk,
  formatCents,
  parseRedemptionCsv,
  previewTotals,
  type BenefitRedemption,
  type ImportResult,
  type ParsedRedemptions,
  type RedemptionStatus,
} from '../data/benefit-redemption';
import { clubCallableErrorMessage, clubErrorMessage } from '../data/club-errors';
import { ClubRepository, REDEMPTIONS_LIMIT } from '../data/club.repository';
import type { Partner } from '../data/partner';

type LoadState = 'loading' | 'ok' | 'error';
/** O CSV do parceiro é pequeno; acima disso é arquivo errado. */
const CSV_MAX_BYTES = 2 * 1024 * 1024;
/** Linhas da prévia na tela (os erros aparecem todos). */
const PREVIEW_ROWS = 50;

/**
 * Aba Resgates: o CSV de resgates confirmados pelo parceiro entra pela callable
 * `importBenefitRedemptions` (lotes de 200), que liga cada código ao atleta. Embaixo, os resgates
 * gravados em `benefitRedemptions`, com filtro por parceiro e situação.
 */
@Component({
  selector: 'bo-club-redemptions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <section class="card">
      <div class="head">
        <h2>Importar resgates do parceiro</h2>
        <span class="meta">CSV com: código, id do pedido, data, desconto em R$ e valor do pedido (opcional)</span>
      </div>
      <p class="explain">
        Só resgates <strong>confirmados pelo parceiro</strong> e <strong>atribuídos ao código do atleta</strong> (NEXA-XXXX) aparecem como
        economia no app. Código de ninguém ou de mais de um atleta fica registrado, mas não conta para ninguém. Reenviar o mesmo
        pedido não duplica.
      </p>

      <div class="row">
        <label class="fld">
          <span class="lbl">Parceiro</span>
          <select class="bo-select" [disabled]="importing()" (change)="pickPartner(value($event))">
            <option value="" [selected]="!importPartnerId()">Escolha o parceiro</option>
            @for (p of partners(); track p.id) {
              <option [value]="p.id" [selected]="p.id === importPartnerId()">{{ p.name }}{{ p.couponMode === 'athlete' ? '' : ' (sem código por atleta)' }}</option>
            }
          </select>
        </label>
        <label class="bo-mini-btn file" [class.disabled]="importing()">
          <input type="file" accept=".csv,text/csv,text/plain" [disabled]="importing()" (change)="onFile($event)" />
          <bo-icon name="file" [size]="13" /> Enviar arquivo
        </label>
      </div>
      @if (selectedPartner(); as p) {
        @if (p.couponMode !== 'athlete') {
          <p class="warn">
            {{ p.name }} não usa código por atleta: os resgates com cupom fixo não têm como ser ligados a um atleta e entram como "sem
            dono".
          </p>
        }
      }

      <textarea
        class="bo-input area"
        rows="6"
        aria-label="CSV dos resgates"
        placeholder="NEXA-AB12;PED-1001;16/11/2026;8,29;82,90"
        [disabled]="importing()"
        [value]="csv()"
        (input)="setCsv(value($event))"
      ></textarea>
      @if (fileError(); as e) {
        <span class="err">{{ e }}</span>
      }

      @if (parsed(); as parsed) {
        <div class="summary" role="status">
          <span><strong>{{ parsed.rows.length }}</strong> linha{{ parsed.rows.length === 1 ? '' : 's' }} pronta{{ parsed.rows.length === 1 ? '' : 's' }}</span>
          <span>· {{ money(totals().discountCents) }} em desconto</span>
          @if (parsed.errors.length > 0) {
            <span class="bad">· {{ parsed.errors.length }} com erro (não vão)</span>
          }
          @if (parsed.hadHeader) {
            <span class="dim">· cabeçalho pulado</span>
          }
        </div>

        @if (parsed.errors.length > 0) {
          <ul class="errors" aria-label="Linhas com erro">
            @for (e of parsed.errors; track e.line) {
              <li><span class="ln">Linha {{ e.line }}</span>{{ e.message }}</li>
            }
          </ul>
        }

        @if (parsed.rows.length > 0) {
          <div class="wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Linha</th>
                  <th scope="col">Código</th>
                  <th scope="col">Pedido</th>
                  <th scope="col">Data</th>
                  <th scope="col" class="n">Desconto</th>
                  <th scope="col" class="n">Pedido (R$)</th>
                </tr>
              </thead>
              <tbody>
                @for (r of previewRows(); track r.line) {
                  <tr>
                    <td class="mono dim">{{ r.line }}</td>
                    <td class="mono">{{ r.code }}</td>
                    <td class="mono">{{ r.externalId }}</td>
                    <td>{{ date(r.redeemedAt) }}</td>
                    <td class="n">{{ money(r.discountCents) }}</td>
                    <td class="n">{{ r.orderCents === null ? '—' : money(r.orderCents) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          @if (parsed.rows.length > previewRows().length) {
            <p class="dim small">Mostrando {{ previewRows().length }} de {{ parsed.rows.length }}.</p>
          }
        }
      }

      <div class="actions">
        @if (importing()) {
          <span class="dim">Enviando lote {{ batchDone() + 1 }} de {{ batchTotal() }}…</span>
        }
        <button type="button" class="bo-mini-btn" [disabled]="importing() || csv() === ''" (click)="clear()">Limpar</button>
        <button type="button" class="bo-mini-btn bo-mini-btn-primary" [disabled]="!canImport()" (click)="runImport()">
          @if (importing()) {
            <span class="bo-spinner small" aria-hidden="true"></span>
          }
          Importar {{ parsed()?.rows?.length ?? 0 }} resgate{{ parsed()?.rows?.length === 1 ? '' : 's' }}
        </button>
      </div>

      @if (importError(); as e) {
        <div class="bo-alert" role="alert"><bo-icon name="alert" [size]="16" /><span>{{ e }}</span></div>
      }
      @if (result(); as r) {
        <div class="results" role="status" aria-live="polite">
          <div class="res ok"><strong>{{ r.matched }}</strong><span>confirmados</span><small>ligados a um atleta: viram economia no app</small></div>
          <div class="res"><strong>{{ r.ambiguous }}</strong><span>ambíguos</span><small>código de mais de um atleta: não contam</small></div>
          <div class="res"><strong>{{ r.unmatched }}</strong><span>sem dono</span><small>código que nenhum atleta usou</small></div>
          <div class="res"><strong>{{ r.duplicates }}</strong><span>duplicados</span><small>pedido já importado antes</small></div>
        </div>
      }
    </section>

    <section class="card">
      <div class="head">
        <h2>Resgates gravados</h2>
        @if (state() === 'ok') {
          <span class="meta">{{ list().length }} resgate{{ list().length === 1 ? '' : 's' }} · {{ money(listMatchedCents()) }} confirmados</span>
        }
      </div>
      <div class="row">
        <select class="bo-select" aria-label="Filtrar por parceiro" (change)="filterPartner(value($event))">
          <option value="" [selected]="!filterPartnerId()">Todos os parceiros</option>
          @for (p of partners(); track p.id) {
            <option [value]="p.id" [selected]="p.id === filterPartnerId()">{{ p.name }}</option>
          }
        </select>
        <div class="chips" role="group" aria-label="Situação">
          <button type="button" class="bo-chip" [class.active]="filterStatus() === null" [attr.aria-pressed]="filterStatus() === null" (click)="setStatus(null)">Todas</button>
          @for (s of statuses; track s) {
            <button type="button" class="bo-chip" [class.active]="filterStatus() === s" [attr.aria-pressed]="filterStatus() === s" (click)="setStatus(s)">
              {{ statusLabels[s] }}
            </button>
          }
        </div>
      </div>

      @if (state() === 'loading') {
        <div class="skeleton" aria-hidden="true"></div>
      } @else if (state() === 'error') {
        <div class="bo-alert" role="alert">
          <bo-icon name="alert" [size]="16" />
          <span>{{ loadError() }}</span>
          <button type="button" class="bo-mini-btn push" (click)="load()">Tentar de novo</button>
        </div>
      } @else if (list().length === 0) {
        <p class="empty">Nenhum resgate com esse filtro. Os resgates aparecem aqui depois de importados.</p>
      } @else {
        <div class="wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Data</th>
                <th scope="col">Parceiro</th>
                <th scope="col">Código</th>
                <th scope="col">Pedido</th>
                <th scope="col">Situação</th>
                <th scope="col" class="n">Desconto</th>
                <th scope="col">Importado por</th>
              </tr>
            </thead>
            <tbody>
              @for (r of list(); track r.id) {
                <tr>
                  <td>{{ r.redeemedAt ? date(r.redeemedAt.getTime()) : '—' }}</td>
                  <td class="name">{{ partnerName(r.partnerId) }}</td>
                  <td class="mono">{{ r.code }}</td>
                  <td class="mono">{{ r.externalId }}</td>
                  <td><span [class]="'pill ' + r.status">{{ statusLabels[r.status] }}</span></td>
                  <td class="n">{{ money(r.discountCents) }}</td>
                  <td class="dim">{{ r.importedByName || '—' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        @if (list().length >= limit) {
          <p class="dim small">Mostrando os {{ limit }} primeiros. Filtre por parceiro e situação para ver o resto.</p>
        }
      }
    </section>
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .card { display: flex; flex-direction: column; gap: 12px; background: var(--nx-surface-0); border: 1px solid var(--nx-line); border-radius: var(--nx-r-4); padding: 18px 20px; min-width: 0; }
    .head { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
    h2 { margin: 0; font-family: var(--nx-font-display); font-weight: 700; font-size: 15px; color: var(--nx-text); }
    .meta { font-size: 12px; color: var(--nx-text-dim); }
    .explain { margin: 0; font-size: 12.5px; line-height: 1.5; color: var(--nx-text-mute); max-width: 860px; }
    .explain strong { color: var(--nx-text); }
    .warn { margin: 0; font-size: 12px; line-height: 1.45; color: var(--nx-pending); }
    .row { display: flex; align-items: flex-end; gap: 10px; flex-wrap: wrap; }
    .row .bo-select { width: auto; min-width: 240px; max-width: 360px; }
    .fld { display: flex; flex-direction: column; gap: 6px; }
    .lbl { font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .chips { display: flex; gap: 8px; flex-wrap: wrap; }
    .file { position: relative; overflow: hidden; }
    .file input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
    .file.disabled { opacity: 0.5; pointer-events: none; }
    .file:focus-within { outline: 2px solid var(--nx-orange-500); outline-offset: 2px; }
    .bo-input.area { height: auto; min-height: 120px; padding: 10px 13px; resize: vertical; line-height: 1.45; font-family: var(--nx-font-mono); font-size: 12px; }
    .err { font-size: 11.5px; color: #ff9b94; }
    .summary { display: flex; gap: 6px; flex-wrap: wrap; font-size: 12.5px; color: var(--nx-text-mute); }
    .summary strong { color: var(--nx-text); }
    .bad { color: #ff9b94; }
    .dim { color: var(--nx-text-dim); }
    .small { margin: 0; font-size: 11.5px; }
    .errors { margin: 0; padding: 10px 12px; list-style: none; display: flex; flex-direction: column; gap: 4px; max-height: 180px; overflow: auto; border-radius: var(--nx-r-2); border: 1px solid rgba(255, 59, 48, 0.35); background: rgba(255, 59, 48, 0.06); font-size: 12px; color: var(--nx-text-mute); }
    .ln { display: inline-block; min-width: 70px; font-family: var(--nx-font-mono); font-size: 11px; color: #ff9b94; }
    .wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; min-width: 640px; }
    th { text-align: left; font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); padding: 8px 10px; border-bottom: 1px solid var(--nx-line); white-space: nowrap; }
    td { padding: 10px; border-bottom: 1px solid var(--nx-line); font-size: 12.5px; color: var(--nx-text-mute); }
    tr:last-child td { border-bottom: none; }
    .n { text-align: right; font-family: var(--nx-font-mono); }
    .mono { font-family: var(--nx-font-mono); }
    .name { font-family: var(--nx-font-display); font-weight: 600; color: var(--nx-text); }
    .actions { display: flex; align-items: center; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }
    .actions .dim { font-size: 12px; margin-right: auto; }
    .results { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
    @media (max-width: 760px) { .results { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    .res { display: flex; flex-direction: column; gap: 2px; padding: 12px 14px; border-radius: var(--nx-r-3); border: 1px solid var(--nx-line); background: var(--nx-surface-1); }
    .res strong { font-family: var(--nx-font-display); font-size: 22px; color: var(--nx-text); }
    .res span { font-size: 12.5px; color: var(--nx-text); }
    .res small { font-size: 11px; line-height: 1.35; color: var(--nx-text-dim); }
    .res.ok { border-color: rgba(43, 209, 126, 0.45); }
    .res.ok strong { color: #2bd17e; }
    .pill { display: inline-flex; height: 22px; align-items: center; padding: 0 9px; border-radius: var(--nx-r-pill); font-size: 11px; font-weight: 600; border: 1px solid var(--nx-line-strong); color: var(--nx-text-mute); white-space: nowrap; }
    .pill.matched { color: #2bd17e; border-color: rgba(43, 209, 126, 0.45); }
    .pill.ambiguous { color: var(--nx-pending); border-color: rgba(255, 176, 32, 0.45); }
    .bo-alert { margin: 0; align-items: center; }
    .push { margin-left: auto; flex: none; }
    .empty { margin: 0; padding: 14px 0; font-size: 12.5px; color: var(--nx-text-dim); }
    .skeleton { height: 96px; border-radius: var(--nx-r-3); background: var(--nx-surface-1); opacity: 0.6; }
    .bo-spinner.small { width: 13px; height: 13px; border-width: 2px; }
  `,
})
export class ClubRedemptionsComponent {
  private readonly repository = inject(ClubRepository);

  readonly partners = input.required<readonly Partner[]>();

  protected readonly statuses = REDEMPTION_STATUSES;
  protected readonly statusLabels = REDEMPTION_STATUS_LABELS;
  protected readonly limit = REDEMPTIONS_LIMIT;
  protected readonly money = formatCents;

  // importação
  protected readonly importPartnerId = signal('');
  protected readonly csv = signal('');
  protected readonly fileError = signal('');
  protected readonly importing = signal(false);
  protected readonly batchDone = signal(0);
  protected readonly batchTotal = signal(0);
  protected readonly importError = signal('');
  protected readonly result = signal<ImportResult | null>(null);
  protected readonly parsed = computed<ParsedRedemptions | null>(() =>
    this.csv().trim() === '' ? null : parseRedemptionCsv(this.csv(), new Date()),
  );
  protected readonly totals = computed(() => previewTotals(this.parsed()?.rows ?? []));
  protected readonly previewRows = computed(() => (this.parsed()?.rows ?? []).slice(0, PREVIEW_ROWS));
  protected readonly selectedPartner = computed(() => this.partners().find((p) => p.id === this.importPartnerId()) ?? null);
  protected readonly canImport = computed(
    () => !this.importing() && this.importPartnerId() !== '' && (this.parsed()?.rows.length ?? 0) > 0,
  );

  // tabela
  protected readonly state = signal<LoadState>('loading');
  protected readonly loadError = signal('');
  protected readonly list = signal<BenefitRedemption[]>([]);
  protected readonly filterPartnerId = signal<string | null>(null);
  protected readonly filterStatus = signal<RedemptionStatus | null>(null);
  protected readonly listMatchedCents = computed(() =>
    this.list().reduce((sum, r) => sum + (r.status === 'matched' ? r.discountCents : 0), 0),
  );
  private requestId = 0;

  constructor() {
    void this.load();
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;
  }

  protected date(ms: number): string {
    return new Date(ms).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  }

  protected partnerName(id: string): string {
    return this.partners().find((p) => p.id === id)?.name ?? id;
  }

  protected pickPartner(id: string): void {
    this.importPartnerId.set(id);
    this.result.set(null);
  }

  protected setCsv(text: string): void {
    this.csv.set(text);
    this.fileError.set('');
    this.result.set(null);
    this.importError.set('');
  }

  protected async onFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > CSV_MAX_BYTES) {
      this.fileError.set('Arquivo grande demais para um CSV de resgates (até 2 MB).');
      return;
    }
    try {
      this.setCsv(await file.text());
    } catch {
      this.fileError.set('Não deu para ler o arquivo. Exporte de novo como CSV.');
    }
  }

  protected clear(): void {
    this.setCsv('');
  }

  /** Lotes em série: um lote que falha para tudo e diz quantos já entraram (reenviar não duplica). */
  protected async runImport(): Promise<void> {
    const rows = this.parsed()?.rows ?? [];
    const partnerId = this.importPartnerId();
    if (!partnerId || rows.length === 0) return;
    const batches = chunk(rows, IMPORT_BATCH_SIZE);
    this.importing.set(true);
    this.importError.set('');
    this.result.set(null);
    this.batchDone.set(0);
    this.batchTotal.set(batches.length);
    let total = EMPTY_IMPORT_RESULT;
    try {
      for (const batch of batches) {
        total = addResults(total, await this.repository.importRedemptions(partnerId, batch));
        this.batchDone.update((n) => n + 1);
      }
      this.result.set(total);
      this.csv.set('');
      this.filterPartnerId.set(partnerId);
      void this.load();
    } catch (error) {
      const done = this.batchDone();
      if (done > 0) this.result.set(total);
      const sent = done === 0 ? '' : ` ${done} de ${batches.length} lotes já entraram; reenviar o arquivo inteiro não duplica.`;
      this.importError.set(clubCallableErrorMessage(error) + sent);
    } finally {
      this.importing.set(false);
    }
  }

  protected filterPartner(id: string): void {
    this.filterPartnerId.set(id || null);
    void this.load();
  }

  protected setStatus(status: RedemptionStatus | null): void {
    this.filterStatus.set(status);
    void this.load();
  }

  async load(): Promise<void> {
    const id = ++this.requestId;
    this.state.set('loading');
    try {
      const list = await this.repository.redemptions({ partnerId: this.filterPartnerId(), status: this.filterStatus() });
      if (id !== this.requestId) return;
      this.list.set(list);
      this.state.set('ok');
    } catch (error) {
      if (id !== this.requestId) return;
      this.loadError.set(clubErrorMessage(error));
      this.state.set('error');
    }
  }
}

import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { IconComponent } from '../../ui/icon.component';
import { sourceLabel } from '../data/benefit-metrics';
import { csvFileName, downloadCsv } from '../data/csv';
import {
  cityState,
  filterLeads,
  formatCep,
  formatDateTime,
  formatWhatsapp,
  leadPartners,
  leadsCsv,
  whatsappLink,
  type PartnerLead,
} from '../data/partner-lead';

/**
 * Aba Leads: quem pediu contato pelo formulário de um parceiro, com consentimento. Recebe a lista
 * da página (que já leu para o contador da aba); o filtro e o CSV ficam aqui.
 */
@Component({
  selector: 'bo-club-leads',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <section class="card">
      <div class="head">
        <h2>Leads</h2>
        @if (partnerOptions().length > 0) {
          <select class="bo-select filter" aria-label="Filtrar por parceiro" [value]="partnerId() ?? ''" (change)="onFilter($event)">
            <option value="">Todos os parceiros</option>
            @for (p of partnerOptions(); track p.id) {
              <option [value]="p.id">{{ p.name }}</option>
            }
          </select>
        }
        <button type="button" class="bo-mini-btn push" [disabled]="visible().length === 0" (click)="exportCsv()">
          <bo-icon name="download" [size]="13" /> Exportar CSV
        </button>
      </div>

      @if (loading()) {
        <div class="skeleton" aria-hidden="true"></div>
      } @else if (error(); as e) {
        <div class="bo-alert" role="alert">
          <bo-icon name="alert" [size]="16" />
          <span>{{ e }}</span>
          <button type="button" class="bo-mini-btn push" (click)="retry.emit()">Tentar de novo</button>
        </div>
      } @else if (visible().length === 0) {
        <p class="empty">Nenhum lead ainda. Eles chegam quando um atleta envia o formulário de um parceiro.</p>
      } @else {
        <div class="wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Quando</th>
                @if (!partnerId()) {
                  <th scope="col">Parceiro</th>
                }
                <th scope="col">Nome</th>
                <th scope="col">WhatsApp</th>
                <th scope="col">Bairro</th>
                <th scope="col">CEP</th>
                <th scope="col">Cidade</th>
                <th scope="col">Origem</th>
                <th scope="col" class="n">Envios</th>
              </tr>
            </thead>
            <tbody>
              @for (l of visible(); track l.id) {
                <tr>
                  <td class="mono">{{ when(l.createdAt) }}</td>
                  @if (!partnerId()) {
                    <td>{{ l.partnerName }}</td>
                  }
                  <td class="name">{{ l.name }}</td>
                  <td class="mono">
                    @if (wa(l.whatsapp); as href) {
                      <a [href]="href" target="_blank" rel="noopener noreferrer">{{ phone(l.whatsapp) }}</a>
                    } @else {
                      {{ phone(l.whatsapp) }}
                    }
                  </td>
                  <td>{{ l.neighborhood }}</td>
                  <td class="mono">{{ cep(l.cep) }}</td>
                  <td>{{ place(l) }}</td>
                  <td>{{ source(l.source) }}</td>
                  <td class="n mono" [attr.title]="l.submitCount > 1 ? 'Último envio: ' + when(l.updatedAt) : null">{{ l.submitCount }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
      <p class="lgpd">
        Cada lead guarda o texto do consentimento aceito e a data (vão no CSV). Só a equipe da NexaGO vê esta lista;
        entregue ao parceiro apenas os leads dele.
      </p>
    </section>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .card { background: var(--nx-surface-0); border: 1px solid var(--nx-line); border-radius: var(--nx-r-4); padding: 18px 20px; min-width: 0; }
    .head { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; flex-wrap: wrap; }
    h2 { margin: 0; font-family: var(--nx-font-display); font-weight: 700; font-size: 15px; color: var(--nx-text); }
    .filter { width: auto; min-width: 200px; height: 34px; }
    .push { margin-left: auto; flex: none; }
    .bo-alert { margin: 0; align-items: center; }
    .wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; min-width: 860px; }
    th { text-align: left; font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); padding: 9px 10px; border-bottom: 1px solid var(--nx-line); white-space: nowrap; }
    td { padding: 12px 10px; border-bottom: 1px solid var(--nx-line); font-size: 13px; color: var(--nx-text-mute); white-space: nowrap; }
    tr:last-child td { border-bottom: none; }
    .n { text-align: right; }
    .mono { font-family: var(--nx-font-mono); font-size: 12.5px; }
    .name { color: var(--nx-text); font-weight: 600; }
    a { color: var(--nx-orange-400); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .empty { margin: 0; padding: 18px 0; font-size: 12.5px; color: var(--nx-text-dim); }
    .skeleton { height: 96px; border-radius: var(--nx-r-3); background: var(--nx-surface-1); opacity: 0.6; }
    .lgpd { margin: 12px 0 0; font-size: 12px; line-height: 1.5; color: var(--nx-text-dim); }
  `,
})
export class ClubLeadsComponent {
  private readonly document = inject(DOCUMENT);

  readonly leads = input.required<readonly PartnerLead[]>();
  readonly loading = input(false);
  readonly error = input<string | null>(null);
  readonly retry = output<void>();

  protected readonly partnerId = signal<string | null>(null);
  protected readonly partnerOptions = computed(() => leadPartners(this.leads()));
  /** A lista já vem em `createdAt desc` do Firestore. */
  protected readonly visible = computed(() => filterLeads(this.leads(), this.partnerId()));

  protected readonly when = formatDateTime;
  protected readonly phone = formatWhatsapp;
  protected readonly wa = whatsappLink;
  protected readonly cep = formatCep;
  protected readonly place = cityState;
  protected readonly source = sourceLabel;

  protected onFilter(event: Event): void {
    this.partnerId.set((event.target as HTMLSelectElement).value || null);
  }

  protected exportCsv(): void {
    const slug = this.partnerId() ? `clube-leads-${this.partnerId()}` : 'clube-leads';
    downloadCsv(this.document, csvFileName(slug, new Date()), leadsCsv(this.visible()));
  }
}

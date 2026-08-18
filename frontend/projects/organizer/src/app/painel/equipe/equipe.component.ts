import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { AuthService } from '../../auth/auth.service';
import { NxSkeletonComponent } from '../../shared/loading/nx-skeleton.component';
import { NxSpinnerComponent } from '../../shared/loading/nx-spinner.component';
import { initialsOf } from '../data/mock-data';
import {
  TOURNAMENT_STAFF_ROLE_DESCRIPTION,
  TOURNAMENT_STAFF_ROLE_LABEL,
  addTournamentStaff,
  listTournamentStaff,
  removeTournamentStaff,
  searchStaffCandidates,
  staffDisplayName,
  updateTournamentStaffRole,
  type StaffCandidate,
  type TournamentStaffMember,
  type TournamentStaffRole,
} from '../data/staff-repository';
import type { OrganizerTournament } from '../data/tournament.model';
import { getTournament } from '../data/tournaments-repository';
import { OgAvatarComponent } from '../ui/avatar.component';
import { OgCardComponent } from '../ui/card.component';
import { OgChartTabsComponent } from '../ui/chart-tabs.component';
import { OgIconComponent } from '../ui/icon.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';
import { OgPillComponent } from '../ui/pill.component';

const ROLE_TONE: Record<TournamentStaffRole, 'orange' | 'green'> = { manager: 'orange', scorer: 'green' };
const ROLE_TAB: Record<TournamentStaffRole, string> = { manager: 'gestor', scorer: 'mesário' };
const ROLE_REF: { role: TournamentStaffRole }[] = [{ role: 'manager' }, { role: 'scorer' }];
const SEARCH_DEBOUNCE_MS = 350;
const SHORT_DATE = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });

/** Espelha `canManageTournamentStaff` em `firestore.rules`: gerenciam a equipe o dono do
 *  torneio e o super admin dando suporte a torneio alheio. Enquanto o torneio ou o usuário
 *  não resolveram, ninguém gerencia — a tela abre em leitura e só libera os botões depois. */
export function canManageTournamentStaff(params: {
  isSuperAdmin: boolean;
  uid: string | undefined;
  managerId: string | null | undefined;
}): boolean {
  const { isSuperAdmin, uid, managerId } = params;
  if (!uid || !managerId) return false;
  return isSuperAdmin || managerId === uid;
}

/** Quem a busca de candidato NÃO pode oferecer: quem já está na equipe, quem está buscando e
 *  o dono do torneio. O dono só entra nessa conta quando quem busca é o super admin — as
 *  rules recusam o dono como staff de si mesmo, e sem isso a tela ofereceria um nome que
 *  estoura em erro de permissão na hora de adicionar. */
export function staffCandidateExclusions(params: {
  memberUids: readonly string[];
  uid: string | undefined;
  managerId: string | null | undefined;
}): string[] {
  const { memberUids, uid, managerId } = params;
  return [...new Set([...memberUids, ...(uid ? [uid] : []), ...(managerId ? [managerId] : [])])];
}

/** Equipe do torneio em contexto (nível 2 da cascata) — gestores e mesários com acesso à
 *  operação, mesmo modelo do app (`organizer_tournament_staff_page.dart`):
 *  `tournaments/{id}/staff/{uid}`, só `manager`/`scorer`, adição direta sem convite/aceite
 *  (as rules só aceitam `status: 'active'` na escrita). Busca de candidato é por nome/apelido
 *  em `public_profiles` (mesmo índice `hasAthleteRole + keywords` do app) — não por e-mail.
 *  Dono do torneio e super admin gerenciam; os demais veem a lista em modo leitura. */
@Component({
  selector: 'og-equipe',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OgPageHeaderComponent, OgCardComponent, OgChartTabsComponent, OgIconComponent, OgPillComponent, OgAvatarComponent, NxSpinnerComponent, NxSkeletonComponent],
  template: `
    <og-page-header title="Equipe" [subtitle]="headerSubtitle()">
      @if (canManage()) {
        <button type="button" class="og-mini-btn og-mini-btn-primary" (click)="toggleAdd()">
          <og-icon name="plus" [size]="14" />
          {{ adding() ? 'Fechar' : 'Adicionar membro' }}
        </button>
      }
    </og-page-header>

    <div class="og-content">
      <div class="og-kpi-row">
        <og-card pad="sm" flex="1">
          <div class="og-kpi-label">Membros da equipe</div>
          <div class="og-kpi-value sm">{{ members().length }}</div>
        </og-card>
        <og-card pad="sm" flex="1">
          <div class="og-kpi-label">Gestores</div>
          <div class="og-kpi-value sm">{{ countOf('manager') }}</div>
        </og-card>
        <og-card pad="sm" flex="1">
          <div class="og-kpi-label">Mesários</div>
          <div class="og-kpi-value sm">{{ countOf('scorer') }}</div>
        </og-card>
      </div>

      @if (feedback(); as fb) {
        <div class="og-banner" [class.win]="fb.ok">{{ fb.message }}</div>
      }
      @if (!loading() && !canManage()) {
        <div class="og-banner">Somente o organizador do torneio pode gerenciar a equipe.</div>
      }

      @if (adding()) {
        <og-card kicker="Adicionar" title="Buscar membro" pad="lg">
          <input
            class="og-equipe-search"
            type="text"
            placeholder="Nome ou apelido cadastrado no nexaGO…"
            [value]="searchTerm()"
            (input)="onSearchInput($event)"
          />
          @if (searching()) {
            <div class="og-equipe-search-status"><app-nx-spinner [size]="13" /> Buscando…</div>
          } @else if (searchTerm().trim().length > 0 && searchTerm().trim().length < 2) {
            <p class="og-equipe-search-status">Digite ao menos 2 letras.</p>
          } @else if (searched() && candidates().length === 0 && !selectedCandidate()) {
            <p class="og-equipe-search-status">Nenhum atleta encontrado com esse nome.</p>
          }

          @if (candidates().length > 0 && !selectedCandidate()) {
            <div class="og-equipe-results">
              @for (c of candidates(); track c.uid) {
                <button type="button" class="og-equipe-result" (click)="selectCandidate(c)">
                  <og-avatar [initials]="initialsOf(nameOf(c))" [photoUrl]="c.photoUrl" [size]="30" />
                  <span>{{ nameOf(c) }}</span>
                </button>
              }
            </div>
          }

          @if (selectedCandidate(); as sel) {
            <div class="og-equipe-role-pick">
              <div class="og-equipe-role-pick-who">
                <!-- Conferir o rosto aqui é o último passo antes de dar acesso ao torneio.
                     Ainda é só um atleta cadastrado: o papel só existe depois de adicionar. -->
                <og-avatar
                  zoomable
                  [initials]="initialsOf(nameOf(sel))"
                  [personName]="nameOf(sel)"
                  [photoUrl]="sel.photoUrl"
                  [size]="30"
                />
                <span>{{ nameOf(sel) }}</span>
                <button type="button" class="og-ghost-btn" [disabled]="busy()" (click)="selectedCandidate.set(null)">Trocar</button>
              </div>
              <div class="og-filter-bar">
                <button type="button" class="og-chip" [class.active]="pickedRole() === 'manager'" (click)="pickedRole.set('manager')">Gestor</button>
                <button type="button" class="og-chip" [class.active]="pickedRole() === 'scorer'" (click)="pickedRole.set('scorer')">Mesário</button>
              </div>
              <div class="og-equipe-role-pick-actions">
                <button type="button" class="og-ghost-btn" [disabled]="busy()" (click)="toggleAdd()">Cancelar</button>
                <button type="button" class="og-mini-btn og-mini-btn-primary" [disabled]="busy()" (click)="confirmAdd()">
                  @if (busy()) {
                    <app-nx-spinner [size]="12" tone="dark" />
                  }
                  {{ busy() ? 'Adicionando…' : 'Adicionar à equipe' }}
                </button>
              </div>
            </div>
          }
        </og-card>
      }

      <div style="display:flex;gap:16px;flex:1;min-height:0">
        <div style="flex:1.7;display:flex;flex-direction:column;gap:12px;min-height:0">
          <og-chart-tabs [tabs]="tabs" [active]="tab()" (changed)="tab.set($event)" />
          <og-card pad="0" flex="1">
            <div class="og-table-head">
              <span style="flex:1.3">Membro</span>
              <span style="width:100px">Papel</span>
              <span style="width:90px">Desde</span>
              <span style="width:170px"></span>
            </div>
            <div class="og-table-body">
              @if (loading()) {
                @for (i of [1, 2, 3]; track i) {
                  <div class="og-row"><app-nx-skeleton w="100%" h="34px" /></div>
                }
              } @else {
                @for (m of filtered(); track m.uid) {
                  <div class="og-row" style="flex-wrap:wrap">
                    <og-avatar
                      zoomable
                      [initials]="initialsOf(nameOf(m))"
                      [personName]="nameOf(m)"
                      [personRole]="roleLabel[m.role]"
                      [meta]="'Na equipe desde ' + sinceOf(m)"
                      [photoUrl]="m.photoUrl"
                      [size]="34"
                    />
                    <span style="flex:1.3;min-width:0" class="og-equipe-name" [title]="nameOf(m)">{{ nameOf(m) }}</span>
                    <span style="width:100px"><og-pill [tone]="roleTone[m.role]">{{ roleLabel[m.role] }}</og-pill></span>
                    <span style="width:90px" class="og-equipe-since">{{ sinceOf(m) }}</span>
                    @if (canManage()) {
                      <button type="button" class="og-ghost-btn" (click)="toggleActions(m.uid)">{{ actionsFor() === m.uid ? 'Fechar' : 'Ações' }}</button>
                      @if (actionsFor() === m.uid) {
                        <div class="og-equipe-actions">
                          <span class="og-equipe-actions-label">Papel:</span>
                          <button type="button" class="og-chip" [class.active]="m.role === 'manager'" [disabled]="busy()" (click)="changeRole(m, 'manager')">Gestor</button>
                          <button type="button" class="og-chip" [class.active]="m.role === 'scorer'" [disabled]="busy()" (click)="changeRole(m, 'scorer')">Mesário</button>
                          <button type="button" class="og-ghost-btn danger" [disabled]="busy()" (click)="remove(m)">
                            @if (busyKey() === 'remove:' + m.uid) {
                              <app-nx-spinner [size]="12" />
                            }
                            {{ busyKey() === 'remove:' + m.uid ? 'Removendo…' : 'Remover da equipe' }}
                          </button>
                        </div>
                      }
                    }
                  </div>
                } @empty {
                  <p class="og-empty">Nenhum membro na equipe ainda.</p>
                }
              }
            </div>
          </og-card>
        </div>

        <div style="flex:1;display:flex;flex-direction:column;gap:16px;min-height:0">
          <og-card title="Papéis & permissões" kicker="Referência" pad="lg">
            @for (r of roleRefs; track r.role; let last = $last) {
              <div class="og-equipe-role-ref" [class.last]="last">
                <og-pill [tone]="roleTone[r.role]">{{ roleLabel[r.role] }}</og-pill>
                <div class="og-equipe-role-desc">{{ roleDesc[r.role] }}</div>
              </div>
            }
          </og-card>
          <og-card title="Como funciona" kicker="Adicionar membro" pad="lg">
            <p class="og-equipe-hint">
              Busque um atleta cadastrado no nexaGO pelo nome ou apelido e escolha o papel. O acesso é imediato — sem convite — e pode ser
              alterado ou revogado quando quiser. Quem entra como gestor também passa a conseguir entrar neste portal com a própria conta.
            </p>
          </og-card>
        </div>
      </div>
    </div>
  `,
  styles: `
    .og-equipe-name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13.5px;
      color: var(--nx-text);
    }
    .og-equipe-since {
      font-family: var(--nx-font-mono);
      font-size: 11px;
      color: var(--nx-text-dim);
    }
    .og-equipe-actions {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
      padding: 10px 0 4px 44px;
    }
    .og-equipe-actions-label {
      font-family: var(--nx-font-ui);
      font-size: 12px;
      color: var(--nx-text-dim);
    }
    .og-ghost-btn.danger {
      color: var(--nx-live);
    }
    .og-equipe-role-ref {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 13px 0;
      border-bottom: 1px solid var(--nx-line);
    }
    .og-equipe-role-ref.last {
      border-bottom: none;
      padding-bottom: 0;
    }
    .og-equipe-role-desc {
      font-family: var(--nx-font-ui);
      font-size: 12px;
      color: var(--nx-text-mute);
      line-height: 1.5;
    }
    .og-equipe-hint {
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-text-mute);
      line-height: 1.6;
      margin: 0;
    }
    .og-equipe-search {
      width: 100%;
      height: 38px;
      padding: 0 12px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 13px;
    }
    .og-equipe-search:focus {
      outline: 2px solid var(--nx-orange-500);
      outline-offset: 0;
    }
    .og-equipe-search-status {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 10px 0 0;
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-text-mute);
    }
    .og-equipe-results {
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin-top: 10px;
      max-height: 220px;
      overflow-y: auto;
    }
    .og-equipe-result {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px;
      border-radius: var(--nx-r-2);
      background: transparent;
      border: none;
      cursor: pointer;
      text-align: left;
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13px;
      color: var(--nx-text);
    }
    .og-equipe-result:hover {
      background: var(--nx-surface-1);
    }
    .og-equipe-role-pick {
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid var(--nx-line);
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .og-equipe-role-pick-who {
      display: flex;
      align-items: center;
      gap: 10px;
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13px;
      color: var(--nx-text);
    }
    .og-equipe-role-pick-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    }
  `,
})
export class EquipeComponent {
  private readonly auth = inject(AuthService);

  readonly id = input<string>('');

  protected readonly tabs = ['todos', 'gestor', 'mesário'];
  protected readonly tab = signal<string>('todos');
  protected readonly roleTone = ROLE_TONE;
  protected readonly roleLabel = TOURNAMENT_STAFF_ROLE_LABEL;
  protected readonly roleDesc = TOURNAMENT_STAFF_ROLE_DESCRIPTION;
  protected readonly roleRefs = ROLE_REF;
  protected readonly initialsOf = initialsOf;
  protected readonly nameOf = staffDisplayName;

  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly busyKey = signal<string | null>(null);
  protected readonly actionsFor = signal<string | null>(null);
  protected readonly feedback = signal<{ ok: boolean; message: string } | null>(null);
  protected readonly tournament = signal<OrganizerTournament | null>(null);
  protected readonly members = signal<TournamentStaffMember[]>([]);

  protected readonly adding = signal(false);
  protected readonly searchTerm = signal('');
  protected readonly searching = signal(false);
  protected readonly searched = signal(false);
  protected readonly candidates = signal<StaffCandidate[]>([]);
  protected readonly selectedCandidate = signal<StaffCandidate | null>(null);
  protected readonly pickedRole = signal<TournamentStaffRole>('manager');

  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly canManage = computed(() =>
    canManageTournamentStaff({
      isSuperAdmin: this.auth.isSuperAdmin(),
      uid: this.auth.user()?.uid,
      managerId: this.tournament()?.managerId,
    }),
  );

  protected readonly headerSubtitle = computed(() => {
    const t = this.tournament();
    if (!t) return '';
    const n = this.members().length;
    return `${t.name} · ${n} membro${n === 1 ? '' : 's'}`;
  });

  protected readonly filtered = computed(() => {
    const tab = this.tab();
    return this.members().filter((m) => tab === 'todos' || ROLE_TAB[m.role] === tab);
  });

  constructor() {
    effect(() => {
      const tid = this.id();
      this.tournament.set(null);
      this.members.set([]);
      this.adding.set(false);
      this.tab.set('todos');
      if (!tid) {
        this.loading.set(false);
        return;
      }
      this.loading.set(true);
      void this.load(tid);
    });
  }

  private async load(tid: string): Promise<void> {
    try {
      const [tournament, members] = await Promise.all([getTournament(tid), listTournamentStaff(tid)]);
      this.tournament.set(tournament);
      this.members.set(members);
    } catch (e) {
      this.feedback.set({ ok: false, message: (e as Error).message || 'Não foi possível carregar a equipe.' });
      this.members.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  protected countOf(role: TournamentStaffRole): number {
    return this.members().filter((m) => m.role === role).length;
  }

  protected sinceOf(m: TournamentStaffMember): string {
    return m.addedAt ? SHORT_DATE.format(m.addedAt) : '—';
  }

  protected toggleActions(uid: string): void {
    this.actionsFor.update((cur) => (cur === uid ? null : uid));
  }

  protected toggleAdd(): void {
    this.adding.update((cur) => !cur);
    this.searchTerm.set('');
    this.searched.set(false);
    this.candidates.set([]);
    this.selectedCandidate.set(null);
    this.pickedRole.set('manager');
  }

  protected onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchTerm.set(value);
    this.selectedCandidate.set(null);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    const term = value.trim();
    if (term.length < 2) {
      this.candidates.set([]);
      this.searched.set(false);
      return;
    }
    this.searchTimer = setTimeout(() => void this.runSearch(term), SEARCH_DEBOUNCE_MS);
  }

  private async runSearch(term: string): Promise<void> {
    const tid = this.id();
    if (!tid) return;
    this.searching.set(true);
    try {
      const excluded = staffCandidateExclusions({
        memberUids: this.members().map((m) => m.uid),
        uid: this.auth.user()?.uid,
        managerId: this.tournament()?.managerId,
      });
      const results = await searchStaffCandidates(term, excluded);
      this.candidates.set(results);
    } finally {
      this.searching.set(false);
      this.searched.set(true);
    }
  }

  protected selectCandidate(c: StaffCandidate): void {
    this.selectedCandidate.set(c);
  }

  protected async confirmAdd(): Promise<void> {
    const tid = this.id();
    const candidate = this.selectedCandidate();
    const uid = this.auth.user()?.uid;
    if (!tid || !candidate || !uid || this.busy()) return;
    this.busy.set(true);
    this.feedback.set(null);
    try {
      await addTournamentStaff(tid, uid, candidate, this.pickedRole());
      this.feedback.set({ ok: true, message: `${this.nameOf(candidate)} adicionado(a) como ${this.roleLabel[this.pickedRole()].toLowerCase()}.` });
      this.toggleAdd();
      this.loading.set(true);
      await this.load(tid);
    } catch (e) {
      this.feedback.set({ ok: false, message: (e as Error).message || 'Não foi possível adicionar o membro.' });
    } finally {
      this.busy.set(false);
    }
  }

  private async run(key: string, action: () => Promise<unknown>, okMessage: string): Promise<void> {
    this.busy.set(true);
    this.busyKey.set(key);
    this.feedback.set(null);
    try {
      await action();
      this.feedback.set({ ok: true, message: okMessage });
      this.actionsFor.set(null);
      const tid = this.id();
      if (tid) {
        this.loading.set(true);
        await this.load(tid);
      }
    } catch (e) {
      this.feedback.set({ ok: false, message: (e as Error).message || 'Operação falhou.' });
    } finally {
      this.busy.set(false);
      this.busyKey.set(null);
    }
  }

  protected changeRole(m: TournamentStaffMember, role: TournamentStaffRole): void {
    if (m.role === role || this.busy()) return;
    void this.run(`role:${m.uid}`, () => updateTournamentStaffRole(this.id(), m.uid, role), `Papel de ${this.nameOf(m)} atualizado para ${this.roleLabel[role].toLowerCase()}.`);
  }

  protected remove(m: TournamentStaffMember): void {
    if (!confirm(`Remover ${this.nameOf(m)} da equipe? A pessoa perde o acesso à operação deste torneio.`)) return;
    void this.run(`remove:${m.uid}`, () => removeTournamentStaff(this.id(), m.uid), `${this.nameOf(m)} removido(a) da equipe.`);
  }
}

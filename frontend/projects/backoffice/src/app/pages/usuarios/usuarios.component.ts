import { Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { AuthService } from '../../core/auth/auth.service';
import {
  type AppRole,
  type BackofficeUserRow,
  type GetUserRoleResponse,
  UsersAdminService,
} from '../../core/users/users-admin.service';

function firebaseErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err) {
    const e = err as { code?: string; message?: unknown };
    const code = String(e.code);
    const msg = typeof e.message === 'string' ? e.message : '';
    if (code === 'functions/permission-denied') {
      return 'Permissão negada.';
    }
    if (code === 'functions/unauthenticated') {
      return 'Sessão expirada. Entre novamente.';
    }
    if (code === 'functions/invalid-argument' || code === 'functions/failed-precondition') {
      return msg || 'Dados inválidos.';
    }
    if (code === 'functions/already-exists') {
      return msg || 'Já existe registro com estes dados.';
    }
    if (msg) {
      return msg;
    }
  }
  if (err instanceof Error) {
    return err.message;
  }
  return 'Não foi possível concluir a operação.';
}

const ROLE_LABEL: Record<AppRole, string> = {
  admin: 'Organizador (plataforma)',
  organizer: 'Gestor de torneios',
  athlete: 'Atleta',
  arena: 'Gestor de arena',
};

@Component({
  selector: 'app-usuarios',
  imports: [ReactiveFormsModule],
  templateUrl: './usuarios.component.html',
})
export class UsuariosComponent {
  protected readonly auth = inject(AuthService);
  private readonly usersAdmin = inject(UsersAdminService);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly rows = signal<BackofficeUserRow[]>([]);
  protected readonly nextPageToken = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly loadingMore = signal(false);
  protected readonly pageError = signal<string | null>(null);

  protected readonly selected = signal<BackofficeUserRow | null>(null);
  protected readonly detail = signal<GetUserRoleResponse | null>(null);
  protected readonly detailLoading = signal(false);
  protected readonly detailError = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);
  protected readonly actionBusy = signal(false);

  protected readonly showOrganizerModal = signal(false);
  protected readonly showArenaModal = signal(false);
  protected readonly showSetRolesModal = signal(false);

  protected readonly organizerForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    fullName: ['', [Validators.required, Validators.minLength(2)]],
    temporaryPassword: ['', [Validators.required, Validators.minLength(6)]],
  });

  protected readonly arenaForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    fullName: ['', [Validators.required, Validators.minLength(2)]],
    temporaryPassword: ['', [Validators.required, Validators.minLength(6)]],
    arenaName: ['Minha Arena'],
  });

  protected readonly setRolesForm = this.fb.group({
    admin: [false],
    organizer: [false],
    athlete: [false],
    arena: [false],
  });

  protected readonly ROLE_LABEL = ROLE_LABEL;
  protected readonly allRoles: AppRole[] = ['admin', 'organizer', 'athlete', 'arena'];

  protected readonly hasSelection = computed(() => this.selected() !== null);

  /** Texto enviado ao servidor; a busca percorre todos os usuários no Firebase Auth (com debounce). */
  protected readonly searchQuery = signal('');

  private searchDebounceId?: ReturnType<typeof setTimeout>;

  constructor() {
    void this.reloadFromStart();
  }

  protected onSearchInput(ev: Event): void {
    const v = (ev.target as HTMLInputElement).value;
    this.searchQuery.set(v);
    globalThis.clearTimeout(this.searchDebounceId);
    this.searchDebounceId = globalThis.setTimeout(() => void this.reloadFromStart(), 400);
  }

  protected roleLabel(r: string): string {
    return r in ROLE_LABEL ? ROLE_LABEL[r as AppRole] : r;
  }

  private async reloadFromStart(): Promise<void> {
    this.loading.set(true);
    this.pageError.set(null);
    this.rows.set([]);
    this.nextPageToken.set(null);
    try {
      const q = this.searchQuery().trim();
      const res = await this.usersAdmin.listUsers(50, undefined, q || undefined);
      this.rows.set(res.users);
      this.nextPageToken.set(res.nextPageToken);
    } catch (e) {
      this.pageError.set(firebaseErrorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected async loadMore(): Promise<void> {
    const token = this.nextPageToken();
    if (!token) {
      return;
    }
    this.loadingMore.set(true);
    this.pageError.set(null);
    try {
      const q = this.searchQuery().trim();
      const res = await this.usersAdmin.listUsers(50, token, q || undefined);
      this.rows.update((list) => [...list, ...res.users]);
      this.nextPageToken.set(res.nextPageToken);
    } catch (e) {
      this.pageError.set(firebaseErrorMessage(e));
    } finally {
      this.loadingMore.set(false);
    }
  }

  protected selectUser(row: BackofficeUserRow): void {
    this.selected.set(row);
    this.detail.set(null);
    this.detailError.set(null);
    void this.refreshDetail(row.uid);
  }

  protected clearSelection(): void {
    this.selected.set(null);
    this.detail.set(null);
    this.detailError.set(null);
  }

  protected async refreshDetail(uid: string): Promise<void> {
    this.detailLoading.set(true);
    this.detailError.set(null);
    try {
      const d = await this.usersAdmin.getUserRole(uid);
      this.detail.set(d);
    } catch (e) {
      this.detailError.set(firebaseErrorMessage(e));
    } finally {
      this.detailLoading.set(false);
    }
  }

  protected canAddRole(role: AppRole): boolean {
    const sup = this.auth.isSuperAdmin();
    if (sup) {
      return true;
    }
    const plat = this.auth.hasRole('admin');
    if (plat && role === 'organizer') {
      return true;
    }
    return role === 'athlete';
  }

  protected canRemoveRole(role: AppRole): boolean {
    const row = this.selected();
    if (!row) {
      return false;
    }
    const sup = this.auth.isSuperAdmin();
    const self = this.auth.user()?.uid === row.uid;
    if (self && (role === 'admin' || role === 'arena' || role === 'organizer')) {
      return false;
    }
    if (!sup && (role === 'admin' || role === 'arena')) {
      return false;
    }
    if (!sup && !this.auth.hasRole('admin') && role === 'organizer') {
      return false;
    }
    return true;
  }

  protected async addRole(role: AppRole): Promise<void> {
    const row = this.selected();
    if (!row || !this.canAddRole(role)) {
      return;
    }
    this.actionBusy.set(true);
    this.actionError.set(null);
    try {
      await this.usersAdmin.addUserRole(row.uid, role);
      await this.reloadFromStart();
      const updated = this.rows().find((r) => r.uid === row.uid);
      if (updated) {
        this.selected.set(updated);
      }
      await this.refreshDetail(row.uid);
    } catch (e) {
      this.actionError.set(firebaseErrorMessage(e));
    } finally {
      this.actionBusy.set(false);
    }
  }

  protected async removeRole(role: AppRole): Promise<void> {
    const row = this.selected();
    if (!row || !this.canRemoveRole(role)) {
      return;
    }
    if (!globalThis.confirm(`Remover o papel "${this.roleLabel(role)}" deste usuário?`)) {
      return;
    }
    this.actionBusy.set(true);
    this.actionError.set(null);
    try {
      await this.usersAdmin.removeUserRole(row.uid, role);
      await this.reloadFromStart();
      const updated = this.rows().find((r) => r.uid === row.uid);
      if (updated) {
        this.selected.set(updated);
      }
      await this.refreshDetail(row.uid);
    } catch (e) {
      this.actionError.set(firebaseErrorMessage(e));
    } finally {
      this.actionBusy.set(false);
    }
  }

  protected openSetRolesModal(): void {
    const d = this.detail();
    if (!d) {
      return;
    }
    this.setRolesForm.patchValue({
      admin: d.roles.includes('admin'),
      organizer: d.roles.includes('organizer'),
      athlete: d.roles.includes('athlete'),
      arena: d.roles.includes('arena'),
    });
    this.showOrgFormsCloseOthers('setRoles');
  }

  private showOrgFormsCloseOthers(which: 'organizer' | 'arena' | 'setRoles'): void {
    this.showOrganizerModal.set(which === 'organizer');
    this.showArenaModal.set(which === 'arena');
    this.showSetRolesModal.set(which === 'setRoles');
  }

  protected openOrganizerModal(): void {
    this.organizerForm.reset({ email: '', fullName: '', temporaryPassword: '' });
    this.showOrgFormsCloseOthers('organizer');
  }

  protected openArenaModal(): void {
    this.arenaForm.reset({ email: '', fullName: '', temporaryPassword: '', arenaName: 'Minha Arena' });
    this.showOrgFormsCloseOthers('arena');
  }

  protected closeModals(): void {
    this.showOrganizerModal.set(false);
    this.showArenaModal.set(false);
    this.showSetRolesModal.set(false);
  }

  protected async submitOrganizer(): Promise<void> {
    if (this.organizerForm.invalid) {
      this.organizerForm.markAllAsTouched();
      return;
    }
    const v = this.organizerForm.getRawValue();
    this.actionBusy.set(true);
    this.actionError.set(null);
    try {
      await this.usersAdmin.createOrganizer(v.email, v.fullName, v.temporaryPassword);
      this.closeModals();
      await this.reloadFromStart();
    } catch (e) {
      this.actionError.set(firebaseErrorMessage(e));
    } finally {
      this.actionBusy.set(false);
    }
  }

  protected async submitArena(): Promise<void> {
    if (this.arenaForm.invalid) {
      this.arenaForm.markAllAsTouched();
      return;
    }
    const v = this.arenaForm.getRawValue();
    this.actionBusy.set(true);
    this.actionError.set(null);
    try {
      await this.usersAdmin.createArena(v.email, v.fullName, v.temporaryPassword, v.arenaName || undefined);
      this.closeModals();
      await this.reloadFromStart();
    } catch (e) {
      this.actionError.set(firebaseErrorMessage(e));
    } finally {
      this.actionBusy.set(false);
    }
  }

  protected async submitSetRoles(): Promise<void> {
    const row = this.selected();
    if (!row) {
      return;
    }
    const v = this.setRolesForm.getRawValue();
    const roles: AppRole[] = [];
    if (v.admin) {
      roles.push('admin');
    }
    if (v.organizer) {
      roles.push('organizer');
    }
    if (v.athlete) {
      roles.push('athlete');
    }
    if (v.arena) {
      roles.push('arena');
    }
    if (roles.length === 0) {
      this.actionError.set('Selecione ao menos um papel.');
      return;
    }
    this.actionBusy.set(true);
    this.actionError.set(null);
    try {
      await this.usersAdmin.setUserRoles(row.uid, roles);
      this.closeModals();
      await this.reloadFromStart();
      const updated = this.rows().find((r) => r.uid === row.uid);
      if (updated) {
        this.selected.set(updated);
      }
      await this.refreshDetail(row.uid);
    } catch (e) {
      this.actionError.set(firebaseErrorMessage(e));
    } finally {
      this.actionBusy.set(false);
    }
  }
}

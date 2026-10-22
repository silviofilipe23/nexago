import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { CenterContextService } from '../../core/center-context.service';
import { TeamActions } from '../../data/actions/team.actions';
import { writeErrorMessage } from '../../data/actions/actor';
import { CenterStore } from '../../data/center-store.service';
import { formatDayKey, formatInstant, wallClock } from '../../domain/dates';
import type { CenterMember } from '../../domain/models';
import { canManageMember, invitableRoles, PERMISSION_LABELS, ROLE_LABELS, type CenterPermission, type CenterRole } from '../../domain/roles';
import { IconComponent } from '../../ui/icon.component';
import { BannerComponent, ModalComponent, PageHeaderComponent, PersonComponent, ToggleComponent } from '../../ui/kit';
import { InviteModalComponent } from './invite-modal.component';
import { buildTeamRows, MEMBER_STATUS, permissionView, teamSummary, toggleExtra, type TeamRow } from './members.utils';

const ROLE_TONE: Record<CenterRole, string> = { center_owner: 'orange', center_admin: 'green', coach: 'blue', receptionist: '' };

@Component({
  selector: 'ct-members',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, PageHeaderComponent, PersonComponent, BannerComponent, ToggleComponent, ModalComponent, InviteModalComponent],
  templateUrl: './members.component.html',
  styles: `
    .body { padding: 20px var(--ct-gutter) 26px; display: flex; flex-direction: column; gap: 16px; }
    .perm { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-top: 1px solid var(--nx-line); font-size: 12.5px; color: var(--nx-text-dim); }
    .perm.on { color: var(--nx-text); }
    .ct-kick.sec { margin: 16px 0 4px; }
    .ct-card > p { margin: 0; }
    button.ct-tr { color: var(--nx-text-mute); }
  `,
})
export class MembersComponent {
  readonly centerId = input.required<string>();

  protected readonly ctx = inject(CenterContextService);
  protected readonly store = inject(CenterStore);
  private readonly team = inject(TeamActions);

  protected readonly roleLabels = ROLE_LABELS;
  protected readonly roleTone = ROLE_TONE;
  protected readonly statusLabel = MEMBER_STATUS;
  protected readonly permLabels = PERMISSION_LABELS;

  private readonly tz = computed(() => this.ctx.center()?.timezone ?? 'America/Sao_Paulo');
  protected readonly rows = computed(() => buildTeamRows(this.store.members(), this.store.invites()));
  protected readonly summary = computed(() => teamSummary(this.store.members()));
  protected readonly canInvite = computed(() => this.ctx.isManager() && this.ctx.canWrite() && invitableRoles(this.ctx.me()).length > 0);

  protected readonly selectedKey = signal<string | null>(null);
  private readonly selectEmail = signal<string | null>(null);
  protected readonly selected = computed<TeamRow | null>(() => {
    const rows = this.rows();
    const key = this.selectedKey();
    if (key) {
      return rows.find((r) => r.key === key) ?? null;
    }
    const email = this.selectEmail();
    return email ? (rows.find((r) => r.kind === 'invite' && r.email.toLowerCase() === email) ?? null) : null;
  });

  /** Pode mexer na pessoa selecionada (papel, situação, e nunca em si mesmo). */
  protected readonly canManageSelected = computed(() => {
    const r = this.selected();
    const me = this.ctx.me();
    if (!r || !me || !this.ctx.canWrite() || (r.kind === 'member' && r.member.uid === me.uid)) {
      return false;
    }
    return canManageMember(me, r.role);
  });

  /** Valor otimista enquanto a escrita roda (o toggle não volta sozinho se falhar). */
  private readonly pendingExtras = signal<{ uid: string; perms: CenterPermission[] } | null>(null);
  protected readonly perms = computed(() => {
    const r = this.selected();
    if (!r || r.kind !== 'member') {
      return [];
    }
    const pending = this.pendingExtras();
    const extras = pending && pending.uid === r.member.uid ? pending.perms : r.member.extraPerms;
    return permissionView(r.role, extras);
  });

  protected readonly selectedPrograms = computed(() => this.programNames(this.selected()?.programIds ?? []));
  protected readonly selectedClasses = computed(() => {
    const r = this.selected();
    if (!r || r.kind !== 'member') {
      return [];
    }
    return this.store.classes().filter((c) => c.coachUid === r.member.uid && (c.status === 'active' || c.status === 'draft')).map((c) => c.name);
  });

  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly inviteOpen = signal(false);
  protected readonly revokeOpen = signal(false);
  protected readonly revokeReason = signal('');
  protected readonly revokeError = signal('');
  protected readonly confirmCancel = signal(false);

  protected programNames(ids: string[]): string {
    const names = ids.map((id) => this.store.programById(id)?.name).filter(Boolean);
    return names.length ? names.join(', ') : '';
  }

  protected extrasShort(r: TeamRow): string {
    if (r.kind !== 'member' || r.member.extraPerms.length === 0) {
      return '';
    }
    return '+' + r.member.extraPerms.length + (r.member.extraPerms.length === 1 ? ' permissão extra' : ' permissões extras');
  }

  protected day(at: Date | null): string {
    return at ? formatDayKey(wallClock(at, this.tz()).dayKey, true) : '—';
  }

  protected instant(at: Date | null): string {
    return formatInstant(at, this.tz());
  }

  protected select(key: string): void {
    this.selectedKey.set(key);
    this.selectEmail.set(null);
    this.error.set('');
    this.confirmCancel.set(false);
  }

  protected onInvited(email: string): void {
    this.inviteOpen.set(false);
    this.selectedKey.set(null);
    this.selectEmail.set(email);
  }

  protected async togglePerm(perm: CenterPermission, on: boolean): Promise<void> {
    const r = this.selected();
    if (!r || r.kind !== 'member' || !this.canManageSelected() || this.busy()) {
      return;
    }
    const member: CenterMember = r.member;
    const next = toggleExtra(member.role, member.extraPerms, perm, on);
    this.busy.set(true);
    this.error.set('');
    this.pendingExtras.set({ uid: member.uid, perms: next });
    try {
      await this.team.updatePermissions(member, next);
    } catch (err) {
      this.error.set(writeErrorMessage(err));
    } finally {
      this.pendingExtras.set(null);
      this.busy.set(false);
    }
  }

  protected openRevoke(): void {
    this.revokeReason.set('');
    this.revokeError.set('');
    this.revokeOpen.set(true);
  }

  protected closeRevoke(): void {
    if (!this.busy()) {
      this.revokeOpen.set(false);
    }
  }

  protected async revoke(): Promise<void> {
    const r = this.selected();
    if (!r || r.kind !== 'member' || !this.canManageSelected() || this.busy()) {
      return;
    }
    const reason = this.revokeReason().trim();
    if (reason.length < 3) {
      this.revokeError.set('Conte o motivo — fica na trilha de auditoria.');
      return;
    }
    this.busy.set(true);
    this.revokeError.set('');
    try {
      await this.team.revoke(r.member, reason);
      this.revokeOpen.set(false);
    } catch (err) {
      this.revokeError.set(writeErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }

  protected async cancelInvite(): Promise<void> {
    const r = this.selected();
    if (!r || r.kind !== 'invite' || !this.canManageSelected() || this.busy()) {
      return;
    }
    if (!this.confirmCancel()) {
      this.confirmCancel.set(true);
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      await this.team.cancelInvite(r.invite);
      this.selectedKey.set(null);
      this.selectEmail.set(null);
    } catch (err) {
      this.error.set(writeErrorMessage(err));
    } finally {
      this.confirmCancel.set(false);
      this.busy.set(false);
    }
  }

  protected inputValue(ev: Event): string {
    return (ev.target as HTMLTextAreaElement).value;
  }
}

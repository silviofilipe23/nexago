import { Injectable } from '@angular/core';
import { httpsCallable, type HttpsCallable } from 'firebase/functions';

import { firebaseFunctions } from '../../firebase';

export type AppRole = 'admin' | 'organizer' | 'athlete' | 'arena';

export interface BackofficeUserRow {
  uid: string;
  email: string | null;
  displayName: string | null;
  disabled: boolean;
  emailVerified: boolean;
  roles: AppRole[];
  role: string | null;
  fullName: string | null;
}

export interface ListBackofficeUsersResponse {
  users: BackofficeUserRow[];
  nextPageToken: string | null;
}

export interface GetUserRoleResponse {
  roles: AppRole[];
  role: string | null;
}

function callable<TReq extends Record<string, unknown>, TRes>(name: string): HttpsCallable<TReq, TRes> {
  return httpsCallable(firebaseFunctions, name);
}

@Injectable({ providedIn: 'root' })
export class UsersAdminService {
  private readonly listBackofficeUsersFn = callable<
    { maxResults?: number; pageToken?: string; search?: string },
    ListBackofficeUsersResponse
  >('listBackofficeUsers');

  private readonly getUserRoleFn = callable<{ uid: string }, GetUserRoleResponse>('getUserRole');

  private readonly addUserRoleFn = callable<{ uid: string; role: string }, { success: boolean; roles: string[] }>(
    'addUserRole',
  );

  private readonly removeUserRoleFn = callable<{ uid: string; role: string }, { success: boolean; roles: string[] }>(
    'removeUserRole',
  );

  private readonly setUserRolesFn = callable<{ uid: string; roles: string[] }, { success: boolean; roles: string[] }>(
    'setUserRoles',
  );

  private readonly createOrganizerFn = callable<
    { email: string; fullName: string; temporaryPassword: string },
    { uid: string; email: string }
  >('createOrganizer');

  private readonly createArenaFn = callable<
    { email: string; fullName: string; temporaryPassword: string; arenaName?: string },
    { uid: string; email: string; arenaId: string }
  >('createArena');

  listUsers(maxResults = 50, pageToken?: string, search?: string): Promise<ListBackofficeUsersResponse> {
    const s = search?.trim();
    return this.listBackofficeUsersFn({
      maxResults,
      ...(pageToken ? { pageToken } : {}),
      ...(s ? { search: s } : {}),
    }).then((r) => r.data);
  }

  getUserRole(uid: string): Promise<GetUserRoleResponse> {
    return this.getUserRoleFn({ uid }).then((r) => r.data);
  }

  addUserRole(uid: string, role: AppRole): Promise<{ success: boolean; roles: string[] }> {
    return this.addUserRoleFn({ uid, role }).then((r) => r.data);
  }

  removeUserRole(uid: string, role: AppRole): Promise<{ success: boolean; roles: string[] }> {
    return this.removeUserRoleFn({ uid, role }).then((r) => r.data);
  }

  setUserRoles(uid: string, roles: AppRole[]): Promise<{ success: boolean; roles: string[] }> {
    return this.setUserRolesFn({ uid, roles }).then((r) => r.data);
  }

  createOrganizer(email: string, fullName: string, temporaryPassword: string): Promise<{ uid: string; email: string }> {
    return this.createOrganizerFn({ email, fullName, temporaryPassword }).then((r) => r.data);
  }

  createArena(
    email: string,
    fullName: string,
    temporaryPassword: string,
    arenaName?: string,
  ): Promise<{ uid: string; email: string; arenaId: string }> {
    return this.createArenaFn({ email, fullName, temporaryPassword, ...(arenaName ? { arenaName } : {}) }).then(
      (r) => r.data,
    );
  }
}

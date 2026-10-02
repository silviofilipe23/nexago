import { Injectable } from '@angular/core';
import { resizeImageToJpeg } from '../data/image-resize';
import { ORGANIZER_COVER_MAX_WIDTH, type OrganizerPublicProfilePatch } from '../data/organizer-public-profile';
import { saveOrganizerPublicProfile, uploadOrganizerCover } from '../data/organizer-settings-repository';

/** Costura entre o card "Perfil público" e o navegador/Firebase (canvas, Storage, Firestore).
 *
 *  Existe só para o spec do card trocar por um dublê: as outras telas do painel importam o
 *  repositório como função de módulo, e isso não dá para substituir no TestBed. */
@Injectable({ providedIn: 'root' })
export class OrganizerPublicProfileGateway {
  /** Redimensiona para 1600 px de largura e devolve JPEG. */
  prepareCover(file: Blob): Promise<Blob> {
    return resizeImageToJpeg(file, ORGANIZER_COVER_MAX_WIDTH);
  }

  uploadCover(uid: string, jpeg: Blob): Promise<string> {
    return uploadOrganizerCover(uid, jpeg);
  }

  save(uid: string, patch: OrganizerPublicProfilePatch): Promise<void> {
    return saveOrganizerPublicProfile(uid, patch);
  }
}

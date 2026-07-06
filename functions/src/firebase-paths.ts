/**
 * Helpers de projeto/paths do Firestore compartilhados — única fonte para os
 * caminhos legados sob `artifacts/{projectId}/public/data`.
 */

export function getFirebaseProjectId(): string {
  return process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT ||
    "volley-track-2dd3b";
}

export function artifactsPublicDataBase(projectId: string = getFirebaseProjectId()): string {
  return `artifacts/${projectId}/public/data`;
}

export function artifactsTeamsPath(projectId: string = getFirebaseProjectId()): string {
  return `${artifactsPublicDataBase(projectId)}/teams`;
}

export function artifactsMatchesPath(projectId: string = getFirebaseProjectId()): string {
  return `${artifactsPublicDataBase(projectId)}/matches`;
}

export function artifactsInscriptionsPath(projectId: string = getFirebaseProjectId()): string {
  return `${artifactsPublicDataBase(projectId)}/inscriptions`;
}

export function artifactsTournamentsPath(projectId: string = getFirebaseProjectId()): string {
  return `${artifactsPublicDataBase(projectId)}/tournaments`;
}

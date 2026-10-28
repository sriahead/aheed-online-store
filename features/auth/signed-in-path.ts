/**
 * Where the sign-in controls send a user once Better Auth accepts them (#1319). `/signed-in`
 * chooses the landing for the user's role; `next` is forwarded for that page to vet, never followed
 * here.
 */
export function signedInPath(next?: string): string {
  return next ? `/signed-in?next=${encodeURIComponent(next)}` : "/signed-in";
}

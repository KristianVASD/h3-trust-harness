/** Shared access-token bridge so api.ts / api-extra.ts can attach JWT. */

let getToken: (() => string | null) | null = null;

export function setAccessTokenGetter(fn: () => string | null) {
  getToken = fn;
}

export function getAccessToken(): string | null {
  return getToken?.() ?? null;
}

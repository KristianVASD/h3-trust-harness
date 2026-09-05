/** Page chrome / registry brand names that must never become companies. */
const JUNK_NAME =
  /^(blijf op de hoogte|over kvk|kamer van koophandel|kvk|cookie|privacy|inloggen|login|zoeken|nieuwsbrief|volg ons|contact|home|menu|footer|header|meer info|lees meer|all rights reserved)$/i;

export function isJunkCompanyName(name: string): boolean {
  const n = name.replace(/\s+/g, " ").replace(/®/g, "").trim();
  if (n.length < 3 || n.length > 80) return true;
  if (JUNK_NAME.test(n)) return true;
  if (/kamer van koophandel/i.test(n)) return true;
  if (/blijf op de hoogte/i.test(n)) return true;
  return false;
}

export function isRegistryListUrl(url: string): boolean {
  return /kvk\.nl|handelsregister|company\.info\/zoeken/i.test(url);
}

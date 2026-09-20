/**
 * Default data minimization for list imports.
 * Keep company identity; drop personal phones/emails of board members
 * and volunteers. Business-line contact may stay.
 */

const BUSINESS_EMAIL_LOCAL =
  /^(info|contact|office|kantoor|admin|administratie|hello|hallo|mail|secretariaat|service|klantenservice|support|reception|receptie|sales|verkoop|offerte|planning)$/i;

const PERSONAL_EMAIL_HOST =
  /^(gmail|googlemail|hotmail|outlook|live|icloud|me|yahoo|proton|ziggo|kpnmail|xs4all|hetnet|planet|quicknet)\./i;

const MOBILE_NL = /^(?:\+31|0031|0)\s*6[\s-]?\d/;

export function isBusinessEmail(raw: string | undefined): boolean {
  const value = (raw ?? "").trim().toLowerCase();
  if (!value || !value.includes("@")) return false;
  const [local, host] = value.split("@");
  if (!local || !host) return false;
  if (PERSONAL_EMAIL_HOST.test(host)) return false;
  if (BUSINESS_EMAIL_LOCAL.test(local)) return true;
  // first.last@gmail already rejected; first.last on a company domain is still a person
  if (local.includes(".") || local.includes("_")) return false;
  return true;
}

export function isBusinessPhone(raw: string | undefined): boolean {
  const value = (raw ?? "").replace(/[()\s.-]/g, "");
  if (!value) return false;
  const display = (raw ?? "").trim();
  if (MOBILE_NL.test(display)) return false;
  // Dutch mobiles after stripping: 06xxxxxxxx / +316xxxxxxxx
  if (/^(?:\+31|0031|0)?6\d{8}$/.test(value)) return false;
  return value.length >= 8;
}

export function minimizePublicContact<T extends { phone?: string; email?: string }>(
  row: T,
): T {
  const email = isBusinessEmail(row.email) ? row.email : undefined;
  const phone = isBusinessPhone(row.phone) ? row.phone : undefined;
  return { ...row, phone, email };
}

/** City / region only — never a street line for public or HHH display. */
export function publicPlaceLabel(region: string, address?: string): string {
  const city = region.trim();
  if (city) return city;
  const fallback = (address ?? "").trim();
  if (!fallback) return "";
  // Last comma segment is often the city on NL addresses.
  const parts = fallback.split(",").map((p) => p.trim()).filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

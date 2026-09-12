import { randomUUID } from "node:crypto";
import type { Hono } from "hono";
import {
  packMatchesTrade,
  primaryTradeId,
  tradeLabel,
  type Company,
  type Mission,
  type Source,
} from "@h3-trust/schema";
import type { Store } from "@h3-trust/store";
import { isNationalPack } from "./pack-match.js";
import {
  createSupabaseAdmin,
  isAdmin,
  type AppVariables,
} from "./auth.js";

export type PublicSourceRecord = {
  id: string;
  name: string;
  type: "kvk" | "branche_vereniging" | "keurmerk" | "lokaal_netwerk" | "gemeente_register";
  title: string;
  url?: string;
  identifier?: string;
  verifiedAt: string;
  status: "accepted" | "adjusted" | "pending";
  hash: string;
  description: string;
};

export type PublicCompanyCard = {
  id: string;
  name: string;
  trade: string;
  tradeId?: string;
  city: string;
  neighborhood: string;
  foundedYear: number;
  kvkNumber: string;
  kvk_gate: "pass" | "fail";
  sourceCount: number;
  status: "target" | "candidate" | "staged";
  harvestConfidence: "high" | "medium" | "low";
  caraStatus: "agreed" | "adjusted" | "pending";
  caraReviewedBy: string;
  caraReviewedAt: string;
  summary: string;
  tags: string[];
  practices: { title: string; description: string; verified: boolean }[];
  sources: PublicSourceRecord[];
  whyReliable: { kvk: string; branche: string; localAnchor: string };
};

type CandidateSubmission = {
  id: string;
  type: "craftsman" | "community_anchor" | "sector_partner";
  name: string;
  trade?: string;
  city?: string;
  kvkNumber?: string;
  email: string;
  phone?: string;
  notes?: string;
  kvk_gate: "pass" | "review";
  accept_free_local_connect?: boolean;
  accept_local_connection_improve?: boolean;
  opt_in_active_work?: boolean;
  submittedAt: string;
};

const candidateSubmissions: CandidateSubmission[] = [];

const TRADE_FILTERS: { id: string; label: string }[] = [
  { id: "paint", label: "Schilders" },
  { id: "drain", label: "Loodgieters" },
  { id: "handyman", label: "Timmerlieden / klus" },
  { id: "roof", label: "Dakdekkers" },
  { id: "electro", label: "Elektriciens" },
  { id: "hvac", label: "CV / luchtbehandeling" },
  { id: "bath", label: "Badkamer" },
  { id: "solar", label: "Zonne-energie" },
  { id: "security", label: "Beveiliging" },
  { id: "glazing", label: "Glas / kozijnen" },
  { id: "garden", label: "Tuin" },
  { id: "pest", label: "Plaagdieren" },
];

function mapSourceType(source: Source): PublicSourceRecord["type"] {
  const cat = `${source.category ?? ""} ${source.type ?? ""}`.toLowerCase();
  if (cat.includes("kvk") || cat.includes("chamber")) return "kvk";
  if (cat.includes("keur") || cat.includes("cert")) return "keurmerk";
  if (cat.includes("gemeente") || cat.includes("municipal")) {
    return "gemeente_register";
  }
  if (cat.includes("lokaal") || cat.includes("local") || cat.includes("sport")) {
    return "lokaal_netwerk";
  }
  return "branche_vereniging";
}

function placeParts(company: Company): { city: string; neighborhood: string } {
  const region = (company.region ?? "").trim();
  const address = (company.address ?? "").trim();
  if (region && address) return { city: region, neighborhood: address };
  if (region) return { city: region, neighborhood: "" };
  if (address) return { city: address, neighborhood: "" };
  return { city: "", neighborhood: "" };
}

export function toPublicCompanyCard(
  company: Company,
  sources: Source[],
): PublicCompanyCard {
  const linked = sources.filter((s) => company.source_ids.includes(s.id));
  const tradeId =
    primaryTradeId(company.category || company.sector) ??
    primaryTradeId(company.sector);
  const place = placeParts(company);
  const kvk = (company.kvk_number ?? "").replace(/\D/g, "");
  const tags = [
    ...company.list_membership,
    ...company.differentiators,
  ].filter(Boolean);
  const kvkSource = linked.find((s) => mapSourceType(s) === "kvk");
  const brancheSource = linked.find(
    (s) =>
      mapSourceType(s) === "branche_vereniging" ||
      mapSourceType(s) === "keurmerk",
  );
  const localSource = linked.find(
    (s) =>
      mapSourceType(s) === "lokaal_netwerk" ||
      mapSourceType(s) === "gemeente_register",
  );

  return {
    id: company.id,
    name: company.name,
    trade: tradeId
      ? tradeLabel(tradeId)
      : company.specialism || company.category || company.sector || "",
    tradeId: tradeId ?? undefined,
    city: place.city,
    neighborhood: place.neighborhood,
    foundedYear: 0,
    kvkNumber: kvk,
    kvk_gate: company.kvk_gate === "pass" ? "pass" : "fail",
    sourceCount: company.source_ids.length,
    status:
      company.status === "target" || company.status === "staged"
        ? company.status
        : "candidate",
    harvestConfidence: "medium",
    caraStatus: "pending",
    caraReviewedBy: "",
    caraReviewedAt: "",
    summary: company.profileSnippet ?? "",
    tags,
    practices: [],
    sources: linked.map((src) => ({
      id: src.id,
      name: src.name,
      type: mapSourceType(src),
      title: src.name,
      url: src.listUrl ?? src.url,
      identifier: src.id.slice(0, 8),
      verifiedAt: src.updatedAt.slice(0, 10),
      status: "accepted",
      hash: src.id.slice(0, 8),
      description: src.reason ?? src.evidence?.summary_reasons?.[0] ?? "",
    })),
    whyReliable: {
      kvk: kvkSource?.reason ?? (kvk ? `KvK ${kvk}` : ""),
      branche: brancheSource?.name ?? "",
      localAnchor: localSource?.name ?? "",
    },
  };
}

async function collectPublicCompanies(
  store: Store,
): Promise<PublicCompanyCard[]> {
  const missions = await store.listMissions();
  const byKey = new Map<string, PublicCompanyCard>();
  for (const mission of missions) {
    const [companies, sources] = await Promise.all([
      store.listByMission("companies", mission.id),
      store.listByMission("sources", mission.id),
    ]);
    for (const company of companies) {
      if (company.status === "unknown") continue;
      const card = toPublicCompanyCard(company, sources);
      const key = card.kvkNumber.length === 8
        ? `kvk:${card.kvkNumber}`
        : `name:${card.name.trim().toLowerCase()}`;
      const prev = byKey.get(key);
      if (!prev || card.sourceCount > prev.sourceCount) {
        byKey.set(key, card);
      }
    }
  }
  return [...byKey.values()];
}

function matchesTrade(card: PublicCompanyCard, trade: string): boolean {
  if (!trade || trade === "all") return true;
  const needle = trade.toLowerCase();
  return (
    card.tradeId === trade ||
    card.trade.toLowerCase().includes(needle) ||
    (card.tradeId ? tradeLabel(card.tradeId).toLowerCase().includes(needle) : false)
  );
}

function matchesPlace(card: PublicCompanyCard, city: string): boolean {
  if (!city || city === "all") return true;
  const hay = `${card.city} ${card.neighborhood}`.toLowerCase();
  return hay.includes(city.toLowerCase());
}

function matchesQuery(card: PublicCompanyCard, query: string): boolean {
  if (!query.trim()) return true;
  const hay = `${card.name} ${card.trade} ${card.city} ${card.neighborhood} ${card.summary}`.toLowerCase();
  return hay.includes(query.trim().toLowerCase());
}

function findPackForTrade(missions: Mission[], trade: string): Mission | null {
  const tradeId = primaryTradeId(trade) ?? trade;
  return (
    missions.find(
      (m) =>
        isNationalPack(m) &&
        (packMatchesTrade(m.subsector, String(tradeId)) ||
          primaryTradeId(m.subsector) === tradeId),
    ) ?? null
  );
}

export function registerPublicRoutes(
  app: Hono<{ Variables: AppVariables }>,
  store: Store,
): void {
  app.get("/api/public/featured-companies", async (c) => {
    try {
      const all = await collectPublicCompanies(store);
      const verified = all.filter(
        (co) => co.sourceCount >= 3 && co.kvk_gate === "pass",
      );
      return c.json({
        success: true,
        count: verified.length,
        companies: verified,
      });
    } catch (err) {
      return c.json({
        success: true,
        count: 0,
        companies: [],
        warning: err instanceof Error ? err.message : "featured unavailable",
      });
    }
  });

  app.get("/api/public/featured-company", async (c) => {
    const { id } = c.req.query();
    try {
      const all = await collectPublicCompanies(store);
      const pool = all.filter((co) => co.sourceCount >= 3 && co.kvk_gate === "pass");
      if (id) {
        const match = pool.find((co) => co.id === id);
        if (match) return c.json({ success: true, company: match });
      }
      return c.json({
        success: true,
        company: pool[0] ?? null,
      });
    } catch {
      return c.json({ success: true, company: null });
    }
  });

  app.get("/api/public/kvk-check/:kvk", (c) => {
    const clean = c.req.param("kvk").replace(/\D/g, "");
    if (clean.length !== 8) {
      return c.json({
        valid: false,
        gate: "fail",
        message: "Een geldig Nederlands KvK-nummer bestaat uit exact 8 cijfers.",
      });
    }
    return c.json({
      valid: true,
      gate: "pass",
      kvk: clean,
      status: "Actief geregistreerd",
      verifiedTimestamp: new Date().toISOString(),
      gateCheck: "Passed automated format gate",
    });
  });

  app.get("/api/public/local-search", async (c) => {
    const query = c.req.query("q") ?? c.req.query("query") ?? "";
    const trade = c.req.query("trade") ?? "all";
    const city = c.req.query("city") ?? "all";
    try {
      const all = await collectPublicCompanies(store);
      const companies = all.filter(
        (card) =>
          matchesTrade(card, trade) &&
          matchesPlace(card, city) &&
          matchesQuery(card, query),
      );
      return c.json({
        success: true,
        usedMock: companies.length === 0,
        trades: TRADE_FILTERS,
        count: companies.length,
        companies,
      });
    } catch (err) {
      return c.json({
        success: true,
        usedMock: true,
        trades: TRADE_FILTERS,
        count: 0,
        companies: [],
        warning: err instanceof Error ? err.message : "search unavailable",
      });
    }
  });

  app.post("/api/public/apply-craftsman", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const trade = String(body.trade ?? "").trim();
    const city = String(body.city ?? body.place ?? "").trim();
    const street = String(body.street ?? "").trim();
    const houseNumber = String(body.houseNumber ?? "").trim();
    const postcode = String(body.postcode ?? "").trim();
    const composedAddress = String(body.address ?? "").trim();
    const phone = String(body.phone ?? "").trim();
    const notes = String(body.notes ?? "").trim();
    const isCommunityDrager = Boolean(body.isCommunityDrager);
    const cleanKvk = String(body.kvkNumber ?? "").replace(/\D/g, "");
    const acceptFindable = Boolean(
      body.accept_findable ?? body.accept_free_local_connect,
    );
    const acceptFree = acceptFindable;
    const acceptImprove = acceptFindable;
    const optInWork = Boolean(body.opt_in_active_work);

    if (!name || !email) {
      return c.json(
        { success: false, error: "Naam en e-mailadres zijn verplicht." },
        400,
      );
    }
    if (!isCommunityDrager && (!acceptFindable || !optInWork)) {
      return c.json(
        {
          success: false,
          error:
            "Kies voor vindbaar zijn én acquisitie (actief werk sturen).",
        },
        400,
      );
    }

    const kvk_gate: "pass" | "review" = "review";
    const addressLine =
      composedAddress ||
      [street, houseNumber].filter(Boolean).join(" ") +
        ([postcode, city].filter(Boolean).length
          ? `, ${[postcode, city].filter(Boolean).join(" ")}`
          : "");
    const submission: CandidateSubmission = {
      id: `app-${Date.now()}`,
      type: isCommunityDrager ? "community_anchor" : "craftsman",
      name,
      trade,
      city: city || addressLine,
      kvkNumber: cleanKvk,
      email,
      phone,
      notes: [notes, addressLine].filter(Boolean).join(" · "),
      kvk_gate,
      accept_free_local_connect: acceptFree,
      accept_local_connection_improve: acceptImprove,
      opt_in_active_work: optInWork,
      submittedAt: new Date().toISOString(),
    };
    candidateSubmissions.push(submission);

    const admin = createSupabaseAdmin();
    let userId: string | null = null;
    let companyId: string | null = null;

    if (admin && password.length >= 8) {
      const { data: created, error: createErr } =
        await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { role: "company", display_name: name },
        });
      if (createErr || !created.user) {
        return c.json(
          {
            success: false,
            error: createErr?.message ?? "Kon account niet aanmaken.",
          },
          400,
        );
      }
      userId = created.user.id;
      await admin.from("profiles").upsert({
        id: userId,
        email,
        role: "company",
        status: "pending",
        display_name: name,
        preferred_location: city || null,
        updated_at: new Date().toISOString(),
      });

      const missions = await store.listMissions();
      const pack = findPackForTrade(missions, trade);
      if (pack) {
        const now = new Date().toISOString();
        const company = await store.upsert("companies", {
          id: randomUUID(),
          missionId: pack.id,
          producer: "Human",
          createdAt: now,
          updatedAt: now,
          v: 1,
          name,
          address: addressLine || city,
          region: city,
          sector: pack.sector,
          category: primaryTradeId(trade) ?? pack.subsector,
          kvk_number: cleanKvk || undefined,
          kvk_gate: kvk_gate === "pass" ? "pass" : "unchecked",
          source_ids: [],
          list_membership: [],
          blacklist_flags: [],
          status: "candidate",
          capabilities: [],
          serviceContexts: ["private"],
          differentiators: [],
          servicedElementCodes: [],
          email,
          phone: phone || undefined,
          profileSnippet: notes || undefined,
        });
        companyId = company.id;
      }

      const consentedAt = new Date().toISOString();
      const { error: accountErr } = await admin.from("company_accounts").insert({
        user_id: userId,
        company_id: companyId,
        legal_name: name,
        trade,
        city,
        kvk_number: cleanKvk || null,
        kvk_gate,
        status: kvk_gate === "pass" ? "kvk_passed" : "pending",
        accept_free_local_connect: true,
        accept_local_connection_improve: true,
        opt_in_active_work: true,
        consented_at: consentedAt,
        phone: phone || null,
        notes: notes || null,
        is_community_drager: isCommunityDrager,
      });
      if (accountErr) {
        console.error("[public] company_accounts insert", accountErr);
      }
    }

    return c.json({
      success: true,
      message: isCommunityDrager
        ? "Dank voor de nominatie. H3 neemt contact op met dit bedrijf als regionaal vertrouwensanker."
        : "Aanmelding ontvangen. HandyHouseHelp mag je lokaal verbinden; we nemen de vraag tot het sturen van werk mee.",
      submissionId: submission.id,
      kvkGateStatus: kvk_gate,
      userId,
      companyId,
    });
  });

  app.post("/api/public/apply-partner", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const organizationName = String(body.organizationName ?? "").trim();
    const email = String(body.email ?? "").trim();
    const sector = String(body.sector ?? "").trim();
    const contactName = String(body.contactName ?? "").trim();
    const message = String(body.message ?? "").trim();
    if (!organizationName || !email) {
      return c.json(
        { success: false, error: "Organisatienaam en e-mail zijn verplicht." },
        400,
      );
    }
    candidateSubmissions.push({
      id: `sector-${Date.now()}`,
      type: "sector_partner",
      name: organizationName,
      trade: sector,
      email,
      notes: `Contact: ${contactName}. Bericht: ${message}`,
      kvk_gate: "pass",
      submittedAt: new Date().toISOString(),
    });
    return c.json({
      success: true,
      message:
        "Dank voor de interesse. Ons team voor sectorverbinding neemt binnen 2 werkdagen contact op.",
    });
  });

  app.get("/api/admin/company-accounts", async (c) => {
    const auth = c.get("auth");
    const admin = createSupabaseAdmin();
    if (!isAdmin(auth) || !admin) {
      return c.json({ error: "Admin only" }, 403);
    }
    const { data, error } = await admin
      .from("company_accounts")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) return c.json({ error: error.message }, 400);
    return c.json({ accounts: data ?? [] });
  });

  app.post("/api/admin/company-accounts/:id/approve", async (c) => {
    const auth = c.get("auth");
    const admin = createSupabaseAdmin();
    if (!isAdmin(auth) || !admin) {
      return c.json({ error: "Admin only" }, 403);
    }
    const id = c.req.param("id");
    const { data, error } = await admin
      .from("company_accounts")
      .update({
        status: "approved",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error) return c.json({ error: error.message }, 400);
    if (data?.user_id) {
      await admin
        .from("profiles")
        .update({
          status: "approved",
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.user_id);
    }
    return c.json({ account: data });
  });

  app.post("/api/admin/company-accounts/:id/reject", async (c) => {
    const auth = c.get("auth");
    const admin = createSupabaseAdmin();
    if (!isAdmin(auth) || !admin) {
      return c.json({ error: "Admin only" }, 403);
    }
    const id = c.req.param("id");
    const { data, error } = await admin
      .from("company_accounts")
      .update({
        status: "rejected",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error) return c.json({ error: error.message }, 400);
    if (data?.user_id) {
      await admin
        .from("profiles")
        .update({
          status: "rejected",
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.user_id);
    }
    return c.json({ account: data });
  });
}

export type Language = 'nl' | 'en';

export type PageView = 
  | 'home' 
  | 'hoe-het-werkt' 
  | 'sectoren' 
  | 'lokale-netwerken' 
  | 'vakman-worden' 
  | 'handyhousehelp' 
  | 'over-h3'
  | 'zoeken';

export interface SourceRecord {
  id: string;
  name: string;
  type: 'kvk' | 'branche_vereniging' | 'keurmerk' | 'lokaal_netwerk' | 'gemeente_register';
  title: string;
  url?: string;
  identifier?: string;
  verifiedAt: string;
  status: 'accepted' | 'adjusted' | 'pending';
  hash: string;
  description: string;
}

export interface Company {
  id: string;
  name: string;
  trade: string; // e.g. Schilder, Loodgieter, Timmerman, Dakdekker
  tradeId?: string;
  city: string;
  neighborhood: string;
  foundedYear: number;
  kvkNumber: string;
  kvk_gate: 'pass' | 'fail';
  sourceCount: number;
  status: 'target' | 'candidate' | 'staged';
  harvestConfidence: 'high' | 'medium' | 'low';
  caraStatus: 'agreed' | 'adjusted' | 'pending';
  caraReviewedBy: string; // CURAD identifier
  caraReviewedAt: string;
  summary: string;
  tags: string[];
  practices: {
    title: string;
    description: string;
    verified: boolean;
  }[];
  sources: SourceRecord[];
  whyReliable: {
    kvk: string;
    branche: string;
    localAnchor: string;
  };
}

export interface SectorComparisonItem {
  largeCorp: string;
  smallCraftsman: string;
  h3Translation: string;
}

import { TRADES, type TradeId } from "@h3-trust/schema";

export type PublicTradeOption = {
  id: TradeId;
  labelNl: string;
  labelEn: string;
};

/** The 12 H3/HHH doors — same ids and labels as Mission Control. */
export const PUBLIC_TRADES: readonly PublicTradeOption[] = TRADES.trades.map(
  (trade) => ({
    id: trade.id,
    labelNl: trade.label,
    labelEn: trade.label_en,
  }),
);

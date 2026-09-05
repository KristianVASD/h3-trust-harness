export type LlmCall = {
  at: string;
  job: string;
  model: string;
  ok: boolean;
  status?: number;
  waitSec?: number;
  chars?: number;
  preview: string;
  error?: string;
};

const MAX = 40;
const calls: LlmCall[] = [];

export function recordLlmCall(row: LlmCall): void {
  calls.unshift(row);
  if (calls.length > MAX) calls.pop();
}

export function listLlmCalls(): LlmCall[] {
  return [...calls];
}

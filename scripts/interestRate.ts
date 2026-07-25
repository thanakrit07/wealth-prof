// DESIGN.md §6.4/§9: the sheet mixes units — "installment 0.74%" is per
// month, a card's "9.99%" style rate is per year. Every rate in the schema
// is % per year. Since the raw text doesn't self-describe its unit,
// heuristic: a raw percentage below MONTHLY_THRESHOLD reads as a monthly
// installment rate (converted ×12); at or above it, the number is already
// annual-scale (matches the sheet's real cash-advance rates like 9.99%).
// Verify against a few known rows after the first import run.
const MONTHLY_THRESHOLD = 3

export interface ParsedRate {
  annualRate: number
  isCashAdvance: boolean
}

export function parseInterestRate(note: string): ParsedRate {
  const match = /(\d+(?:\.\d+)?)\s*%/.exec(note)
  if (!match) return { annualRate: 0, isCashAdvance: false }
  const raw = Number(match[1])
  if (raw < MONTHLY_THRESHOLD) {
    return { annualRate: Number((raw * 12).toFixed(3)), isCashAdvance: false }
  }
  return { annualRate: raw, isCashAdvance: true }
}

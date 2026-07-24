// DESIGN.md §7.4: amounts are formatted "1,234.50" in baht throughout the UI.
export function formatBaht(amount: number): string {
  return amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

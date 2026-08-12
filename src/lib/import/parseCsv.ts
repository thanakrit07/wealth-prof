// The browser-safe build — csv-parse/sync pulls in Node's `stream`, which
// doesn't exist in a Vite-bundled browser context. This screen runs client-
// side (Settings → Data → Import), never on the server.
import { parse } from 'csv-parse/browser/esm/sync'

export interface ParsedCsv {
  headers: string[]
  rows: Record<string, string>[]
}

export function parseCsvText(text: string): ParsedCsv {
  const records = parse(text, { columns: true, skip_empty_lines: true, trim: true, bom: true }) as Record<string, string>[]
  const headers = records.length > 0 ? Object.keys(records[0]) : []
  return { headers, rows: records }
}

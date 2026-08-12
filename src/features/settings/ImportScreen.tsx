import { useMemo, useRef, useState } from 'react'
import { ChevronDown, Download, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAccounts } from '@/lib/accounts'
import { useCards } from '@/lib/cards'
import { useCategories } from '@/lib/categories'
import { useHousehold } from '@/lib/HouseholdContext'
import { applyPlan, hasExistingImportRows, type ApplyProgress, type ApplyResult, type ApplyStage } from '@/lib/import/apply'
import { detectMapping, type ColumnMapping } from '@/lib/import/detect'
import { ENTITY_LABELS, FIELD_SPECS } from '@/lib/import/fields'
import { parseCsvText, type ParsedCsv } from '@/lib/import/parseCsv'
import { buildPlan, type FilesInput } from '@/lib/import/plan'
import { buildTemplateCsv } from '@/lib/import/template'
import { emptyRowEdits, ENTITY_KINDS, type DateFormat, type EntityKind, type ImportContext, type ImportIssue, type ImportPlan } from '@/lib/import/types'
import { cn } from '@/lib/utils'

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

type Stage = 'files' | 'mapping' | 'preview' | 'applying' | 'summary'

const DATE_FORMAT_LABELS: Record<DateFormat, string> = {
  dmy: 'DD/MM/YYYY (31/01/2026)',
  mdy: 'MM/DD/YYYY (01/31/2026)',
  ymd: 'YYYY-MM-DD (2026-01-31)',
}

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// v3.9-era redesign plan, "bulk import": in-app CSV import replacing
// scripts/import-sheet.ts (see the ADR). Five states: pick files (with a
// per-entity guide and template download) → map columns → preview (issues +
// consequences, read-only in this phase) → apply with progress → summary.
// All the logic lives in src/lib/import/* as pure functions — this
// component is a render of buildPlan()'s output plus the file/mapping state
// that feeds it.
export function ImportScreen({ onClose }: { onClose: () => void }) {
  const { householdId, members } = useHousehold()
  const { data: categories } = useCategories(householdId)
  const { data: accounts } = useAccounts(householdId)
  const { data: cards } = useCards(householdId)

  const [stage, setStage] = useState<Stage>('files')
  const [parsedByEntity, setParsedByEntity] = useState<Partial<Record<EntityKind, ParsedCsv>>>({})
  const [mappingByEntity, setMappingByEntity] = useState<Partial<Record<EntityKind, ColumnMapping>>>({})
  const [dateFormat, setDateFormat] = useState<DateFormat>('dmy')
  const [existingImportWarning, setExistingImportWarning] = useState(false)
  const [checkingExisting, setCheckingExisting] = useState(false)
  const [applyProgress, setApplyProgress] = useState<ApplyProgress | null>(null)
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null)

  const context: ImportContext = useMemo(
    () => ({
      categories: (categories ?? []).map((c) => ({ name: c.name, kind: c.kind })),
      accounts: (accounts ?? []).map((a) => ({ name: a.name })),
      cards: (cards ?? []).map((c) => ({ name: c.name })),
      members: members.map((m) => ({ name: m.display_name })),
    }),
    [categories, accounts, cards, members],
  )

  const selectedEntities = ENTITY_KINDS.filter((e) => parsedByEntity[e])

  const files: FilesInput = useMemo(() => {
    const out: FilesInput = {}
    for (const entity of selectedEntities) {
      const parsed = parsedByEntity[entity]
      const mapping = mappingByEntity[entity]
      if (parsed && mapping) out[entity] = { headers: parsed.headers, rows: parsed.rows, mapping }
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsedByEntity, mappingByEntity, selectedEntities.join(',')])

  const plan: ImportPlan = useMemo(
    () => buildPlan(files, emptyRowEdits(), context, dateFormat, todayIso()),
    [files, context, dateFormat],
  )

  const errorCount = plan.issues.filter((i) => i.severity === 'error').length
  const warningCount = plan.issues.filter((i) => i.severity === 'warning').length

  async function handleFileChange(entity: EntityKind, file: File | null) {
    if (!file) {
      setParsedByEntity((prev) => {
        const next = { ...prev }
        delete next[entity]
        return next
      })
      setMappingByEntity((prev) => {
        const next = { ...prev }
        delete next[entity]
        return next
      })
      return
    }
    const text = await file.text()
    const parsed = parseCsvText(text)
    setParsedByEntity((prev) => ({ ...prev, [entity]: parsed }))
    setMappingByEntity((prev) => ({ ...prev, [entity]: detectMapping(parsed.headers, FIELD_SPECS[entity]) }))
  }

  async function goToMapping() {
    setStage('mapping')
  }

  async function goToPreview() {
    setCheckingExisting(true)
    try {
      setExistingImportWarning(await hasExistingImportRows(householdId))
    } finally {
      setCheckingExisting(false)
    }
    setStage('preview')
  }

  async function handleApply() {
    setStage('applying')
    setApplyProgress(null)
    const result = await applyPlan(householdId, plan, setApplyProgress)
    setApplyResult(result)
    setStage('summary')
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4">
      {stage === 'files' && (
        <FilesStep
          parsedByEntity={parsedByEntity}
          onFileChange={handleFileChange}
          onContinue={goToMapping}
          canContinue={selectedEntities.length > 0}
        />
      )}
      {stage === 'mapping' && (
        <MappingStep
          selectedEntities={selectedEntities}
          parsedByEntity={parsedByEntity}
          mappingByEntity={mappingByEntity}
          onMappingChange={(entity, mapping) => setMappingByEntity((prev) => ({ ...prev, [entity]: mapping }))}
          dateFormat={dateFormat}
          onDateFormatChange={setDateFormat}
          onBack={() => setStage('files')}
          onContinue={goToPreview}
          checking={checkingExisting}
        />
      )}
      {stage === 'preview' && (
        <PreviewStep
          plan={plan}
          selectedEntities={selectedEntities}
          errorCount={errorCount}
          warningCount={warningCount}
          existingImportWarning={existingImportWarning}
          onBack={() => setStage('mapping')}
          onApply={handleApply}
        />
      )}
      {stage === 'applying' && <ApplyingStep progress={applyProgress} />}
      {stage === 'summary' && applyResult && <SummaryStep result={applyResult} onClose={onClose} />}
    </div>
  )
}

function FilesStep({
  parsedByEntity,
  onFileChange,
  onContinue,
  canContinue,
}: {
  parsedByEntity: Partial<Record<EntityKind, ParsedCsv>>
  onFileChange: (entity: EntityKind, file: File | null) => void
  onContinue: () => void
  canContinue: boolean
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        One CSV per kind of data, however many you have. Download a template first if you're not sure of the columns — open it in
        Google Sheets and fill in your own rows using the same headers.
      </p>
      <ul className="space-y-3">
        {ENTITY_KINDS.map((entity) => (
          <EntityFilePicker key={entity} entity={entity} parsed={parsedByEntity[entity] ?? null} onFileChange={(f) => onFileChange(entity, f)} />
        ))}
      </ul>
      <Button className="w-full" onClick={onContinue} disabled={!canContinue}>
        Continue
      </Button>
    </div>
  )
}

function EntityFilePicker({
  entity,
  parsed,
  onFileChange,
}: {
  entity: EntityKind
  parsed: ParsedCsv | null
  onFileChange: (file: File | null) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [guideOpen, setGuideOpen] = useState(false)

  return (
    <li className="space-y-2 rounded-2xl border bg-card p-3">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{ENTITY_LABELS[entity]}</span>
          <span className="block text-xs text-muted-foreground">
            {parsed ? `${parsed.rows.length} row${parsed.rows.length === 1 ? '' : 's'} loaded` : 'No file selected'}
          </span>
        </span>
        <Button variant="outline" size="sm" onClick={() => downloadText(`${entity}-template.csv`, buildTemplateCsv(entity))}>
          <Download className="size-3.5" />
          Template
        </Button>
        <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
          <Upload className="size-3.5" />
          {parsed ? 'Replace' : 'Choose file'}
        </Button>
        {parsed && (
          <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={() => onFileChange(null)} aria-label={`Remove ${ENTITY_LABELS[entity]} file`}>
            <X className="size-4" />
          </Button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
        />
      </div>

      <button
        type="button"
        onClick={() => setGuideOpen((o) => !o)}
        className="flex w-full items-center gap-1 text-xs text-muted-foreground"
      >
        <ChevronDown className={cn('size-3.5 transition-transform', guideOpen && 'rotate-180')} />
        {guideOpen ? 'Hide column guide' : 'Show column guide'}
      </button>
      {guideOpen && (
        <ul className="space-y-1.5 rounded-xl bg-muted/40 p-2 text-xs">
          {FIELD_SPECS[entity].map((field) => (
            <li key={field.key}>
              <span className="font-medium">{field.column}</span>
              {field.required ? <span className="text-destructive"> (required)</span> : <span className="text-muted-foreground"> (optional)</span>}
              <span className="block text-muted-foreground">{field.description}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

const UNMAPPED = '__unmapped__'

function MappingStep({
  selectedEntities,
  parsedByEntity,
  mappingByEntity,
  onMappingChange,
  dateFormat,
  onDateFormatChange,
  onBack,
  onContinue,
  checking,
}: {
  selectedEntities: EntityKind[]
  parsedByEntity: Partial<Record<EntityKind, ParsedCsv>>
  mappingByEntity: Partial<Record<EntityKind, ColumnMapping>>
  onMappingChange: (entity: EntityKind, mapping: ColumnMapping) => void
  dateFormat: DateFormat
  onDateFormatChange: (format: DateFormat) => void
  onBack: () => void
  onContinue: () => void
  checking: boolean
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5 rounded-2xl border bg-card p-3">
        <span className="text-sm font-medium">Date format</span>
        <p className="text-xs text-muted-foreground">How dates are written in every file — chosen once, used everywhere.</p>
        <Select value={dateFormat} onValueChange={(v) => onDateFormatChange(v as DateFormat)}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(DATE_FORMAT_LABELS) as DateFormat[]).map((f) => (
              <SelectItem key={f} value={f}>{DATE_FORMAT_LABELS[f]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedEntities.map((entity) => {
        const parsed = parsedByEntity[entity]
        const mapping = mappingByEntity[entity] ?? {}
        if (!parsed) return null
        return (
          <div key={entity} className="space-y-2 rounded-2xl border bg-card p-3">
            <span className="text-sm font-medium">{ENTITY_LABELS[entity]}</span>
            <ul className="space-y-2">
              {FIELD_SPECS[entity].map((field) => (
                <li key={field.key} className="flex items-center gap-2">
                  <span className="w-36 shrink-0 truncate text-xs text-muted-foreground">
                    {field.column}
                    {field.required && <span className="text-destructive"> *</span>}
                  </span>
                  <Select
                    value={mapping[field.key] ?? UNMAPPED}
                    onValueChange={(v) => onMappingChange(entity, { ...mapping, [field.key]: v === UNMAPPED ? null : v })}
                  >
                    <SelectTrigger className="h-8 flex-1 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNMAPPED}>— not mapped —</SelectItem>
                      {parsed.headers.map((h) => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </li>
              ))}
            </ul>
          </div>
        )
      })}

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onBack}>
          Back
        </Button>
        <Button className="flex-1" onClick={onContinue} disabled={checking}>
          {checking ? 'Checking…' : 'Preview'}
        </Button>
      </div>
    </div>
  )
}

function IssueList({ issues }: { issues: ImportIssue[] }) {
  return (
    <ul className="space-y-1">
      {issues.map((issue, i) => (
        <li key={i} className={cn('text-xs', issue.severity === 'error' ? 'text-destructive' : 'text-warning-foreground')}>
          Row {issue.rowNumber}
          {issue.field && ` · ${issue.field}`}: {issue.message}
        </li>
      ))}
    </ul>
  )
}

function PreviewStep({
  plan,
  selectedEntities,
  errorCount,
  warningCount,
  existingImportWarning,
  onBack,
  onApply,
}: {
  plan: ImportPlan
  selectedEntities: EntityKind[]
  errorCount: number
  warningCount: number
  existingImportWarning: boolean
  onBack: () => void
  onApply: () => void
}) {
  return (
    <div className="space-y-4">
      {existingImportWarning && (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          This household already has rows from an earlier import. Applying again will fail on the first name that collides — it
          never overwrites. If you meant to start over, clear the household's data first.
        </div>
      )}

      <div className="rounded-2xl border bg-card p-3 text-sm">
        <span className="font-medium">{errorCount === 0 ? 'Ready to import.' : `${errorCount} row${errorCount === 1 ? '' : 's'} need fixing.`}</span>
        {warningCount > 0 && <span className="block text-xs text-muted-foreground">{warningCount} warning{warningCount === 1 ? '' : 's'} — won't block the import.</span>}
      </div>

      {plan.consequences.length > 0 && (
        <div className="space-y-1 rounded-2xl border bg-warning/40 p-3 text-sm text-warning-foreground">
          <span className="font-medium">What happens after</span>
          <ul className="list-disc space-y-1 pl-4">
            {plan.consequences.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      {selectedEntities.map((entity) => {
        const rows = plan[entity]
        const entityIssues = plan.issues.filter((i) => i.entity === entity)
        const errors = entityIssues.filter((i) => i.severity === 'error')
        const validCount = rows.filter((r) => r.value !== null).length
        return (
          <div key={entity} className="space-y-1.5 rounded-2xl border bg-card p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{ENTITY_LABELS[entity]}</span>
              <span className="text-muted-foreground">
                {validCount}/{rows.length} row{rows.length === 1 ? '' : 's'} ready
                {errors.length > 0 && <span className="text-destructive"> · {errors.length} error{errors.length === 1 ? '' : 's'}</span>}
              </span>
            </div>
            {entityIssues.length > 0 && <IssueList issues={entityIssues} />}
          </div>
        )
      })}

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onBack}>
          Back
        </Button>
        <Button className="flex-1" onClick={onApply} disabled={errorCount > 0}>
          Import
        </Button>
      </div>
    </div>
  )
}

const STAGE_LABELS: Record<ApplyStage, string> = {
  categories: 'Categories',
  accounts: 'Accounts',
  cards: 'Cards',
  installments: 'Installments',
  installmentPayments: 'Installment payments',
  recurringRules: 'Recurring rules',
  transactions: 'Transactions',
  openingBalances: 'Opening balances',
}

function ApplyingStep({ progress }: { progress: ApplyProgress | null }) {
  return (
    <div className="space-y-3 rounded-2xl border bg-card p-6 text-center">
      <p className="text-sm font-medium">Importing…</p>
      {progress && (
        <p className="text-xs text-muted-foreground">
          {STAGE_LABELS[progress.stage]} — {progress.completed}/{progress.total}
        </p>
      )}
    </div>
  )
}

function SummaryStep({ result, onClose }: { result: ApplyResult; onClose: () => void }) {
  return (
    <div className="space-y-4">
      <div className={cn('rounded-2xl border p-3 text-sm', result.error ? 'border-destructive/40 bg-destructive/10 text-destructive' : 'border-good/40 bg-good-background text-good-foreground')}>
        <span className="font-medium">{result.error ? `Stopped at ${result.failedAt}` : 'Import complete.'}</span>
        {result.error && <span className="block text-xs">{result.error}</span>}
      </div>
      <ul className="space-y-1 rounded-2xl border bg-card p-3 text-sm">
        {(Object.entries(result.insertedCounts) as [string, number][]).map(([stage, count]) => (
          <li key={stage} className="flex items-center justify-between">
            <span className="text-muted-foreground">{STAGE_LABELS[stage as ApplyStage] ?? stage}</span>
            <span>{count}</span>
          </li>
        ))}
      </ul>
      <Button className="w-full" onClick={onClose}>
        Done
      </Button>
    </div>
  )
}

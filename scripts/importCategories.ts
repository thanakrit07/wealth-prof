export function normaliseSheetText(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, ' ')
}

export function isInstallmentCategory(value: string): boolean {
  return ['ผ่อนสินค้า', 'installment', 'installments'].includes(normaliseSheetText(value))
}

export function isSubscriptionCategory(value: string): boolean {
  return ['subscription', 'subscriptions'].includes(normaliseSheetText(value))
}

// The old sheet never used a "Subscription" category — real recurring digital
// services (checked against this household's actual export) were filed under
// whatever main the item resembled ("Education" for Youtube, "Insurance" for
// an insurer's auto-debit). So detection also matches by label, but only
// against a short, named list of known services — never a broad "looks
// periodic" heuristic. A wide net would also catch things like scattered
// Apple Store purchases (different amounts, different days every month),
// which are not a subscription and must not be frozen into one recurring
// amount. Add a service here only when you've confirmed the label in the
// sheet; a name too generic to be confident about should stay a plain
// transaction and get caught by the manual "likely recurring" list instead.
const KNOWN_SUBSCRIPTION_SERVICES = [
  'youtube',
  'netflix',
  'spotify',
  'disney+',
  'disney plus',
  'apple music',
  'apple tv',
  'google one',
  'prime video',
  'hbo',
]

export function looksLikeSubscriptionLabel(label: string): boolean {
  const normalised = normaliseSheetText(label)
  return KNOWN_SUBSCRIPTION_SERVICES.some((service) => normalised.includes(service))
}

/**
 * Whether a transaction row is a subscription candidate at all — by an
 * explicit category, or a recognised service name. Does NOT decide whether
 * it should become a recurring rule: a label match alone isn't proof of
 * recurrence (a one-off "Netflix gift card" purchase would match too), so
 * the caller must additionally confirm the row recurs across multiple
 * months before treating it as one.
 */
export function isLikelySubscription(label: string, categoryName: string): boolean {
  return isSubscriptionCategory(categoryName) || looksLikeSubscriptionLabel(label)
}

// The old sheet files everything under Thai category labels; create_household
// (0011_category_icons.sql) seeds every new household with this fixed English
// set. Map the sheet's labels onto it so rows resolve against the categories
// that already exist instead of falling back to "Other". ค่าที่พัก (lodging)
// and ท่องเที่ยว (trip costs) both land on Travel -- in this sheet ค่าที่พัก
// only ever shows up for hotel stays while travelling, never rent, so there's
// no case that actually wants Housing.
const THAI_CATEGORY_MAP: Record<string, string> = {
  การศึกษา: 'Education',
  ความบันเทิง: 'Entertainment',
  'ค่าที่พัก': 'Travel',
  ค่าเดินทาง: 'Transport',
  'ค่าโทรศัพท์/internet': 'Phone/Internet',
  ช้อปปิ้ง: 'Shopping',
  ท่องเที่ยว: 'Travel',
  สุขภาพ: 'Health',
  อาหาร: 'Food',
  อื่นๆ: 'Other',
}

/** Maps legacy sheet labels to the category names used in the app. */
export function canonicalCategoryName(value: string): string {
  if (isInstallmentCategory(value)) return 'Installments'
  if (isSubscriptionCategory(value)) return 'Subscriptions'
  const mapped = THAI_CATEGORY_MAP[normaliseSheetText(value)]
  if (mapped) return mapped
  return value
}

export function subscriptionSourceKey(name: string, ownerId: string | null, instrumentName: string): string {
  return `recurring:subscription:${normaliseSheetText(name)}:${ownerId ?? 'unassigned'}:${normaliseSheetText(instrumentName)}`
}

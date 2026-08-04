import { describe, expect, it } from 'vitest'
import {
  canonicalCategoryName,
  isInstallmentCategory,
  isLikelySubscription,
  isSubscriptionCategory,
  looksLikeSubscriptionLabel,
  subscriptionSourceKey,
} from './importCategories.ts'

describe('legacy sheet category handling', () => {
  it('recognises Thai and English installment categories', () => {
    expect(isInstallmentCategory('ผ่อนสินค้า')).toBe(true)
    expect(isInstallmentCategory(' Installments ')).toBe(true)
    expect(canonicalCategoryName('ผ่อนสินค้า')).toBe('Installments')
  })

  it('recognises subscriptions and gives a stable recurring rule key', () => {
    expect(isSubscriptionCategory('Subscription')).toBe(true)
    expect(canonicalCategoryName('subscription')).toBe('Subscriptions')
    expect(subscriptionSourceKey('Youtube sub', 'owner-1', 'CC: KTC')).toBe(
      'recurring:subscription:youtube sub:owner-1:cc: ktc',
    )
  })

  // Regression: the real export never uses a "Subscription" category at all —
  // Youtube charges were filed under "Education". Detection has to fall back
  // to recognising the service by name, or every one of these imports as an
  // ordinary one-off transaction and the conversion never fires.
  it('recognises known services by label even under an unrelated category', () => {
    expect(looksLikeSubscriptionLabel('Youtube sub 9arm')).toBe(true)
    expect(looksLikeSubscriptionLabel('Google Youtube Member Mountain View USA')).toBe(true)
    expect(isLikelySubscription('Youtube sub', 'Education')).toBe(true)
  })

  // Regression: label-only matching must stay narrow. A broad "recurring
  // looking" heuristic would also sweep in irregular Apple Store purchases
  // (different amount, different day, every month) into one frozen
  // recurring amount, which is wrong in a different way than duplicating.
  it('does not flag an unrelated purchase as a subscription', () => {
    expect(looksLikeSubscriptionLabel('APPLE.COM/BILL')).toBe(false)
    expect(isLikelySubscription('APPLE.COM/BILL', 'Other')).toBe(false)
  })

  // The sheet's raw category column is Thai; create_household seeds every
  // household with a fixed English set, so these have to map onto it or
  // every row falls back to "Other" silently.
  it('maps the sheet\'s Thai categories onto the app\'s default English set', () => {
    expect(canonicalCategoryName('การศึกษา')).toBe('Education')
    expect(canonicalCategoryName('ความบันเทิง')).toBe('Entertainment')
    expect(canonicalCategoryName('ค่าที่พัก')).toBe('Travel')
    expect(canonicalCategoryName('ค่าเดินทาง')).toBe('Transport')
    expect(canonicalCategoryName('ค่าโทรศัพท์/Internet')).toBe('Phone/Internet')
    expect(canonicalCategoryName('ช้อปปิ้ง')).toBe('Shopping')
    expect(canonicalCategoryName('ท่องเที่ยว')).toBe('Travel')
    expect(canonicalCategoryName('สุขภาพ')).toBe('Health')
    expect(canonicalCategoryName('อาหาร')).toBe('Food')
    expect(canonicalCategoryName('อื่นๆ')).toBe('Other')
  })

  it('leaves a category name untouched when it has no known mapping', () => {
    expect(canonicalCategoryName('บางอย่างที่ไม่รู้จัก')).toBe('บางอย่างที่ไม่รู้จัก')
  })
})

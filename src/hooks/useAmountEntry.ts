import { useState } from 'react'
import { appendKey, evaluateExpression, formatResult } from '@/lib/calculator'

// Backs one amount field driven by the in-app Keypad (DESIGN.md §7.2 D9):
// `expr` is the raw calculator expression as typed (e.g. "120+85"), `value`
// is always its evaluated number. Several of these can coexist in one sheet
// (e.g. installment's "amount per period" and "final period"), each getting
// its own instance while sharing the one Keypad in the sheet's footer.
export function useAmountEntry(initial = '') {
  const [expr, setExpr] = useState(initial)
  const value = evaluateExpression(expr)

  function press(key: string) {
    setExpr((prev) => appendKey(prev, key))
  }

  function pressEquals() {
    setExpr((prev) => {
      const result = evaluateExpression(prev)
      return result > 0 ? formatResult(result) : ''
    })
  }

  function reset() {
    setExpr('')
  }

  return { expr, setExpr, value, press, pressEquals, reset }
}

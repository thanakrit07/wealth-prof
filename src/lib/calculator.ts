// Backs the in-app amount keypad (DESIGN.md §7.2 D9) — a simple calculator,
// not a full expression parser: left-to-right entry with ×÷ before +− (a
// single precedence pass is enough for "120+85+60" style receipt totals).

const OPERATORS = new Set(['+', '-', '×', '÷'])

export function appendKey(expr: string, key: string): string {
  if (key === 'C') return ''
  if (key === '⌫') return expr.slice(0, -1)
  if (key === '=') return expr

  const last = expr.at(-1)

  if (OPERATORS.has(key)) {
    if (expr === '') return expr
    if (last !== undefined && OPERATORS.has(last)) return expr.slice(0, -1) + key
    return expr + key
  }

  const segment = expr.split(/[+\-×÷]/).at(-1) ?? ''

  if (key === '.') {
    if (segment.includes('.')) return expr
    return expr + (segment === '' ? '0.' : '.')
  }

  // Leading-zero collapse: "0" then "5" becomes "5", not "05".
  if (segment === '0') return expr.slice(0, -1) + key
  return expr + key
}

export function evaluateExpression(expr: string): number {
  const trimmed = expr.replace(/[+\-×÷]$/, '')
  if (trimmed === '') return 0
  const tokens = trimmed.match(/\d+\.?\d*|[+\-×÷]/g)
  if (!tokens || tokens.length === 0) return 0

  const stage: (number | string)[] = [Number(tokens[0])]
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i]
    const num = Number(tokens[i + 1])
    if (op === '×' || op === '÷') {
      const prev = stage.pop() as number
      // Guard divide-by-zero by leaving the running value unchanged rather
      // than producing Infinity/NaN in the amount field.
      stage.push(op === '×' ? prev * num : num === 0 ? prev : prev / num)
    } else {
      stage.push(op, num)
    }
  }

  let result = stage[0] as number
  for (let i = 1; i < stage.length; i += 2) {
    const op = stage[i]
    const num = stage[i + 1] as number
    result = op === '+' ? result + num : result - num
  }
  return result
}

// Collapses floating-point artifacts (0.1 + 0.2) before the result is shown
// or re-used as the start of the next expression.
export function formatResult(value: number): string {
  return Number(value.toFixed(2)).toString()
}

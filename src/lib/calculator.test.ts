import { describe, expect, it } from 'vitest'
import { appendKey, evaluateExpression, formatResult } from './calculator'

describe('appendKey', () => {
  it('appends digits', () => {
    expect(appendKey('', '5')).toBe('5')
    expect(appendKey('5', '0')).toBe('50')
  })

  it('collapses a leading zero', () => {
    expect(appendKey('0', '5')).toBe('5')
  })

  it('keeps a trailing zero once a decimal point exists', () => {
    expect(appendKey('5.', '0')).toBe('5.0')
  })

  it('allows one decimal point per segment', () => {
    expect(appendKey('5', '.')).toBe('5.')
    expect(appendKey('5.', '.')).toBe('5.')
  })

  it('starts a new segment with 0. after an operator', () => {
    expect(appendKey('5+', '.')).toBe('5+0.')
  })

  it('ignores a leading operator', () => {
    expect(appendKey('', '+')).toBe('')
  })

  it('replaces a trailing operator instead of stacking', () => {
    expect(appendKey('5+', '-')).toBe('5-')
  })

  it('backspaces one character', () => {
    expect(appendKey('5+3', '⌫')).toBe('5+')
  })

  it('clears on C', () => {
    expect(appendKey('5+3', 'C')).toBe('')
  })
})

describe('evaluateExpression', () => {
  it('adds left to right', () => {
    expect(evaluateExpression('120+85+60')).toBe(265)
  })

  it('ignores a dangling trailing operator', () => {
    expect(evaluateExpression('120+85+')).toBe(205)
  })

  it('returns 0 for an empty expression', () => {
    expect(evaluateExpression('')).toBe(0)
  })

  it('applies ×÷ before +− (single precedence pass)', () => {
    expect(evaluateExpression('10×2+5')).toBe(25)
  })

  it('guards against divide by zero', () => {
    expect(evaluateExpression('10÷0')).toBe(10)
  })
})

describe('formatResult', () => {
  it('collapses floating-point artifacts', () => {
    expect(formatResult(0.1 + 0.2)).toBe('0.3')
  })

  it('drops unnecessary trailing zeros', () => {
    expect(formatResult(65)).toBe('65')
  })
})

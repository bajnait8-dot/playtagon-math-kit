import { describe, it, expect } from 'vitest'
import { GLYPHS, glyphFor, GLYPH_ROWS, GLYPH_COLS, NARROW_COLS } from './dice-glyphs'

describe('dice-glyphs', () => {
  it('defines digits and DICE letters as 5-wide, 8-row grids', () => {
    const wide = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'D', 'I', 'C', 'E']
    for (const k of wide) {
      const g = GLYPHS[k]
      expect(g, `glyph ${k} missing`).toBeDefined()
      expect(g.length).toBe(GLYPH_ROWS)
      for (const row of g) expect(row.length).toBe(GLYPH_COLS)
    }
  })

  it('defines the decimal point and divider as narrow 3-wide, 8-row grids', () => {
    for (const k of ['.', ':']) {
      const g = GLYPHS[k]
      expect(g, `glyph ${k} missing`).toBeDefined()
      expect(g.length).toBe(GLYPH_ROWS)
      for (const row of g) expect(row.length).toBe(NARROW_COLS)
    }
  })

  it('glyphFor falls back to blank for unknown chars', () => {
    const blank = ['.....', '.....', '.....', '.....', '.....', '.....', '.....', '.....']
    expect(glyphFor(' ')).toEqual(blank)
    expect(glyphFor('Z')).toEqual(blank)
  })
})

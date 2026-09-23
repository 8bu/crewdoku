import { describe, expect, it } from 'vitest'
import type { ExportCell } from './exportCsv'
import { serializeDelimited, serializeJson } from './serializers'

describe('serializers', () => {
  describe('serializeDelimited', () => {
    const matrix: ExportCell[][] = [
      ['name', 'notes', 'hours'],
      ['Alice', 'hello, world', 8.5],
      ['Bob', 'tab\tseparated', 0],
      ['Charlie', 'plain "quoted"', 4],
    ]

    it('serializes CSV quoting commas and double quotes, leaving tabs unquoted and numbers bare', () => {
      const csv = serializeDelimited(matrix, ',')
      expect(csv).toBe(
        'name,notes,hours\n' +
          'Alice,"hello, world",8.5\n' +
          'Bob,tab\tseparated,0\n' +
          'Charlie,"plain ""quoted""",4\n'
      )
    })

    it('serializes TSV quoting tabs and double quotes, leaving commas unquoted and numbers bare', () => {
      const tsv = serializeDelimited(matrix, '\t')
      expect(tsv).toBe(
        'name\tnotes\thours\n' +
          'Alice\thello, world\t8.5\n' +
          'Bob\t"tab\tseparated"\t0\n' +
          'Charlie\t"plain ""quoted"""\t4\n'
      )
    })

    it('quotes fields containing newlines in both CSV and TSV', () => {
      const multilineMatrix: ExportCell[][] = [
        ['title', 'description'],
        ['Task 1', 'line 1\nline 2'],
      ]
      expect(serializeDelimited(multilineMatrix, ',')).toBe(
        'title,description\nTask 1,"line 1\nline 2"\n'
      )
      expect(serializeDelimited(multilineMatrix, '\t')).toBe(
        'title\tdescription\nTask 1\t"line 1\nline 2"\n'
      )
    })
  })

  describe('serializeJson', () => {
    it('serializes a matrix with string, numeric, and empty-string cells to formatted JSON with trailing newline', () => {
      const matrix: ExportCell[][] = [
        ['name', 'team', 'hours', 'notes'],
        ['Alice', 'Alpha', 8.5, ''],
        ['Bob', 'Beta', 0, 'on call'],
      ]
      const expected =
        '[\n' +
        '  {\n' +
        '    "name": "Alice",\n' +
        '    "team": "Alpha",\n' +
        '    "hours": 8.5,\n' +
        '    "notes": ""\n' +
        '  },\n' +
        '  {\n' +
        '    "name": "Bob",\n' +
        '    "team": "Beta",\n' +
        '    "hours": 0,\n' +
        '    "notes": "on call"\n' +
        '  }\n' +
        ']\n'
      expect(serializeJson(matrix)).toBe(expected)
    })

    it('returns empty array string when given empty rows or only headers', () => {
      expect(serializeJson([])).toBe('[]\n')
      expect(serializeJson([['name', 'team', 'hours']])).toBe('[]\n')
    })
  })
})

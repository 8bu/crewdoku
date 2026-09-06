/**
 * PDF schedule exporter (wayfinder ticket 18).
 *
 * Wide matrix chunking:
 * Schedule matrices often span 42+ date columns (e.g. 6-week view). On a standard
 * landscape A4 page, rendering 40+ columns in a single table crushes column widths
 * and makes cell text unreadable.
 *
 * To solve this, non-sticky columns are chunked into slices so that each rendered
 * table has at most `MAX_COLUMNS_PER_TABLE` (16) total columns (sticky + slice).
 *
 * `stickyColumns` (default 1) specifies the number of leading identifier columns
 * (such as person name or team) that are repeated on the left of every chunk,
 * ensuring each table slice retains row context.
 */

import { jsPDF } from 'jspdf'
import autoTable, { type Table } from 'jspdf-autotable'
import type { ExportCell } from './exportCsv'

declare module 'jspdf' {
  interface jsPDF {
    lastAutoTable?: Table | false
  }
}

const MAX_COLUMNS_PER_TABLE = 16
const DEFAULT_STICKY_COLUMNS = 1
const MARGIN_PT = 40
const TITLE_Y_PT = 40
const FIRST_TABLE_START_Y = 56
const TABLE_GAP_PT = 16

/**
 * Downloads a landscape A4 PDF representation of the provided tabular rows.
 * Wide tables exceeding `MAX_COLUMNS_PER_TABLE` columns are automatically split
 * across sequential table chunks with `stickyColumns` repeated on each chunk.
 */
export function downloadPdf(
  filename: string,
  title: string,
  rows: ExportCell[][],
  options?: { stickyColumns?: number }
): void {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: 'a4',
  })

  // Empty table or header only: output title and "No rows" placeholder
  const firstRow = rows[0]
  if (rows.length <= 1 || !firstRow || firstRow.length === 0) {
    doc.setFontSize(14)
    doc.text(title, MARGIN_PT, TITLE_Y_PT)
    doc.setFontSize(10)
    doc.text('No rows', MARGIN_PT, TITLE_Y_PT + 20)
    doc.save(filename)
    return
  }

  const headerRow = firstRow
  const dataRows = rows.slice(1)
  const totalCols = headerRow.length
  const rawSticky = options?.stickyColumns ?? DEFAULT_STICKY_COLUMNS
  const stickyCount = Math.max(0, Math.min(rawSticky, totalCols))

  const stickyIndices: number[] = []
  for (let i = 0; i < stickyCount; i++) {
    stickyIndices.push(i)
  }

  const maxNonStickyPerChunk = Math.max(1, MAX_COLUMNS_PER_TABLE - stickyCount)
  const columnChunks: number[][] = []

  for (let start = stickyCount; start < totalCols; start += maxNonStickyPerChunk) {
    const end = Math.min(start + maxNonStickyPerChunk, totalCols)
    const chunkIndices = [...stickyIndices]
    for (let col = start; col < end; col++) {
      chunkIndices.push(col)
    }
    columnChunks.push(chunkIndices)
  }

  if (columnChunks.length === 0) {
    columnChunks.push(stickyIndices)
  }

  doc.setFontSize(14)
  doc.text(title, MARGIN_PT, TITLE_Y_PT)

  let currentStartY = FIRST_TABLE_START_Y

  for (let chunkIdx = 0; chunkIdx < columnChunks.length; chunkIdx++) {
    const colIndices = columnChunks[chunkIdx] ?? []
    const head = [colIndices.map((idx) => String(headerRow[idx] ?? ''))]
    const body = dataRows.map((row) => colIndices.map((idx) => String(row[idx] ?? '')))

    autoTable(doc, {
      startY: currentStartY,
      margin: {
        left: MARGIN_PT,
        right: MARGIN_PT,
        top: MARGIN_PT,
        bottom: MARGIN_PT,
      },
      head,
      body,
      theme: 'grid',
      styles: {
        fontSize: 6.5,
        cellPadding: 2,
        textColor: [30, 30, 30],
        lineColor: [200, 200, 200],
        lineWidth: 0.5,
      },
      headStyles: {
        fillColor: [235, 235, 235],
        textColor: [20, 20, 20],
        fontStyle: 'bold',
        lineColor: [200, 200, 200],
        lineWidth: 0.5,
      },
      alternateRowStyles: {
        fillColor: [250, 250, 250],
      },
    })

    if (doc.lastAutoTable && typeof doc.lastAutoTable.finalY === 'number') {
      currentStartY = doc.lastAutoTable.finalY + TABLE_GAP_PT
    }
  }

  doc.save(filename)
}

import type { TimeRecord } from '../../shared/types'
import { formatClock, formatDateTime, formatDuration, formatTimer, firstStart, lastEnd, netMs, spanMs } from '../../shared/utils/time'
import { pauseGaps } from '../../shared/utils/stats'
import { exportStore } from '../utils/store'

function csvCell(value: string | number): string {
  const text = String(value ?? '')
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

function modeLabel(mode: TimeRecord['mode']): string {
  return mode === 'countdown' ? '倒计时' : '正计时'
}

/** 导出：json 全量；csv 一行一条记录（UTF-8 BOM，Excel 可直接打开） */
export default defineEventHandler(async (event) => {
  const format = (getQuery(event).format as string) || 'json'
  const store = await exportStore()

  if (format === 'csv') {
    const now = Date.now()
    const header = ['日期', '名称', '模式', '开始', '结束', '净时长', '跨度', '暂停次数', '中断标记', '备注']
    const lines = [header.map(csvCell).join(',')]

    for (const record of store.records) {
      const start = firstStart(record)
      const end = lastEnd(record, now)
      const segments = record.segments
      const gaps = pauseGaps(segments)
      const net = netMs(record, now)
      const span = spanMs(record, now)
      const date = start ? formatDateTime(start).slice(0, 10) : ''
      const note = record.deletedAt ? `（已删除）${record.note}` : record.note

      lines.push(
        [
          date,
          record.name,
          modeLabel(record.mode),
          start ? formatDateTime(start) : '',
          record.status === 'running' ? '进行中' : end ? formatDateTime(end) : '',
          formatTimer(net),
          record.status === 'running' ? formatDuration(now - (start ?? now)) : formatTimer(span),
          gaps.length,
          record.interrupted ? '是' : '否',
          note,
        ]
          .map(csvCell)
          .join(','),
      )
    }

    setHeader(event, 'Content-Type', 'text/csv; charset=utf-8')
    setHeader(event, 'Content-Disposition', 'attachment; filename="m3e-timetools.csv"')
    return `\uFEFF${lines.join('\r\n')}`
  }

  setHeader(event, 'Content-Type', 'application/json; charset=utf-8')
  setHeader(event, 'Content-Disposition', 'attachment; filename="m3e-timetools.json"')
  return {
    schemaVersion: store.schemaVersion,
    exportedAt: formatClock(Date.now()),
    colorRegistry: store.colorRegistry,
    records: store.records,
  }
})
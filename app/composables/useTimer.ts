/**
 * 计时引擎：真实数据 = 开始时间戳 + 分段区间，展示时现算差值。
 * 定时器只负责重绘；倒计时结束点由「首段开始 + 设定时长」决定。
 */
import { ref } from 'vue'
import type { Segment, TimeRecord } from '~~/shared/types'
import { countdownEnd } from '~~/shared/utils/time'
import { useRecords } from './useRecords'
import { useToasts } from './useToasts'

export interface ExpiredNotice {
  id: string
  name: string
  endedAt: number
}

const notifiedIds = new Set<string>()
const expiredNotice = ref<ExpiredNotice | null>(null)

/** 以指定时刻收口所有开放段；若开放段开始晚于该时刻则丢弃 */
function closeSegmentsAt(record: TimeRecord, at: number): Segment[] {
  const closed: Segment[] = []
  for (const seg of record.segments) {
    if (seg.end !== null) {
      closed.push({ ...seg })
      continue
    }
    if (seg.start < at) {
      closed.push({ start: seg.start, end: at })
    }
  }
  if (!closed.length) {
    closed.push({ start: Math.max(0, at - 1000), end: at })
  }
  return closed.sort((a, b) => a.start - b.start)
}

function nowMs() {
  return Date.now()
}

/* ------------------------------ 声音提醒 ------------------------------ */

let audioCtx: AudioContext | null = null

/** 必须在用户首次点击时调用，解锁 Web Audio */
export function unlockAudio() {
  if (typeof window === 'undefined') return
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return
  if (!audioCtx) audioCtx = new Ctor()
  if (audioCtx.state === 'suspended') void audioCtx.resume()
}

/** 合成提示音：三声短促低饱和音，无外部音频文件 */
function playChime() {
  if (!audioCtx) return
  const ctx = audioCtx
  void ctx.resume().then(() => {
    const start = ctx.currentTime + 0.05
    const notes = [523.25, 659.25, 783.99]
    notes.forEach((freq, index) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, start + index * 0.22)
      gain.gain.linearRampToValueAtTime(0.14, start + index * 0.22 + 0.04)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + index * 0.22 + 0.2)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(start + index * 0.22)
      osc.stop(start + index * 0.22 + 0.24)
    })
  })
}

/* --------------------------- 窗口标题闪烁提醒 --------------------------- */

let flashTimer: ReturnType<typeof setInterval> | null = null
let flashTimeout: ReturnType<typeof setTimeout> | null = null
let originalTitle = ''
let visibilityBound = false

function stopTitleFlash() {
  if (flashTimer) {
    clearInterval(flashTimer)
    flashTimer = null
  }
  if (flashTimeout) {
    clearTimeout(flashTimeout)
    flashTimeout = null
  }
  if (typeof document !== 'undefined' && originalTitle) {
    document.title = originalTitle
  }
}

function flashTitle(name: string) {
  if (typeof document === 'undefined') return
  stopTitleFlash()
  originalTitle = document.title
  let on = false
  flashTimer = setInterval(() => {
    on = !on
    document.title = on ? `${name} · 到点提醒` : originalTitle
  }, 1200)
  flashTimeout = setTimeout(stopTitleFlash, 60_000)

  if (!visibilityBound) {
    visibilityBound = true
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) stopTitleFlash()
    })
  }
}

/* -------------------------------- 组合逻辑 -------------------------------- */

export function useTimer() {
  const { activeRecord, createRecord, patchRecord } = useRecords()
  const { push } = useToasts()

  async function endRecordAt(record: TimeRecord, at: number, status: 'ended' | 'paused' = 'ended') {
    return await patchRecord(record.id, {
      segments: closeSegmentsAt(record, at),
      status,
    })
  }

  /** 开始新计时；若已有活动记录，先以当前时刻结束（快速切换） */
  async function start(payload: {
    name: string
    mode: 'countup' | 'countdown'
    targetMs: number | null
    note?: string
  }): Promise<TimeRecord | null> {
    unlockAudio()
    const current = activeRecord.value
    if (current) {
      await endRecordAt(current, nowMs())
    }
    return await createRecord({
      name: payload.name,
      mode: payload.mode,
      targetMs: payload.targetMs,
      note: payload.note ?? '',
      startedAt: nowMs(),
    })
  }

  async function pause(): Promise<void> {
    const record = activeRecord.value
    if (!record || record.status !== 'running') return
    await endRecordAt(record, nowMs(), 'paused')
  }

  async function resume(): Promise<void> {
    const record = activeRecord.value
    if (!record || record.status !== 'paused') return
    unlockAudio()
    const segments = [...record.segments, { start: nowMs(), end: null }]
    await patchRecord(record.id, { segments, status: 'running' })
  }

  async function stop(): Promise<void> {
    const record = activeRecord.value
    if (!record) return
    await endRecordAt(record, nowMs())
  }

  /** 暂停状态下继续计时（若非暂停则无动作） */
  async function continueTiming(): Promise<void> {
    const record = activeRecord.value
    if (!record) return
    if (record.status === 'paused') await resume()
  }

  /** 手动补记：开始/结束时间均已确定，直接生成已结束记录 */
  async function createManual(payload: {
    name: string
    start: number
    end: number
    note?: string
  }) {
    return await createRecord({
      name: payload.name,
      mode: 'countup',
      targetMs: null,
      note: payload.note ?? '',
      startedAt: payload.start,
      endedAt: payload.end,
    })
  }

  /**
   * 每次时钟 tick 调用：发现倒计时越过结束点，就按「首段开始 + 设定时长」落库。
   * 不以发现结束时的时间为终点。
   */
  async function checkExpired(now: number): Promise<void> {
    const record = activeRecord.value
    if (!record || record.mode !== 'countdown' || !record.targetMs) return
    if (record.status === 'ended') return
    const end = countdownEnd(record)
    if (!end || now < end) return
    if (notifiedIds.has(record.id)) return
    notifiedIds.add(record.id)

    const updated = await endRecordAt(record, end)
    if (!updated) {
      notifiedIds.delete(record.id)
      return
    }
    expiredNotice.value = { id: record.id, name: record.name, endedAt: end }
    push(`「${record.name}」倒计时结束`, 'warn', 9000)
    playChime()
    flashTitle(record.name)
  }

  function clearNotice() {
    expiredNotice.value = null
  }

  return {
    expiredNotice,
    start,
    pause,
    resume,
    stop,
    endRecordAt,
    continueTiming,
    createManual,
    checkExpired,
    clearNotice,
  }
}
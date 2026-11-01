import type { CreateRecordPayload } from '../../shared/types'
import { createRecord } from '../utils/store'

/** 新建记录（含运行中的记录） */
export default defineEventHandler(async (event) => {
  const body = await readBody<CreateRecordPayload>(event)
  return await createRecord(body)
})
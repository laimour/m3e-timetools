import type { UpdateRecordPayload } from '../../../shared/types'
import { updateRecord } from '../../utils/store'

/** 更新记录；时间/名称/模式/备注变更由服务端追加 revisions */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: '缺少记录 ID' })
  const body = await readBody<UpdateRecordPayload>(event)
  return await updateRecord(id, body)
})
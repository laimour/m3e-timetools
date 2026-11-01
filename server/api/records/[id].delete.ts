import { deleteRecord } from '../../utils/store'

/** 删除记录（软删除 + 留痕） */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: '缺少记录 ID' })
  return await deleteRecord(id)
})

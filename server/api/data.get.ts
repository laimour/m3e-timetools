import { getData } from '../utils/store'

/** 读取全量可见数据、颜色注册表与当前活动记录 */
export default defineEventHandler(async () => {
  return await getData()
})

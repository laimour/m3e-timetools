/**
 * 导出：直接请求服务端导出接口，浏览器按 Content-Disposition 下载。
 */
import { useToasts } from './useToasts'

export function useExport() {
  const { push } = useToasts()

  function download(format: 'json' | 'csv') {
    if (typeof window === 'undefined') return
    const anchor = document.createElement('a')
    anchor.href = `/api/export?format=${format}`
    anchor.rel = 'noopener'
    anchor.download = `m3e-timetools.${format}`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    push(format === 'json' ? '正在导出 JSON' : '正在导出 CSV', 'info', 2600)
  }

  return { download }
}
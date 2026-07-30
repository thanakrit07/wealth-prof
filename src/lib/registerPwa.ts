import { toast } from 'sonner'
import { registerSW } from 'virtual:pwa-register'

export function registerPwa() {
  const updateSW = registerSW({
    onNeedRefresh() {
      toast('มีเวอร์ชันใหม่พร้อมใช้งาน', {
        duration: Infinity,
        action: {
          label: 'อัปเดต',
          onClick: () => updateSW(true),
        },
      })
    },
  })
}

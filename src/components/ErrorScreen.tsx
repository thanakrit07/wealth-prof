import { useState } from 'react'
import { Home, RefreshCw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { clearPersistedCache } from '@/lib/queryClient'

interface Props {
  error: Error
  /** Retry in place. Omitted at the top level, where there is no shell left. */
  onRetry?: () => void
  /** Return to the landing tab. Omitted when the nav itself is gone. */
  onGoHome?: () => void
  /** Full-screen when the whole app is down, inset when only a tab crashed. */
  variant: 'screen' | 'inline'
}

/** Drops every query param — the crashing tab lives in the URL, so a plain
 *  reload would land right back on it. */
function reloadAtHome() {
  window.location.replace(window.location.pathname)
}

export function ErrorScreen({ error, onRetry, onGoHome, variant }: Props) {
  const [clearing, setClearing] = useState(false)

  // Cached data is restored on every load, so a crash caused by a bad cached
  // value survives reloading and closing the app. This is the way out.
  async function clearAndReload() {
    setClearing(true)
    try {
      await clearPersistedCache()
    } finally {
      reloadAtHome()
    }
  }

  return (
    <div
      className={
        variant === 'screen'
          ? 'flex min-h-svh flex-col items-center justify-center gap-4 bg-background p-6 text-center'
          : 'flex flex-col items-center gap-4 p-6 text-center'
      }
    >
      <div className="space-y-1.5">
        <h2 className="font-heading text-base font-medium">หน้านี้มีปัญหา</h2>
        <p className="text-sm text-muted-foreground">
          ข้อมูลของคุณยังอยู่ครบ ไม่ได้หายไปไหน ลองกลับหน้าหลักหรือโหลดใหม่ได้เลย
        </p>
      </div>

      <div className="flex w-full max-w-xs flex-col gap-2">
        <Button onClick={onGoHome ?? reloadAtHome}>
          <Home className="size-4" />
          กลับหน้าหลัก
        </Button>

        {onRetry && (
          <Button variant="outline" onClick={onRetry}>
            <RefreshCw className="size-4" />
            ลองใหม่อีกครั้ง
          </Button>
        )}

        <Button variant="ghost" onClick={clearAndReload} disabled={clearing}>
          <Trash2 className="size-4" />
          {clearing ? 'กำลังล้าง…' : 'ล้างข้อมูลที่แคชไว้แล้วโหลดใหม่'}
        </Button>
      </div>

      {/* The message is the one thing that makes a bug report actionable, so
          it stays reachable — collapsed, since it means nothing to most readers. */}
      <details className="w-full max-w-xs text-left">
        <summary className="cursor-pointer text-xs text-muted-foreground">รายละเอียดข้อผิดพลาด</summary>
        <p className="mt-1.5 rounded-lg bg-muted p-2 font-mono text-[11px] break-words text-muted-foreground">
          {error.message}
        </p>
      </details>
    </div>
  )
}

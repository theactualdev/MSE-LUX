'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { exportConfirmedCsv } from '@/features/admin/newsletter/actions'

/**
 * Turns the action's CSV text into a client-side Blob download. The action
 * owns the data and the ADMIN check; this component owns only the browser
 * mechanics (object URL create + revoke).
 */
export function ExportButton() {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null)
            const result = await exportConfirmedCsv()
            if (!result.ok) {
              setError('Export failed.')
              return
            }
            const url = URL.createObjectURL(new Blob([result.csv], { type: 'text/csv;charset=utf-8' }))
            const anchor = document.createElement('a')
            anchor.href = url
            anchor.download = result.filename
            anchor.click()
            URL.revokeObjectURL(url)
          })
        }
      >
        Export confirmed (CSV)
      </Button>
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </div>
  )
}

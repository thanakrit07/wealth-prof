import { useState } from 'react'
import { Copy, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useHousehold } from '@/lib/HouseholdContext'
import { useGenerateInvite, usePendingInvites, useRevokeInvite } from '@/lib/invite'

function inviteUrl(code: string): string {
  return `${window.location.origin}/?invite=${code}`
}

export function InviteSection() {
  const { householdId } = useHousehold()
  const { data: pending } = usePendingInvites(householdId)
  const generate = useGenerateInvite(householdId)
  const revoke = useRevokeInvite(householdId)
  const [partnerName, setPartnerName] = useState('')

  async function copy(text: string) {
    await navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard')
  }

  return (
    <section className="space-y-2">
      <h2 className="font-heading text-sm font-medium text-muted-foreground">Invite your partner</h2>

      {(pending ?? []).map((invite) => (
        <div key={invite.id} className="space-y-2 rounded-xl border bg-card p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm">
              Invite pending for <span className="font-medium">{invite.display_name}</span>
            </p>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              onClick={() => revoke.mutate(invite.id)}
              aria-label="Revoke invite"
            >
              <X className="size-3.5" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Input readOnly value={inviteUrl(invite.invite_code)} className="text-xs" />
            <Button size="icon" variant="outline" onClick={() => copy(inviteUrl(invite.invite_code))} aria-label="Copy invite link">
              <Copy className="size-4" />
            </Button>
          </div>
        </div>
      ))}

      {(pending ?? []).length === 0 && (
        <div className="space-y-2 rounded-xl border bg-card p-3">
          <Label htmlFor="partner-name">Partner's name</Label>
          <div className="flex gap-2">
            <Input
              id="partner-name"
              placeholder="e.g. Nam"
              value={partnerName}
              onChange={(e) => setPartnerName(e.target.value)}
            />
            <Button
              onClick={() => generate.mutate(partnerName.trim())}
              disabled={!partnerName.trim() || generate.isPending}
            >
              Create invite
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}

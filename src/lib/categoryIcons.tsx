import {
  Banknote,
  Bus,
  Car,
  Clapperboard,
  CreditCard,
  Gift,
  GraduationCap,
  HeartPulse,
  Home,
  Phone,
  Plane,
  Repeat,
  Shield,
  ShoppingBag,
  Sparkles,
  UtensilsCrossed,
  Wallet,
} from 'lucide-react'
import type { ComponentType } from 'react'

// Curated icon set for categories and the quick-add icon grid (DESIGN.md
// §7.2). Keyed by a stable string stored in categories.icon.
export const CATEGORY_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  installments: CreditCard,
  insurance: Shield,
  food: UtensilsCrossed,
  transport: Bus,
  car: Car,
  shopping: ShoppingBag,
  phone: Phone,
  entertainment: Clapperboard,
  health: HeartPulse,
  education: GraduationCap,
  housing: Home,
  travel: Plane,
  salary: Banknote,
  bonus: Gift,
  recurring: Repeat,
  other: Sparkles,
  wallet: Wallet,
}

export function CategoryIcon({ icon, className }: { icon: string | null; className?: string }) {
  const Icon = (icon && CATEGORY_ICONS[icon]) || Sparkles
  return <Icon className={className} />
}

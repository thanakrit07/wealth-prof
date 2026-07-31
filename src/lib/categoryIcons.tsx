import {
  Banknote,
  Baby,
  Bike,
  Book,
  Briefcase,
  Bus,
  Car,
  Clapperboard,
  Coffee,
  CreditCard,
  Dog,
  Dumbbell,
  Fuel,
  Gamepad2,
  Gift,
  GraduationCap,
  HandCoins,
  HeartPulse,
  Home,
  Laptop,
  Music,
  PawPrint,
  Phone,
  PiggyBank,
  Pill,
  Plane,
  Receipt,
  Repeat,
  Scissors,
  Shield,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Sofa,
  Sparkles,
  Stethoscope,
  Train,
  Trees,
  Tv,
  UtensilsCrossed,
  Wallet,
  Wifi,
  Wine,
  Wrench,
  Zap,
} from 'lucide-react'
import type { ComponentType } from 'react'

// Curated icon set for categories and the quick-add icon grid (DESIGN.md
// §7.2). Keyed by a stable string stored in categories.icon.
export const CATEGORY_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  // Food & drink
  food: UtensilsCrossed,
  coffee: Coffee,
  wine: Wine,
  groceries: ShoppingCart,
  // Transport
  transport: Bus,
  car: Car,
  fuel: Fuel,
  train: Train,
  bike: Bike,
  plane: Plane,
  // Home & bills
  housing: Home,
  furniture: Sofa,
  utilities: Zap,
  wifi: Wifi,
  phone: Phone,
  mobile: Smartphone,
  repair: Wrench,
  // Lifestyle
  shopping: ShoppingBag,
  clothing: Shirt,
  beauty: Scissors,
  entertainment: Clapperboard,
  games: Gamepad2,
  music: Music,
  tv: Tv,
  book: Book,
  travel: Plane,
  outdoors: Trees,
  // Health & family
  health: HeartPulse,
  medicine: Pill,
  doctor: Stethoscope,
  fitness: Dumbbell,
  baby: Baby,
  pet: Dog,
  paw: PawPrint,
  // Money & work
  installments: CreditCard,
  insurance: Shield,
  salary: Banknote,
  bonus: Gift,
  work: Briefcase,
  savings: PiggyBank,
  invest: HandCoins,
  bill: Receipt,
  recurring: Repeat,
  education: GraduationCap,
  laptop: Laptop,
  wallet: Wallet,
  other: Sparkles,
}

/**
 * Renders a category's icon. `icon` is either a key from CATEGORY_ICONS or
 * any other string, which is printed as-is so an emoji typed by the user
 * works as a custom icon (DESIGN.md §4.2 v3.1) — no upload, no storage, no
 * schema change, and it renders offline.
 */
export function CategoryIcon({ icon, className }: { icon: string | null; className?: string }) {
  if (icon && icon in CATEGORY_ICONS) {
    const Icon = CATEGORY_ICONS[icon]
    return <Icon className={className} />
  }
  if (icon && icon.trim()) {
    // Match the lucide icons' box so grids and rows stay aligned; the font
    // size is set in em so it tracks whatever size-* class the caller used.
    return (
      <span className={className} aria-hidden style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1em', lineHeight: 1 }}>
        {icon}
      </span>
    )
  }
  return <Sparkles className={className} />
}

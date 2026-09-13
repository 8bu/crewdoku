// The app's single icon set — lucide-react line icons, replacing the former
// geometric-Unicode marks (▾ ✕ ✓ ⚠ → − +). One import site keeps the set
// curated and the visual language consistent; callers set size and colour via
// className (Tailwind `h-*`/`w-*`, `currentColor`). `WarningTriangleIcon` keeps
// its old name so the fairness cells read the same.
export {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  X,
  Check,
  Plus,
  Minus,
  ArrowRight,
  Upload,
  TriangleAlert,
  TriangleAlert as WarningTriangleIcon,
} from 'lucide-react'

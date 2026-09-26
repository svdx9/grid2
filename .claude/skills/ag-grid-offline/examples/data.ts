export const REGIONS = ["North", "South", "East", "West", "Central"] as const
export type Region = (typeof REGIONS)[number]

export interface Order {
  id: string
  sku: string // text with leading zeros — the classic Excel round-trip casualty
  customer: string
  region: Region | null
  product: string
  quantity: number | null
  unitPrice: number | null
  orderDate: string | null // ISO YYYY-MM-DD
  shipped: boolean | null
  notes: string
}

let seq = 0
export function newRowId(): string {
  seq += 1
  return `new-${Date.now().toString(36)}-${seq}`
}

export function emptyOrder(): Order {
  return {
    id: newRowId(),
    sku: "",
    customer: "",
    region: null,
    product: "",
    quantity: null,
    unitPrice: null,
    orderDate: null,
    shipped: false,
    notes: "",
  }
}

// deterministic PRNG so every reload shows the same data
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const CUSTOMERS = [
  "Acme Corp", "Globex", "Initech", "Umbrella", "Stark Industries",
  "Wayne Enterprises", "Wonka Ltd", "Soylent", "Hooli", "Pied Piper",
  "Müller & Söhne GmbH", "Société Générale Café", "東京商事", "O'Reilly Media",
]
const PRODUCTS: [string, number][] = [
  ["Widget", 4.5], ["Gadget", 12.99], ["Sprocket", 0.85], ["Gizmo", 49.0],
  ["Doohickey", 7.25], ["Thingamajig", 129.5], ["Whatsit", 2.1], ["Contraption", 1499.99],
]
// deliberately awkward text: commas, quotes, newlines, tabs-free unicode
const NOTES = [
  "",
  "",
  "Deliver to loading bay 3",
  "Customer asked for \"express\" shipping",
  "Split shipment, second half next week",
  "Line 1 of address\nLine 2 of address",
  "Invoice #4471; net 30",
  "Priority — call before delivery",
  "=SUM(A1:A2) is just text here",
  "Leading zeros matter: 007",
]

export function generateOrders(count = 250): Order[] {
  const rand = mulberry32(42)
  const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)]
  const start = Date.UTC(2025, 0, 1)
  return Array.from({ length: count }, (_, i) => {
    const [product, price] = pick(PRODUCTS)
    const d = new Date(start + Math.floor(rand() * 600) * 86400000)
    return {
      id: `ord-${i + 1}`,
      sku: String(Math.floor(rand() * 5000)).padStart(5, "0"),
      customer: pick(CUSTOMERS),
      region: pick(REGIONS),
      product,
      quantity: 1 + Math.floor(rand() * 200),
      unitPrice: price,
      orderDate: d.toISOString().slice(0, 10),
      shipped: rand() > 0.4,
      notes: pick(NOTES),
    }
  })
}

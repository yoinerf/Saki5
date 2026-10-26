import { supabase } from './supabase'

// Calificación de cada producto: promedio (1 decimal) y cantidad de reseñas reales.
// Sale de la vista product_rating_stats, que agrupa en la base: las vitrinas ya no descargan
// todas las reseñas. Sin reseñas un producto no aparece (calificación 0 = "sin reseñas").

export interface RatingStats {
  rating: number
  reviews: number
}

/** Calificaciones por producto. productIds limita la consulta (hasta ~100 ids). */
export async function fetchRatingStats(productIds?: string[]): Promise<Map<string, RatingStats>> {
  const stats = new Map<string, RatingStats>()
  if (productIds && productIds.length === 0) return stats

  let query = supabase.from('product_rating_stats').select('product_id, rating, reviews')
  if (productIds) query = query.in('product_id', productIds)
  const { data, error } = await query

  if (!error) {
    for (const row of data ?? []) {
      if (row.product_id && row.reviews) stats.set(row.product_id, { rating: Number(row.rating), reviews: row.reviews })
    }
    return stats
  }

  // Respaldo mientras la migración 20261026150000 no esté aplicada: calcular en el navegador
  console.error('Error cargando product_rating_stats:', error.message)
  let fallback = supabase.from('product_reviews').select('product_id, rating')
  if (productIds) fallback = fallback.in('product_id', productIds)
  const { data: reviews } = await fallback
  const grouped = new Map<string, number[]>()
  for (const r of reviews ?? []) {
    if (!r.product_id) continue
    grouped.set(r.product_id, [...(grouped.get(r.product_id) ?? []), r.rating])
  }
  for (const [id, ratings] of grouped) {
    stats.set(id, { rating: Number((ratings.reduce((sum, v) => sum + v, 0) / ratings.length).toFixed(1)), reviews: ratings.length })
  }
  return stats
}

import { useEffect, useState } from "react"

/** how long each rankings page is shown before rotating to the next (ms) */
export const RANKINGS_PAGE_MS = 10_000
/** teams shown per rankings page */
export const RANKINGS_PAGE_SIZE = 10

/**
 * Rotates through fixed-size pages of a list on an interval — used by the
 * rankings views so every team cycles onto the display/TV (ranks 1–10, then
 * 11–20, …). Resets to the first page whenever the component remounts (e.g. the
 * rankings view is shown again) and clamps gracefully when the list changes.
 */
export function useRotatingPage(
  itemCount: number,
  pageSize: number,
  intervalMs = RANKINGS_PAGE_MS
) {
  const pageCount = Math.max(1, Math.ceil(itemCount / pageSize))
  const [page, setPage] = useState(0)

  useEffect(() => {
    if (pageCount <= 1) return
    const id = setInterval(
      () => setPage((p) => (p + 1) % pageCount),
      intervalMs
    )
    return () => clearInterval(id)
  }, [pageCount, intervalMs])

  const safePage = page % pageCount
  const start = safePage * pageSize
  return { page: safePage, pageCount, start, end: start + pageSize }
}

/**
 * Cursor page as the domain sees it. Structurally identical to
 * PaginatedResponseDto in @workspace/contracts, and deliberately a separate
 * type: the contract is a public API promise, this is an internal shape, and
 * they must be free to diverge.
 */
export interface Page<T> {
  items: T[]
  nextCursor: string | null
  hasMore: boolean
}

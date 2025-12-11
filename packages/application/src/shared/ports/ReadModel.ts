/**
 * Generic read model contract for CQRS query handlers.
 */
export interface ReadModel<
  TDto,
  TFilter = Record<never, never>,
  TSearchFilter = TFilter,
> {
  list(filter?: TFilter): Promise<TDto[]>;

  getById(id: string): Promise<TDto | null>;

  search(term: string, filter?: TSearchFilter): Promise<TDto[]>;
}

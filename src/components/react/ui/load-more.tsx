import { Button } from './button';

type Props = {
  /** Whether another page exists. When false the primitive renders nothing. */
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  /** Disable the button (e.g. while a refetch of earlier pages runs). */
  disabled?: boolean;
};

/**
 * Shared "Muat lebih banyak" footer for every cursor-paginated list. Hides
 * itself when there is nothing left to load, so callers only decide *where*
 * to place it.
 */
export function LoadMore({ hasNextPage, isFetchingNextPage, fetchNextPage, disabled }: Props) {
  if (!hasNextPage) return null;
  return (
    <div className="flex justify-center">
      <Button
        variant="secondary"
        size="sm"
        loading={isFetchingNextPage}
        disabled={disabled}
        onClick={fetchNextPage}
      >
        Muat lebih banyak
      </Button>
    </div>
  );
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  archiveCategory,
  createCategory,
  listCategoryTree,
  updateCategory,
  type CategoryInput,
} from './repository';
import type { CategoryType } from '@/db/schema';
import { invalidateTransactionData } from '@/features/transactions/invalidate';

/** key: ['categories', type] */
export function useCategoryTree(type: CategoryType) {
  return useQuery({
    queryKey: ['categories', type],
    queryFn: () => listCategoryTree(type),
  });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CategoryInput) => createCategory(input),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: ['categories'] }), invalidateTransactionData(qc)]),
  });
}

export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: Pick<CategoryInput, 'name' | 'icon' | 'color'>;
    }) => updateCategory(id, input),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: ['categories'] }), invalidateTransactionData(qc)]),
  });
}

export function useArchiveCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => archiveCategory(id),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: ['categories'] }), invalidateTransactionData(qc)]),
  });
}

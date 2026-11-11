import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { acknowledgeInsight, listActiveInsights } from './repository';

/** key: ['insights'] — 展示中的洞察 */
export function useActiveInsights() {
  return useQuery({
    queryKey: ['insights'],
    queryFn: listActiveInsights,
  });
}

export function useAcknowledgeInsight() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => acknowledgeInsight(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['insights'] }),
  });
}

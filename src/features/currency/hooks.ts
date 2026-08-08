import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getRates, refreshRates } from './repository';

/** 汇率缓存（queryKey: ['rates']）。刷新后自动重渲染调用方（表单/汇率页）。 */
export function useRates() {
  return useQuery({ queryKey: ['rates'], queryFn: getRates });
}

/** 手动刷新汇率；成功/失败都 invalidate ['rates'] 以回显最新状态。 */
export function useRefreshRates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => refreshRates(),
    onSettled: () => qc.invalidateQueries({ queryKey: ['rates'] }),
  });
}

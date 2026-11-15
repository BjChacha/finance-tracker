import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { smartRecognitionSummary } from "./repository";

const QUERY_KEY = ["smart-recognition", "summary"] as const;

/**
 * Recognition spend is written from a background call and the generated-transaction share changes
 * with every bookkeeping save, so the profile tab refetches whenever it is shown.
 */
export function useSmartRecognitionSummary() {
  const queryClient = useQueryClient();
  useFocusEffect(
    useCallback(() => {
      void queryClient.invalidateQueries({ queryKey: ["smart-recognition"] });
    }, [queryClient]),
  );
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => smartRecognitionSummary(),
    staleTime: 0,
  });
}

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { llmUsageSummary } from "./repository";

const QUERY_KEY = ["llm-usage", "summary"] as const;

/** Billing is written from a background call, so the profile tab refreshes whenever it is shown. */
export function useLLMUsageSummary() {
  const queryClient = useQueryClient();
  useFocusEffect(
    useCallback(() => {
      void queryClient.invalidateQueries({ queryKey: ["llm-usage"] });
    }, [queryClient]),
  );
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => llmUsageSummary(),
    staleTime: 0,
  });
}

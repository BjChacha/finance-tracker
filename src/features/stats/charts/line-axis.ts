function niceCeil(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  return (
    (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) *
    magnitude
  );
}

export function lineAxis(values: number[]) {
  const low = Math.min(...values, 0);
  const high = Math.max(...values, 0);
  const stepValue = niceCeil((high - low) / 4);
  if (low < 0)
    return {
      yAxisOffset: 0,
      stepValue,
      maxValue: Math.max(stepValue, Math.ceil(high / stepValue) * stepValue),
      noOfSections: Math.max(1, Math.ceil(high / stepValue)),
      noOfSectionsBelowXAxis: Math.ceil(-low / stepValue),
    };
  const actualLow = Math.min(...values);
  const span = high - actualLow;
  const pad = span * 0.1 || high * 0.1 || 1;
  const step = niceCeil((span + 2 * pad) / 4);
  const offset =
    actualLow > high * 0.3
      ? Math.max(0, Math.floor((actualLow - pad) / step) * step)
      : 0;
  const resolvedStep = offset ? step : stepValue;
  const sections = Math.max(1, Math.ceil((high - offset + pad) / resolvedStep));
  return {
    yAxisOffset: offset,
    stepValue: resolvedStep,
    maxValue: sections * resolvedStep,
    noOfSections: sections,
    noOfSectionsBelowXAxis: 0,
  };
}

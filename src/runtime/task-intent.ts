export function extractExpectedOutputFromTaskRequest(request: string) {
  const quotedMatches = [...request.matchAll(/\b(?:print|prints|output|outputs|return|returns)\b[\s\S]{0,80}?\bexact(?:ly)?\b[\s\S]{0,20}?["'`]([^"'`]+)["'`]/gi)];
  const quotedMatch = quotedMatches.at(-1);

  if (quotedMatch?.[1]?.trim()) {
    return quotedMatch[1].trim();
  }

  const plainExactMatches = [...request.matchAll(/\b(?:print|prints|output|outputs|return|returns)\b[\s\S]{0,80}?\bexact(?:ly)?\b\s+([A-Za-z0-9._-]+)/gi)];
  const plainExactMatch = plainExactMatches.at(-1);

  if (plainExactMatch?.[1]?.trim()) {
    return plainExactMatch[1].trim();
  }

  const backtickValues = [...request.matchAll(/`([^`]+)`/g)]
    .map((match) => match[1]?.trim())
    .filter((value): value is string => Boolean(value));

  return backtickValues.at(-1);
}

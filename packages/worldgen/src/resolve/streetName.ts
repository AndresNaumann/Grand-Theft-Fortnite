const SUFFIXES: readonly [RegExp, string][] = [
  [/\bStreet$/, "St"],
  [/\bAvenue$/, "Ave"],
  [/\bRoad$/, "Rd"],
  [/\bBoulevard$/, "Blvd"],
  [/\bPlace$/, "Pl"],
  [/\bSquare$/, "Sq"],
  [/\bDrive$/, "Dr"],
  [/\bCourt$/, "Ct"],
  [/\bLane$/, "Ln"],
  [/\bTerrace$/, "Ter"],
  [/\bParkway$/, "Pkwy"],
  [/\bHighway$/, "Hwy"],
  [/\bAlley$/, "Aly"],
  [/\bExpressway$/, "Expy"],
];

/** "Boylston Street" -> "Boylston St". Only the trailing suffix is abbreviated. */
export function abbreviateStreetName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  for (const [re, abbr] of SUFFIXES) if (re.test(trimmed)) return trimmed.replace(re, abbr);
  return trimmed;
}

/** Palette (SPEC §7.1). All colors in the game come from here. */
export const PALETTE = {
  grass: "#7ED957",
  park: "#5CC24A",
  forest: "#3FA34D",
  water: "#3FA9F5",
  sand: "#F6D48F",
  road: "#4A4E5A",
  footway: "#D9C7A3",
  roadMarking: "#F5F5F5",
  walls: ["#F2E8CF", "#F4A261", "#E76F51", "#8ECAE6", "#B5E48C", "#FFD166", "#CDB4DB"],
  roofs: ["#6D597A", "#B56576", "#355070", "#E56B6F"],
  skyTop: "#4FC3F7",
  skyHorizon: "#B3E5FC",
  outline: "#1B1B2F",
  /** Tree trunks (not in SPEC §7.1 table; added in M1, see Decisions Log). */
  trunk: "#8D6346",

  // Street detail (M1.5; see Decisions Log).
  markingYellow: "#FFC93C",
  bikeLane: "#36B37E",
  curb: "#BFB3A0",
  signRed: "#E63946",
  signGreen: "#2E8B57",
  signWhite: "#FFFFFF",
  metal: "#5C6370",
  lampPost: "#2B2D42",
  lampGlobe: "#FFF4D6",
  signalHousing: "#2B2D42",
  signalRed: "#FF4D4D",
  signalYellow: "#FFC93C",
  signalGreen: "#3CDC7C",

  // Lighting tints (derived from the palette, SPEC §7.2).
  sun: "#FFF1D6",
  hemiSky: "#B3E5FC",
  hemiGround: "#7ED957",
} as const;

// Every rule number in the sandbox lives here. Bump RULES_VERSION whenever a change alters battle outcomes.
export const RULES_VERSION = 1;

export const SETTINGS = {
  /** Share of a firing machine-gun-armed (holding/trench) unit's men that hit per minute. */
  mgLethality: 0.004,
  /** Same, for infantry firing on the move or in the open. */
  rifleLethality: 0.001,
  /** Share of a shelled unit's men hit per minute under a barrage or battery fire. */
  shellLethality: 0.002,
  /** How fast the creeping barrage moves forward (m per minute). */
  barrageSpeedMPerMin: 30,
  /** Depth of the barrage band (m). */
  barrageDepthM: 150,
  /** Minutes a garrison needs to man the parapet after the barrage lifts off it. */
  emergeMin: 3,
  /** Infantry advance speed over open ground (m per minute). */
  advanceMPerMin: 40,
  /** Speed multiplier through uncut wire (cut wire scales it back towards 1). */
  wireSlow: 0.25,
  /** Depth of a wire belt: units within this distance of a wire line are slowed (m). */
  wireBeltM: 100,
  /** Morale below which an advancing unit goes to ground (pinned). */
  pinAt: 0.6,
  /** Morale below which a unit falls back. */
  breakAt: 0.25,
  /** Share of a trapped garrison that surrenders (the rest flee). */
  surrenderTrappedFrac: 0.8,
  /** Usual minutes before an order reaches its unit (each order takes 0.5–2 × this). */
  orderDelayMin: 20,
  /** Reserve march speed on the way to the fight (m per minute). */
  reserveMarchMPerMin: 70,
  /** A defender reserve this close behind the gun line seals its sector against breakthrough (m). */
  sealDistanceM: 750,
  /** Minutes the attacker must hold every stronghold to break the deadlock. */
  strongholdHoldMin: 60,
  /** Surrender: the deadlock breaks when this share of the defender's men at Zero are captured (owner's rule). */
  surrenderFrac: 0.5,
  /** Collapse: the deadlock breaks when the defender's fit men fall below this share of its men at Zero (owner's rule). */
  collapseFrac: 0.1,
  /** Share of fire a unit escapes in its own trench, in a village, in a wood. */
  coverTrench: 0.7, coverVillage: 0.5, coverWood: 0.4,
  /** How close (along the attack) an attacker must be to trap a garrison still sheltering, and the frontage a battalion holds (m). */
  trapDistanceM: 50, frontageM: 400,
  /** How far batteries reach, and how far a battalion can spot targets for them and for its commander (m). */
  batteryRangeM: 5000, spotterRangeM: 2000,
  /** A called barrage: its radius (m), how long it fires (min), and how long the guns need before the next (min). */
  pointBarrageRadiusM: 150, pointBarrageMin: 10, barrageCooldownMin: 45,
  /** How close an attacker must stand to a stronghold, with no defender as close, to hold it (m). */
  holdRadiusM: 300,
  /** The battle ends after this many quiet minutes, or at this length (min). */
  quietMin: 120, battleMaxMin: 2880,
  /** Most units one side may field. */
  maxUnitsPerSide: 40,
  /** Rifle and machine-gun range (m). */
  rangeM: 800,
};
export type Settings = typeof SETTINGS;

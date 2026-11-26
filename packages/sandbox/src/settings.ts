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
  barrageSpeedMPerMin: 50,
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
  surrenderTrappedFrac: 0.5,
  /** Minutes before an order reaches its unit. */
  orderDelayMin: 20,
  /** Reserve march speed on the way to the fight (m per minute). */
  reserveMarchMPerMin: 70,
  /** A defender reserve this close behind the gun line seals its sector against breakthrough (m). */
  sealDistanceM: 1000,
  /** Minutes the attacker must hold every stronghold to break the deadlock. */
  strongholdHoldMin: 60,
  /** Most units one side may field. */
  maxUnitsPerSide: 40,
  /** Rifle and machine-gun range (m). */
  rangeM: 800,
};
export type Settings = typeof SETTINGS;

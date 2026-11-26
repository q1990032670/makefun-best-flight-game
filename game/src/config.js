// Skyharbor Run — shared tuning constants.
// Every module imports from here so the flight model, the world and the
// renderer agree on one set of numbers.

export const VIEW = {
  width: 1280,
  height: 800,
  focal: 620, // perspective focal length in pixels
  near: 6, // metres; geometry closer than this is clipped
  far: 5200, // metres; nothing beyond this is drawn
  cameraBack: 26, // chase camera distance behind the aircraft, metres
  cameraUp: 6, // chase camera height above the aircraft, metres
};

export const PLANE = {
  minThrottle: 0,
  maxThrottle: 1,
  idleThrottle: 0.12,
  maxThrustAccel: 9.5, // m/s^2 at full throttle, sea level
  dragBase: 0.011, // parasitic drag coefficient
  dragInduced: 0.55, // extra drag while turning or climbing hard
  stallSpeed: 24, // m/s; below this the wing stops holding the nose up
  cruiseSpeed: 58, // m/s; the speed the trim tries to settle near
  maxSpeed: 118, // m/s structural limit
  pitchRate: 0.85, // rad/s of pitch authority at cruise
  rollRate: 1.9, // rad/s of roll authority
  maxBank: 1.15, // rad, about 66 degrees
  turnPerBank: 0.62, // heading change per radian of bank, per second, scaled
  gravity: 9.81,
  groundRollFriction: 0.55,
  brakeDecel: 6.5,
  fuelBurnFull: 0.62, // fuel units per second at full throttle
  fuelBurnIdle: 0.07,
  tankSize: 100,
};

export const WORLD = {
  cell: 220, // ground patch size in metres
  valleyHalfWidth: 2600, // playable ground extends this far east/west
  valleyLength: 15000, // and this far north from the home runway
  riverAmplitude: 620, // how far the river meanders, metres
  riverWidth: 130,
  ringRadius: 26, // fly-through gate radius in metres
  ringTube: 3.2,
};

export const RUNWAY = {
  // The home strip sits at the south end of the valley, pointing north.
  x: 0,
  z: 0, // ground level
  startY: -500, // threshold (south end)
  length: 1500,
  width: 46,
  heading: 0, // degrees; 0 = north
};

export const SCORING = {
  ringBase: 100,
  ringCentreBonus: 60, // extra for threading the middle of a gate
  landingBase: 400,
  landingSoftBonus: 250, // gentle touchdown
  landingCentreBonus: 150, // on the centreline
  secondPerFuelLeft: 4, // end-of-sortie bonus per fuel unit remaining
};

export const SORTIES = [
  { name: 'Valley Familiarisation', rings: 5, fuel: 100, wind: 0, par: 150 },
  { name: 'River Run', rings: 7, fuel: 92, wind: 2.5, par: 130 },
  { name: 'High Gates', rings: 9, fuel: 88, wind: 4.5, par: 115 },
  { name: 'Dusk Circuit', rings: 11, fuel: 84, wind: 6.5, par: 100 },
];

export const STEP = 1 / 120; // fixed physics step, seconds

// Deterministic damped angular response. Re-evaluate from t=0 at a fixed solver step;
// output FPS and request order cannot change the result.
export function secondaryAngle(config, clip, time, sample) {
  const driver = clip.tracks.find(
    (t) => t.part === config.driver && t.property === config.property,
  );
  if (!driver || time <= 0 || time >= clip.duration) return 0;
  const hz = config.frequencyHz,
    omega = 2 * Math.PI * hz,
    zeta = config.damping,
    dt = 1 / 240;
  let x = 0,
    v = 0;
  const n = Math.ceil(time / dt);
  const epsilon = 1 / 480;
  const acceleration = (t) => {
    const a = sample(driver.keys, Math.max(0, t - epsilon)),
      b = sample(driver.keys, t),
      c = sample(driver.keys, Math.min(clip.duration, t + epsilon));
    return (c - 2 * b + a) / (epsilon * epsilon);
  };
  for (let i = 0; i < n; i++) {
    const step = Math.min(dt, time - i * dt),
      force = -config.gain * acceleration(i * dt),
      a = force - 2 * zeta * omega * v - omega * omega * x;
    v += a * step;
    x += v * step;
  }
  const remaining = (clip.duration - time) / (clip.duration * 0.18),
    u = Math.max(0, Math.min(1, remaining)),
    envelope = u * u * u * (u * (u * 6 - 15) + 10);
  return (
    Math.max(-config.maxDegrees, Math.min(config.maxDegrees, x)) * envelope
  );
}

// Deterministic damped angular response evaluated from t=0 with fixed RK4 steps.
// Driver acceleration is the analytic derivative of the authored interpolation;
// clamping a finite difference at t=0 otherwise invents an impulse on linear tracks.
export function secondaryAngle(config, clip, time, sample) {
  if (!Number.isFinite(time) || !Number.isFinite(config.frequencyHz) || config.frequencyHz <= 0 ||
      !Number.isFinite(config.damping) || config.damping < 0 || !Number.isFinite(config.gain) ||
      !Number.isFinite(config.maxDegrees) || config.maxDegrees < 0) throw Error("Invalid secondary solver input");
  const driver = clip.tracks.find((t) => t.part === config.driver && t.property === config.property);
  if (!driver || time <= 0 || time >= clip.duration) return 0;
  const omega = 2 * Math.PI * config.frequencyHz, dt = 1 / 240;
  const acceleration = (t) => {
    for (let i = 1; i < driver.keys.length; i++) {
      const a = driver.keys[i - 1], b = driver.keys[i], duration = b.time - a.time;
      if (t < a.time || t > b.time || b.ease === "linear") continue;
      const u = (t - a.time) / duration;
      return (b.value - a.value) * 60 * u * (2 * u * u - 3 * u + 1) / (duration * duration);
    }
    return 0;
  };
  const rate = (t, x, v) => [v, -config.gain * acceleration(t) - 2 * config.damping * omega * v - omega * omega * x];
  let x = 0, v = 0;
  const n = Math.ceil(time / dt);
  for (let i = 0; i < n; i++) {
    const t = i * dt, h = Math.min(dt, time - t), a = rate(t, x, v),
      b = rate(t + h / 2, x + h * a[0] / 2, v + h * a[1] / 2),
      c = rate(t + h / 2, x + h * b[0] / 2, v + h * b[1] / 2),
      d = rate(t + h, x + h * c[0], v + h * c[1]);
    x += h * (a[0] + 2 * b[0] + 2 * c[0] + d[0]) / 6;
    v += h * (a[1] + 2 * b[1] + 2 * c[1] + d[1]) / 6;
  }
  const u = Math.max(0, Math.min(1, (clip.duration - time) / (clip.duration * 0.18)));
  const envelope = u * u * u * (u * (u * 6 - 15) + 10);
  return Math.max(-config.maxDegrees, Math.min(config.maxDegrees, x)) * envelope;
}

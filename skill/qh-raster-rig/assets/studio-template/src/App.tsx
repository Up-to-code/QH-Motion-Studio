import { resizePart } from "../core/edit.mjs";
import { useEffect, useRef, useState } from "react";
import {
  Layers,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  Play,
  Pause,
  SkipBack,
  Download,
  Save,
  Grid2X2,
  Move,
  Columns2,
  Eye,
  EyeOff,
  Plus,
  Upload,
  Check,
  LoaderCircle,
  X,
  Settings2,
  Diamond,
  Film,
} from "lucide-react";
import { Dialog } from "radix-ui";
import { Button } from "./components/ui/button";
import Stage from "./components/Stage";
import type { Project, Clip, Part } from "./types";
async function api(url: string, method = "GET", body?: unknown) {
  const res = await fetch("/api/" + url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw Error(data.error || "Request failed");
  return data;
}
const modes = [
  ["artwork", "Artwork"],
  ["gray", "Grayscale"],
  ["parts", "Part IDs"],
  ["distance", "Boundary distance"],
  ["order", "Draw order"],
];
export default function App() {
  const [project, setProject] = useState<Project | null>(null),
    [characters, setCharacters] = useState<
      { id: string; name: string; mode: string }[]
    >([]),
    [character, setCharacter] = useState("fox"),
    [sidebar, setSidebar] = useState(true),
    [tab, setTab] = useState("motions"),
    [selected, setSelected] = useState<string | null>(null),
    [time, setTime] = useState(0),
    [playing, setPlaying] = useState(false),
    [grid, setGrid] = useState(false),
    [joints, setJoints] = useState(false),
    [mode, setMode] = useState("artwork"),
    [compare, setCompare] = useState(false),
    [compareId, setCompareId] = useState("hello-b"),
    [hidden, setHidden] = useState<string[]>([]),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(""),
    [message, setMessage] = useState(""),
    [generation, setGeneration] = useState(false),
    [action, setAction] = useState("hello"),
    [fps, setFps] = useState(24),
    [target, setTarget] = useState(95),
    [keySelection, setKeySelection] = useState<{
      track: number;
      key: number;
    } | null>(null),
    [exportOpen, setExportOpen] = useState(false),
    [storage, setStorage] = useState(""),
    [analysis, setAnalysis] = useState<any>(null);
  const upload = useRef<HTMLInputElement>(null);
  const current = project?.clips.find((c) => c.id === project.selected),
    part = project?.rig.parts.find((p) => p.id === selected),
    other = project?.clips.find((c) => c.id === compareId);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;
  useEffect(() => {
    api("characters")
      .then((d) => {
        setCharacters(d.characters);
        setStorage(d.storage);
      })
      .catch((e) => setMessage(e.message));
  }, []);
  useEffect(() => {
    let cancelled = false;
    setPlaying(false);
    setTime(0);
    setHidden([]);
    setSelected(null);
    setKeySelection(null);
    api("project/" + character)
      .then((p) => {
        if (!cancelled) {
          setProject(p);
          setDirty(false);
          setAnalysis(null);
        }
      })
      .catch((e) => setMessage(e.message));
    return () => {
      cancelled = true;
    };
  }, [character]);
  useEffect(() => {
    const interval = setInterval(() => {
      api("characters")
        .then((d) => setCharacters(d.characters))
        .catch(() => {});
      if (dirtyRef.current) return;
      api("project/" + character)
        .then((p) =>
          setProject((old) => (old && old.revision === p.revision ? old : p)),
        )
        .catch(() => {});
    }, 3000);
    return () => clearInterval(interval);
  }, [character]);
  useEffect(() => {
    if (!playing || !current) return;
    const start = performance.now() - time * 1000;
    let id = 0;
    const loop = (now: number) => {
      setTime(((now - start) / 1000) % current.duration);
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [playing, current?.id, current?.duration]);
  useEffect(() => {
    const handle = () => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener("visibilitychange", handle);
    return () => document.removeEventListener("visibilitychange", handle);
  }, []);
  function change(fn: (p: Project) => void) {
    setProject((old) => {
      if (!old) return old;
      const p = structuredClone(old);
      fn(p);
      return p;
    });
    setDirty(true);
    setAnalysis(null);
  }
  function choose(c: Clip) {
    setPlaying(false);
    setTime(0);
    setKeySelection(null);
    change((p) => {
      p.selected = c.id;
    });
  }
  async function save() {
    if (!project) return;
    setBusy("Saving");
    try {
      setProject(
        await api("project/" + character, "PUT", {
          project,
          revision: project.revision,
        }),
      );
      setDirty(false);
      setMessage("Saved locally.");
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy("");
    }
  }
  async function check() {
    if (!project || !current) return;
    setBusy("Checking");
    try {
      if (dirty) {
        const p = await api("project/" + character, "PUT", {
          project,
          revision: project.revision,
        });
        setProject(p);
        setDirty(false);
      }
      const q = await api("quality", "POST", { character, clip: current.id });
      setAnalysis(q);
      setMessage(
        q.accepted
          ? "Technical checks passed. Review the motion visually."
          : "Review needed. See the quality measurements.",
      );
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy("");
    }
  }
  async function generate() {
    setBusy("Generating");
    setPlaying(false);
    try {
      if (dirty && project) {
        setProject(
          await api("project/" + character, "PUT", {
            project,
            revision: project.revision,
          }),
        );
        setDirty(false);
      }
      const d = await api("generate", "POST", {
        character,
        motion: action,
        fps,
        candidates: 2,
        target,
      });
      setProject(d.project);
      setTime(0);
      setGeneration(false);
      setCompareId(d.job.results[1]?.clip.id || d.project.selected);
      setAnalysis(
        d.job.results.find((r: any) => r.clip.id === d.project.selected)?.clip
          .quality,
      );
      setMessage(
        d.job.status === "accepted"
          ? "Two candidates saved. Compare them and choose a motion."
          : "Candidates saved with unresolved checks. Review before exporting.",
      );
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy("");
    }
  }
  async function exportFile(format: string) {
    if (!project || !current) return;
    setBusy("Exporting");
    setPlaying(false);
    setExportOpen(false);
    try {
      if (dirty) {
        const p = await api("project/" + character, "PUT", {
          project,
          revision: project.revision,
        });
        setProject(p);
        setDirty(false);
      }
      const d = await api("export", "POST", {
        character,
        clip: current.id,
        format,
      });
      const a = document.createElement("a");
      a.href = d.url;
      a.download = d.filename;
      a.click();
      setMessage(`${format.toUpperCase()} exported.`);
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy("");
    }
  }
  function updatePart(field: keyof Part, value: unknown) {
    if (!part) return;
    change((p) => {
      const item = p.rig.parts.find((x) => x.id === part.id)!;
      if (field === "size") resizePart(p.rig, part.id, value as number[]);
      else (item as any)[field] = value;
    });
  }
  function addKey(property: string) {
    if (!current || !part) return;
    change((p) => {
      const c = p.clips.find((c) => c.id === p.selected)!;
      let t = c.tracks.find(
        (t) => t.part === part.id && t.property === property,
      );
      const rest =
        property === "rotation"
          ? part.rotation || 0
          : property === "bend"
            ? 0
            : part.position[property === "x" ? 0 : 1];
      if (!t) {
        t = { part: part.id, property, keys: [{ time: 0, value: rest }] };
        c.tracks.push(t);
      }
      const rounded = Math.round(time * c.fps) / c.fps;
      const existing = t.keys.find((k) => Math.abs(k.time - rounded) < 0.0001);
      if (!existing)
        t.keys.push({ time: rounded, value: rest, ease: "smooth" });
      t.keys.sort((a, b) => a.time - b.time);
    });
  }
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!project || !current)
    return (
      <main className="loading">
        <LoaderCircle aria-hidden="true" />
        <p>{message || "Opening your local animation workspace…"}</p>
      </main>
    );
  const activeKey = keySelection
    ? current.tracks[keySelection.track]?.keys[keySelection.key]
    : undefined;
  return (
    <div className="studio">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">
            <Layers size={19} />
          </span>
          <strong>QH</strong>
          <span className="brand-label">Motion Studio</span>
        </div>
        <div className="header-project">
          <span>{project.rig.name}</span>
          <span className="muted">/</span>
          <span>{current.name}</span>
          <span
            className="status-dot"
            title={dirty ? "Unsaved changes" : "Saved locally"}
          />
        </div>
        <div className="header-actions">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Import project JSON"
            onClick={() => upload.current?.click()}
          >
            <Upload size={17} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!!busy || !dirty}
            onClick={save}
          >
            <Save size={15} />
            Save
          </Button>
          <div className="export-wrap">
            <Button
              size="sm"
              disabled={!!busy}
              aria-expanded={exportOpen}
              onClick={() => setExportOpen(!exportOpen)}
            >
              <Download size={15} />
              Export
              <ChevronDown size={13} />
            </Button>
            {exportOpen && (
              <div className="popover" aria-label="Export formats">
                {["json", "gif", "mp4", "analysis"].map((f) => (
                  <button key={f} onClick={() => exportFile(f)}>
                    {f.toUpperCase()}
                    <span>
                      {f === "json"
                        ? "Rig + timeline"
                        : f === "gif"
                          ? "Looping animation"
                          : f === "analysis"
                            ? "Numeric data manifest"
                            : "Video · white matte"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>
      <div className={`workspace ${sidebar ? "" : "sidebar-closed"}`}>
        {sidebar && (
          <aside className="library">
            <div className="sidebar-heading">
              <span>Library</span>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close library"
                onClick={() => setSidebar(false)}
              >
                <PanelLeftClose size={17} />
              </Button>
            </div>
            <label className="field-label" htmlFor="character">
              Character
            </label>
            <select
              id="character"
              value={character}
              onChange={(e) => {
                if (
                  dirty &&
                  !window.confirm(
                    "Switch characters and discard unsaved edits?",
                  )
                )
                  return;
                setCharacter(e.target.value);
              }}
            >
              {characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.mode === "poses" ? " · pose library" : ""}
                </option>
              ))}
            </select>
            <div
              className="library-tabs"
              role="tablist"
              aria-label="Library contents"
            >
              {["motions", "parts"].map((t) => (
                <button
                  role="tab"
                  aria-selected={tab === t}
                  key={t}
                  onClick={() => setTab(t)}
                >
                  {t === "motions" ? "Motions" : "Parts"}
                  <span>
                    {t === "motions"
                      ? project.clips.length
                      : project.rig.parts.length}
                  </span>
                </button>
              ))}
            </div>
            {tab === "motions" ? (
              <div className="motion-list">
                {project.clips.map((c) => (
                  <button
                    key={c.id}
                    className={`motion-item ${current.id === c.id ? "selected" : ""}`}
                    onClick={() => choose(c)}
                  >
                    <span className="motion-symbol">
                      <Film size={16} />
                    </span>
                    <span>
                      <strong>
                        {c.name}
                        <small>{c.candidate?.toUpperCase()}</small>
                      </strong>
                      <em>
                        {c.duration.toFixed(1)}s · {c.fps} fps
                      </em>
                    </span>
                    {c.score !== undefined && (
                      <span
                        className={`score ${c.quality?.accepted ? "pass" : ""}`}
                      >
                        {c.score.toFixed(0)}
                      </span>
                    )}
                  </button>
                ))}
                <Button
                  variant="outline"
                  className="new-motion"
                  onClick={() => setGeneration(true)}
                >
                  <Plus size={15} />
                  New motion
                </Button>
              </div>
            ) : (
              <div className="parts-list">
                {[...project.rig.parts]
                  .sort((a, b) => b.z - a.z)
                  .map((p) => (
                    <div
                      key={p.id}
                      className={`part-row ${selected === p.id ? "selected" : ""}`}
                    >
                      <button onClick={() => setSelected(p.id)}>
                        <span className="part-indent">
                          {p.parent ? "↳" : ""}
                        </span>
                        {p.name}
                      </button>
                      <button
                        className="visibility"
                        aria-label={`${hidden.includes(p.id) ? "Show" : "Hide"} ${p.name}`}
                        aria-pressed={!hidden.includes(p.id)}
                        onClick={() =>
                          setHidden((old) =>
                            old.includes(p.id)
                              ? old.filter((x) => x !== p.id)
                              : [...old, p.id],
                          )
                        }
                      >
                        {hidden.includes(p.id) ? (
                          <EyeOff size={14} />
                        ) : (
                          <Eye size={14} />
                        )}
                      </button>
                    </div>
                  ))}
              </div>
            )}
            <div className="library-footer">
              <span className="local-dot" />
              {storage} · local workspace
            </div>
          </aside>
        )}
        <main className="editor">
          <div className="preview-toolbar">
            <div className="preview-title">
              {!sidebar && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Open library"
                  onClick={() => setSidebar(true)}
                >
                  <PanelLeftOpen size={17} />
                </Button>
              )}
              <h1>{current.name}</h1>
              <span className="candidate-label">
                Candidate {current.candidate?.toUpperCase() || "A"}
              </span>
            </div>
            <div className="view-actions">
              <select
                aria-label="Preview representation"
                value={mode}
                onChange={(e) => {
                  setMode(e.target.value);
                  if (e.target.value === "distance") setPlaying(false);
                }}
              >
                {modes.map(([v, n]) => (
                  <option key={v} value={v}>
                    {n}
                  </option>
                ))}
              </select>
              <Button
                variant={grid ? "secondary" : "ghost"}
                size="icon"
                aria-label="Toggle pixel grid and origin axes"
                aria-pressed={grid}
                onClick={() => setGrid(!grid)}
              >
                <Grid2X2 size={17} />
              </Button>
              <Button
                variant={joints ? "secondary" : "ghost"}
                size="icon"
                aria-label="Toggle joint coordinates"
                aria-pressed={joints}
                onClick={() => setJoints(!joints)}
              >
                <Move size={17} />
              </Button>
              <Button
                variant={compare ? "secondary" : "ghost"}
                size="icon"
                aria-label="Compare candidates"
                aria-pressed={compare}
                onClick={() => setCompare(!compare)}
              >
                <Columns2 size={17} />
              </Button>
            </div>
          </div>
          <div className={`preview-area ${compare ? "compare" : ""}`}>
            <div className="preview-pane">
              <div className="pane-caption">
                <span>
                  {project.rig.name} · {current.candidate?.toUpperCase() || "A"}
                </span>
                <span>{project.rig.canvas.join(" × ")}</span>
              </div>
              <Stage
                rig={project.rig}
                clip={current}
                time={time}
                grid={grid}
                joints={joints}
                mode={mode}
                selected={selected}
                hidden={hidden}
                onSelect={setSelected}
              />
            </div>
            {compare && (
              <div className="preview-pane">
                <div className="pane-caption">
                  <select
                    aria-label="Comparison motion"
                    value={other?.id || project.clips[0].id}
                    onChange={(e) => setCompareId(e.target.value)}
                  >
                    {project.clips.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} · {c.candidate?.toUpperCase()}
                      </option>
                    ))}
                  </select>
                  {other?.score !== undefined && (
                    <span>Technical {other.score.toFixed(0)}</span>
                  )}
                </div>
                <Stage
                  rig={project.rig}
                  clip={other || project.clips[0]}
                  time={
                    (time / current.duration) *
                    (other || project.clips[0]).duration
                  }
                  grid={grid}
                  joints={joints}
                  mode={mode}
                  selected={selected}
                  hidden={hidden}
                  onSelect={setSelected}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => choose(other || project.clips[0])}
                >
                  <Check size={14} />
                  Use this candidate
                </Button>
              </div>
            )}
          </div>
          <div className="preview-footnote">
            <span>
              {mode === "parts"
                ? "Authored visible part IDs"
                : mode === "order"
                  ? "Authored layer order · not physical depth"
                  : mode === "distance"
                    ? "Computed boundary distance · canvas pixels"
                    : project.rig.mode === "poses"
                      ? "Registered pose library · no independent body rig"
                      : "Layered raster rig · fixed origin"}
              {grid ? " · origin (256, 256)" : ""}
            </span>
            <Button variant="ghost" size="sm" disabled={!!busy} onClick={check}>
              <Check size={14} />
              Check motion
            </Button>
          </div>
          <section className="timeline" aria-label="Animation timeline">
            <div className="timeline-toolbar">
              <div className="transport">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Return to start"
                  onClick={() => {
                    setPlaying(false);
                    setTime(0);
                  }}
                >
                  <SkipBack size={16} />
                </Button>
                <Button
                  variant="secondary"
                  size="icon"
                  aria-label={playing ? "Pause animation" : "Play animation"}
                  disabled={mode === "distance"}
                  onClick={() => setPlaying(!playing)}
                >
                  {playing ? <Pause size={17} /> : <Play size={17} />}
                </Button>
                <output>
                  {time.toFixed(2)}
                  <span> / {current.duration.toFixed(2)} s</span>
                </output>
              </div>
              <div className="timeline-options">
                <label>
                  <span>FPS</span>
                  <select
                    aria-label="Output frames per second"
                    value={current.fps}
                    onChange={(e) =>
                      change((p) => {
                        p.clips.find((c) => c.id === p.selected)!.fps = Number(
                          e.target.value,
                        );
                      })
                    }
                  >
                    {[24, 30, 60].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Duration</span>
                  <input
                    type="number"
                    aria-label="Duration in seconds"
                    min="0.5"
                    max="30"
                    step="0.1"
                    value={current.duration}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (n < 0.5 || n > 30) return;
                      change((p) => {
                        const c = p.clips.find((c) => c.id === p.selected)!;
                        const factor = n / c.duration;
                        c.duration = n;
                        for (const t of c.tracks)
                          for (const k of t.keys) k.time *= factor;
                      });
                      setTime(0);
                      setPlaying(false);
                    }}
                  />
                </label>
              </div>
            </div>
            <input
              className="scrubber"
              type="range"
              aria-label="Scrub animation time"
              min="0"
              max={current.duration}
              step={1 / current.fps}
              value={time}
              onChange={(e) => {
                setPlaying(false);
                setTime(Number(e.target.value));
              }}
            />
            <div className="track-scroll">
              <div className="ruler">
                <span>Tracks</span>
                <div>
                  {[0, 0.25, 0.5, 0.75, 1].map((n) => (
                    <span key={n}>{(n * current.duration).toFixed(1)}s</span>
                  ))}
                </div>
              </div>
              {current.tracks.map((t, i) => (
                <div
                  className={`track-row ${selected === t.part ? "active" : ""}`}
                  key={t.part + "-" + t.property}
                >
                  <button
                    className="track-name"
                    onClick={() => {
                      setSelected(t.part);
                      setTab("parts");
                    }}
                  >
                    {t.part.replaceAll("_", " ")}
                    <small>{t.property}</small>
                  </button>
                  <div className="track-lane">
                    <div className="track-line" />
                    {t.keys.map((k, j) => (
                      <button
                        key={j}
                        className={`keyframe ${keySelection?.track === i && keySelection.key === j ? "chosen" : ""}`}
                        style={{
                          left: `calc(${(k.time / current.duration) * 100}% - 5px)`,
                        }}
                        aria-label={`${t.part} ${t.property} key at ${k.time.toFixed(2)} seconds`}
                        onClick={() => {
                          setSelected(t.part);
                          setKeySelection({ track: i, key: j });
                          setPlaying(false);
                          setTime(k.time);
                        }}
                      >
                        <Diamond size={11} fill="currentColor" />
                      </button>
                    ))}
                    <div
                      className="playhead"
                      style={{ left: `${(time / current.duration) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </main>
        <aside className="inspector">
          <div className="inspector-heading">
            <Settings2 size={16} />
            <h2>{part ? part.name : "Inspector"}</h2>
          </div>
          {part ? (
            <>
              <p className="inspector-meta">
                {part.parent
                  ? `Attached to ${part.parent.replaceAll("_", " ")}`
                  : "Character root"}
              </p>
              <div className="part-thumbnail">
                <img
                  src={part.asset}
                  alt={`${part.name} isolated raster layer`}
                />
              </div>
              <h3>Bind pose</h3>
              {(["position", "pivot", "size"] as const).map((field) => (
                <div className="xy-field" key={field}>
                  <span>
                    {field === "position"
                      ? "Attachment"
                      : field === "pivot"
                        ? "Local pivot"
                        : "Size"}
                  </span>
                  {part[field].map((n, i) => (
                    <label key={i}>
                      <span>{i === 0 ? "X" : "Y"}</span>
                      <input
                        type="number"
                        aria-label={`${part.name} ${field} ${i === 0 ? "x" : "y"}`}
                        step="0.5"
                        value={n}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          if (
                            !Number.isFinite(v) ||
                            (field === "size" && v <= 0)
                          )
                            return;
                          const pair = [...part[field]];
                          pair[i] = v;
                          updatePart(field, pair);
                        }}
                      />
                    </label>
                  ))}
                </div>
              ))}
              <div className="scalar-field">
                <label htmlFor="z-order">Draw order</label>
                <input
                  id="z-order"
                  type="number"
                  value={part.z}
                  onChange={(e) => updatePart("z", Number(e.target.value))}
                />
              </div>
              <h3>Motion</h3>
              <div className="key-buttons">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addKey("rotation")}
                >
                  <Plus size={13} />
                  Rotation key
                </Button>
                {part.mesh && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => addKey("bend")}
                  >
                    <Plus size={13} />
                    Bend key
                  </Button>
                )}
              </div>
              <p className="hint">
                Scrub to a time, add a key, then select its diamond to edit.
              </p>
            </>
          ) : (
            <div className="empty-inspector">
              <Move size={26} />
              <p>
                Select a part or timeline track to edit its joints and motion.
              </p>
            </div>
          )}
          {activeKey && keySelection && (
            <section className="key-inspector">
              <h3>Selected key</h3>
              <p className="inspector-meta">
                {current.tracks[keySelection.track].property} ·{" "}
                {activeKey.time.toFixed(2)}s
              </p>
              {typeof activeKey.value === "number" ? (
                <label className="scalar-field">
                  Value
                  <input
                    type="number"
                    aria-label="Selected key value"
                    step="1"
                    value={activeKey.value}
                    onChange={(e) =>
                      change((p) => {
                        p.clips.find((c) => c.id === p.selected)!.tracks[
                          keySelection.track
                        ].keys[keySelection.key].value = Number(e.target.value);
                      })
                    }
                  />
                </label>
              ) : typeof activeKey.value === "boolean" ? (
                <label className="scalar-field">
                  Visible
                  <input
                    type="checkbox"
                    checked={activeKey.value}
                    onChange={(e) =>
                      change((p) => {
                        p.clips.find((c) => c.id === p.selected)!.tracks[
                          keySelection.track
                        ].keys[keySelection.key].value = e.target.checked;
                      })
                    }
                  />
                </label>
              ) : (
                <label className="field-label">
                  Replacement
                  <select
                    aria-label="Replacement asset"
                    value={String(activeKey.value)}
                    onChange={(e) =>
                      change((p) => {
                        p.clips.find((c) => c.id === p.selected)!.tracks[
                          keySelection.track
                        ].keys[keySelection.key].value = e.target.value;
                      })
                    }
                  >
                    {project.rig.assets.map((a) => (
                      <option value={a} key={a}>
                        {a.split("/").at(-1)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <Button
                variant="ghost"
                size="sm"
                disabled={current.tracks[keySelection.track].keys.length <= 1}
                onClick={() => {
                  change((p) => {
                    p.clips
                      .find((c) => c.id === p.selected)!
                      .tracks[
                        keySelection.track
                      ].keys.splice(keySelection.key, 1);
                  });
                  setKeySelection(null);
                }}
              >
                Remove key
              </Button>
            </section>
          )}
          {analysis && (
            <section className="quality-panel">
              <h3>
                Technical checks <span>{analysis.score}/100</span>
              </h3>
              <p
                className={
                  analysis.accepted ? "quality-pass" : "quality-review"
                }
              >
                {analysis.accepted ? "Checks passed" : "Needs review"}
              </p>
              {Object.entries(analysis.metrics || {})
                .filter(([k]) =>
                  [
                    "connectedBodyRatio",
                    "contactDriftPx",
                    "flippedTriangles",
                    "offCanvasSamples",
                    "jointGapSamples",
                  ].includes(k),
                )
                .map(([k, v]) => (
                  <div key={k}>
                    <span>
                      {
                        (
                          {
                            connectedBodyRatio: "Connected silhouette",
                            contactDriftPx: "Foot drift · px",
                            flippedTriangles: "Flipped triangles",
                            offCanvasSamples: "Off-canvas samples",
                            jointGapSamples: "Joint gaps",
                          } as any
                        )[k]
                      }
                    </span>
                    <strong>
                      {typeof v === "number"
                        ? k === "connectedBodyRatio"
                          ? (v * 100).toFixed(1) + "%"
                          : v.toFixed(2)
                        : String(v)}
                    </strong>
                  </div>
                ))}
              <p className="hint">
                Technical score. Visual anatomy and emotion still need review.
              </p>
            </section>
          )}
        </aside>
      </div>
      <footer className="app-status" role="status">
        <span>
          {busy ? (
            <>
              <LoaderCircle size={13} className="spin" />
              {busy}…
            </>
          ) : (
            message ||
            `${dirty ? "Unsaved changes" : "Saved locally"} · ${project.rig.parts.length} parts`
          )}
        </span>
        <span>
          {Math.round(time * current.fps)} /{" "}
          {Math.round(current.duration * current.fps)} frames
          {reduced ? " · reduced motion preference" : ""}
        </span>
      </footer>
      <Dialog.Root open={generation} onOpenChange={setGeneration}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content">
            <Dialog.Title>New motion</Dialog.Title>
            <Dialog.Description>
              Generate two candidates from the local character rig. New artwork
              can be supplied through the MCP asset workflow.
            </Dialog.Description>
            <label className="dialog-field">
              Motion
              <select
                value={action}
                onChange={(e) => setAction(e.target.value)}
              >
                {["hello", "thinking", "success", "idle"].map((n) => (
                  <option key={n} value={n}>
                    {n[0].toUpperCase() + n.slice(1)}
                  </option>
                ))}
              </select>
            </label>
            <div className="dialog-pair">
              <label>
                Frame rate
                <select
                  value={fps}
                  onChange={(e) => setFps(Number(e.target.value))}
                >
                  {[24, 30, 60].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
              <label>
                Technical target
                <input
                  type="number"
                  min="95"
                  max="100"
                  value={target}
                  onChange={(e) =>
                    setTarget(
                      Math.max(95, Math.min(100, Number(e.target.value))),
                    )
                  }
                />
              </label>
            </div>
            <p className="hint">
              Up to 3 automatic repairs. Artwork problems remain flagged for
              review.
            </p>
            <Button disabled={!!busy} onClick={generate}>
              {busy ? <LoaderCircle size={16} /> : <Plus size={16} />}Generate
              candidates
            </Button>
            <Dialog.Close asChild>
              <Button
                variant="ghost"
                size="icon"
                className="dialog-close"
                aria-label="Close new motion"
              >
                <X size={18} />
              </Button>
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <input
        ref={upload}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          try {
            const data = JSON.parse(await file.text());
            const p = data.project || data;
            if (data.schema === "qh-motion/1") {
              const r = {
                ...project,
                rig: data.rig,
                clips: [
                  ...project.clips.filter((c) => c.id !== data.clip.id),
                  data.clip,
                ],
                selected: data.clip.id,
              };
              setProject(
                await api("project/" + character, "PUT", {
                  project: r,
                  revision: project.revision,
                }),
              );
            } else
              setProject(
                await api("project/" + character, "PUT", {
                  project: p,
                  revision: project.revision,
                }),
              );
            setDirty(false);
            setMessage("Imported and saved locally.");
          } catch (err: any) {
            setMessage(err.message);
          }
          e.target.value = "";
        }}
      />
    </div>
  );
}

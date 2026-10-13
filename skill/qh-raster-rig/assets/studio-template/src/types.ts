export type Key = {
  time: number;
  value: number | string | boolean;
  ease?: string;
};
export type Track = { part: string; property: string; keys: Key[] };
export type Clip = {
  id: string;
  name: string;
  duration: number;
  fps: number;
  tracks: Track[];
  candidate?: string;
  score?: number;
  quality?: any;
};
export type Part = {
  id: string;
  name: string;
  parent: string | null;
  position: [number, number];
  pivot: [number, number];
  size: [number, number];
  z: number;
  asset: string;
  rotation?: number;
  visible?: boolean;
  limits?: [number, number];
  mesh?: { columns: number; rows: number; axis: string };
  palette?: string[];
};
export type Rig = {
  id: string;
  name: string;
  version: number;
  canvas: [number, number];
  origin: [number, number];
  ground: number;
  parts: Part[];
  assets: string[];
  contacts?: any[];
  mode?: string;
};
export type Project = {
  rig: Rig;
  clips: Clip[];
  selected: string;
  revision: number;
};

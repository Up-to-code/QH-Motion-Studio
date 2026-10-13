import { useEffect, useRef, useState } from "react";
import type { Rig, Clip } from "../types";
import { drawRig, stateAt, point } from "../../core/engine.mjs";
import { drawMesh, deformPoint } from "../../core/mesh.mjs";
import { skeletonPose } from "../../core/skeleton.mjs";
import { drawAnalysis } from "../../core/analysis.mjs";
/** View transforms only affect the player. Rig coordinates and exported pixels stay unchanged. */
export default function Stage({ rig, clip, time, grid, joints, mode, selected, hidden, onSelect, viewCommand, skeleton, onInteract }: {
  rig: Rig; clip: Clip; time: number; grid: boolean; joints: boolean; mode: string;
  selected: string | null; hidden: string[]; onSelect: (id: string) => void;
  viewCommand: { action: string; serial: number };
  skeleton?: any;
  onInteract?: () => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null), surface = useRef<HTMLDivElement>(null);
  const [images, setImages] = useState<Record<string, HTMLImageElement>>({});
  const [error, setError] = useState("");
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const assetsKey = rig.assets.join("|");
  const displayed = useRef<any[]>([]);
  const drag = useRef<{x:number;y:number;vx:number;vy:number;moved:boolean;parts:any[]}|null>(null);
  useEffect(() => {
    let cancelled = false;
    displayed.current = []; setImages({}); setError(""); setView({zoom:1,x:0,y:0});
    Promise.all(rig.assets.map(a => new Promise<[string,HTMLImageElement]>((resolve,reject) => {
      const img=new Image(); img.onload=()=>resolve([a,img]); img.onerror=()=>reject(Error(`Missing asset: ${a}`)); img.src=a;
    }))).then(items=>{if(!cancelled)setImages(Object.fromEntries(items));}).catch(e=>{if(!cancelled)setError(e.message);});
    return()=>{cancelled=true;};
  }, [assetsKey, rig.id]);
  useEffect(() => {
    const ctx=ref.current?.getContext("2d");
    if(!ctx || Object.keys(images).length!==rig.assets.length)return;
    if(mode==="artwork")drawRig(ctx,rig,clip,time,images,{grid,joints:false,selected,hidden});
    else drawAnalysis(ctx,rig,clip,time,images,mode);
    displayed.current = stateAt(rig,clip,time);
    if(joints){
      const nodes=skeleton?.character===rig.id ? skeletonPose(rig,clip,time,skeleton) : stateAt(rig,clip,time).map(p=>({id:p.id,part:p.id,parent:p.parent,position:p.joint,kind:"control"}));
      const byId=new Map(nodes.map((n:any)=>[n.id,n]));
      ctx.save();ctx.strokeStyle="#7c3aed88";ctx.lineWidth=1;ctx.font="9px monospace";
      for(const n of nodes){const parent:any=byId.get(n.parent);if(parent){ctx.beginPath();ctx.moveTo(parent.position[0],parent.position[1]);ctx.lineTo(n.position[0],n.position[1]);ctx.stroke();}}
      for(const n of nodes){ctx.fillStyle=n.part===selected?"#ef4444":(n.kind==="contact" || n.id.startsWith("contact-"))?"#16a34a":n.kind==="anatomical"?"#0284c7":"#7c3aed";ctx.beginPath();ctx.arc(n.position[0],n.position[1],n.kind==="control" && !n.id.startsWith("contact-")?2.5:3.5,0,Math.PI*2);ctx.fill();if(n.part===selected)ctx.fillText(`${n.id} (${n.position.map((v:number)=>v.toFixed(1)).join(", ")})`,n.position[0]+7,n.position[1]);}
      ctx.restore();
    }
  },[rig,clip,time,images,grid,joints,mode,selected,hidden,skeleton]);
  useEffect(() => {
    if(viewCommand.action==="fit")setView({zoom:1,x:0,y:0});
    else if(viewCommand.action==="focus" && selected) {
      const p=stateAt(rig,clip,time).find(p=>p.id===selected);
      if(!p)return;
      const corners=[[0,0],[p.size[0],0],[0,p.size[1]],p.size].map(v=>point(p.matrix,p.mesh?deformPoint(p,v,p.bend):v));
      const xs=corners.map(v=>v[0]),ys=corners.map(v=>v[1]);
      const w=Math.max(...xs)-Math.min(...xs),h=Math.max(...ys)-Math.min(...ys);
      const zoom=Math.min(8,Math.max(1,Math.min(rig.canvas[0]/Math.max(w,1),rig.canvas[1]/Math.max(h,1))*0.65));
      setView({zoom,x:(rig.canvas[0]/2-(Math.max(...xs)+Math.min(...xs))/2)*zoom/rig.canvas[0]*100,y:(rig.canvas[1]/2-(Math.max(...ys)+Math.min(...ys))/2)*zoom/rig.canvas[1]*100});
    } else setView(v=>({...v,zoom:Math.max(0.5,Math.min(8,v.zoom*(viewCommand.action==="in"?1.25:0.8)))}));
  },[viewCommand]);
  function hit(e: React.PointerEvent<HTMLCanvasElement>, parts: any[]) {
    const r=e.currentTarget.getBoundingClientRect();
    const x=(e.clientX-r.left)*rig.canvas[0]/r.width,y=(e.clientY-r.top)*rig.canvas[1]/r.height;
    if(x<0||y<0||x>=rig.canvas[0]||y>=rig.canvas[1])return;
    // Render each candidate with the exact mesh/affine path, reverse draw order.
    // Transparent pixels, hidden parts and empty canvas never steal selection.
    const scratch=document.createElement("canvas"); scratch.width=rig.canvas[0];scratch.height=rig.canvas[1];
    const ctx=scratch.getContext("2d",{willReadFrequently:true});if(!ctx)return;
    for(const p of [...parts].reverse()) {
      if(!p.visible||p.opacity<=0||hidden.includes(p.id)||!images[p.asset])continue;
      ctx.clearRect(0,0,...rig.canvas);ctx.save();ctx.transform(p.matrix[0],p.matrix[1],p.matrix[2],p.matrix[3],p.matrix[4],p.matrix[5]);ctx.globalAlpha=p.opacity;
      if(p.mesh)drawMesh(ctx,images[p.asset],p,p.bend);else ctx.drawImage(images[p.asset],0,0,p.size[0],p.size[1]);
      ctx.restore();
      if(ctx.getImageData(Math.floor(x),Math.floor(y),1,1).data[3]>=16){onSelect(p.id);return;}
    }
  }
  const selectedState = selected ? stateAt(rig, clip, time).find(p => p.id === selected) : undefined;
  return <div ref={surface} className="stage-surface" style={{aspectRatio:`${rig.canvas[0]} / ${rig.canvas[1]}`}}>
    {error?<p role="alert">{error}</p>:<canvas ref={ref} width={rig.canvas[0]} height={rig.canvas[1]} tabIndex={0}
      aria-label={`${rig.name}, ${clip.name}, ${mode} preview. Drag to pan; plus and minus to zoom; zero to fit. Select parts from the library with the keyboard.`}
      data-skeleton-nodes={joints ? (skeleton?.nodes?.length || rig.parts.length) : 0}
      data-zoom={view.zoom.toFixed(3)} style={{transform:`translate(${view.x}%, ${view.y}%) scale(${view.zoom})`}}
      onKeyDown={e=>{if(e.key==="0"){e.preventDefault();setView({zoom:1,x:0,y:0});}if(["+","=","-"].includes(e.key)){e.preventDefault();setView(v=>({...v,zoom:Math.max(.5,Math.min(8,v.zoom*(e.key==="-"?.8:1.25)))}));}}}
      onPointerDown={e=>{if(e.button!==0)return;onInteract?.();e.currentTarget.setPointerCapture(e.pointerId);drag.current={x:e.clientX,y:e.clientY,vx:view.x,vy:view.y,moved:false,parts:displayed.current};}}
      onPointerMove={e=>{const d=drag.current,r=surface.current?.getBoundingClientRect();if(!d||!r)return;const dx=e.clientX-d.x,dy=e.clientY-d.y;if(Math.hypot(dx,dy)>4)d.moved=true;if(d.moved)setView(v=>({...v,x:d.vx+dx/r.width*100,y:d.vy+dy/r.height*100}));}}
      onPointerUp={e=>{const d=drag.current;drag.current=null;if(d&&!d.moved)hit(e,d.parts);}}
      onPointerCancel={()=>{drag.current=null;}}
    />}
    {selectedState && <span className="stage-coordinate" aria-label="Selected joint coordinates">{selectedState.name} · x {selectedState.joint[0].toFixed(1)} · y {selectedState.joint[1].toFixed(1)}</span>}
    <span className="stage-zoom" aria-hidden="true">{Math.round(view.zoom*100)}%</span>
  </div>;
}

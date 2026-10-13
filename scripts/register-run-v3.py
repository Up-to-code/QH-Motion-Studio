from pathlib import Path
from PIL import Image
import numpy as np
from scipy.ndimage import label,binary_dilation
import json,shutil,hashlib
root=Path(__file__).resolve().parent.parent;out=root/'public/animations/hero1';(out/'source').mkdir(parents=True,exist_ok=True);(out/'parts').mkdir(exist_ok=True)
base=out/'source'
files=['run-half-1.png','run-half-2.png'];hips=[(393,426),(350,431),(390,418),(356,423),(397,423),(355,432),(392,410),(351,432)];bob=[0,8,-2,-12,0,8,-2,-12];records=[];frames=[]
for group,name in enumerate(files):
 im=Image.open(base/name).convert('RGBA');w,h=im.size;cw,ch=w//2,h//2
 for n in range(4):
  i=group*4+n;cell=im.crop(((n%2)*cw,(n//2)*ch,(n%2+1)*cw,(n//2+1)*ch));a=np.array(cell);labels,count=label(a[:,:,3]>30);sizes=np.bincount(labels.ravel());sizes[0]=0;main=labels==sizes.argmax();keep=binary_dilation(main,iterations=2);a[~keep,3]=0;cell=Image.fromarray(a)
  scale=.62;scaled=cell.resize((round(cw*scale),round(ch*scale)),Image.Resampling.LANCZOS);hip=hips[i];translation=(round(256-hip[0]*scale),round(300+bob[i]-hip[1]*scale));frame=Image.new('RGBA',(512,512));frame.alpha_composite(scaled,translation);asset=f'/animations/hero1/parts/run-{i+1:02}.png';frame.save(out/'parts'/f'run-{i+1:02}.png');frames.append(frame)
  bounds=frame.getchannel('A').point(lambda v:255 if v>30 else 0).getbbox();records.append({'frame':i,'asset':asset,'sourceCell':[n%2,n//2],'sourceFile':f'run-half-{group+1}.png','sourceHip':hip,'scale':scale,'translation':translation,'intentionalRootOffset':[0,bob[i]],'registeredRoot':[hip[0]*scale+translation[0],hip[1]*scale+translation[1]],'camera':'right','sourceTouchesEdge':bool(main[0].any() or main[-1].any() or main[:,0].any() or main[:,-1].any()),'alphaBounds':bounds,'sha256':hashlib.sha256((out/'parts'/f'run-{i+1:02}.png').read_bytes()).hexdigest()})
assets=[r['asset'] for r in records];duration=1;clip={'name':'Run Hero 1','duration':duration,'loop':True,'fps':24,'tracks':[{'part':'body','property':'asset','keys':[{'time':i/8,'value':a}for i,a in enumerate(assets)]+[{'time':1,'value':assets[0]}]}]}
rig={'id':'hero1','name':'Hero 1','version':1,'mode':'poses','posePart':'body','motionProfile':'hero1-right','allowedActions':['run'],'canvas':[512,512],'origin':[256,256],'assets':assets,'parts':[{'id':'body','name':'Right-side run pose','parent':None,'position':[0,0],'pivot':[256,256],'size':[512,512],'z':0,'asset':assets[0],'limits':[0,0]}],'motionTemplates':{'run':clip},'sourcePolicy':{'minMarginPx':8},'semanticReview':{'camera':'right-side 2D with near/far limb shading','authoredPoses':8,'samplingFPS':24,'holdsPerPose':3,'status':'reviewed draft','limitations':['Whole-character generated drawings, not a side-view layered skeleton.','Perspective depth is drawn, not a 3D model.','No claim of automatic gait or emotion recognition.']}}
(out/'rig.json').write_text(json.dumps(rig,indent=2));(out/'source'/'registration.json').write_text(json.dumps(records,indent=2));sheet=Image.new('RGBA',(1024,512));
for i,f in enumerate(frames):sheet.alpha_composite(f.resize((256,256)),((i%4)*256,(i//4)*256))
sheet.save(root/'docs/run-hero1-contact-sheet.png');frames[0].save(root/'docs/run-hero1.webp',save_all=True,append_images=frames[1:],duration=125,loop=0,lossless=True)
print('Registered 8 generated drawings, common scale 0.62; authored hips with deliberate bob.')

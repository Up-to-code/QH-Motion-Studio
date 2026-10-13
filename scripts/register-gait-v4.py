from pathlib import Path
import json
import numpy as np
from scipy.ndimage import label,binary_dilation
from PIL import Image
root=Path(__file__).resolve().parent.parent;folder=root/'public/animations/hero1/source/gait-v4';parts=root/'public/animations/hero1/parts';records=[];frames=[]
# Contact, down/support, toe-off, brief flight. Then opposite side.
order=[('contacts',0),('contacts',1),('transitions',0),('transitions',1),('contacts',2),('contacts',3),('transitions',2),('transitions',3)]
for i,(sheet,n)in enumerate(order):
 im=Image.open(folder/f'{sheet}.png').convert('RGBA');cw,ch=im.width//2,im.height//2;cell=im.crop(((n%2)*cw,(n//2)*ch,(n%2+1)*cw,(n//2+1)*ch));a=np.array(cell);labels,count=label(a[:,:,3]>30);sizes=np.bincount(labels.ravel());sizes[0]=0;main=labels==sizes.argmax();a[~binary_dilation(main,iterations=2),3]=0
 yy,xx=np.indices(main.shape);hoodie=(a[:,:,0]>100)&(a[:,:,0]<210)&(a[:,:,1]<160)&(a[:,:,2]>170)&main;bottom=np.percentile(yy[hoodie],96);hipx=float(np.median(xx[hoodie&(yy>bottom-12)]));hipy=float(bottom)
 shoes=(a[:,:,0]>185)&(a[:,:,1]>150)&(a[:,:,2]<140)&main&(yy>hipy);foot_y=int(yy[shoes].max());scale=.62;clearance=6 if i%4==3 else 0;translation=(round(256-hipx*scale),round(420-clearance-foot_y*scale));frame=Image.new('RGBA',(512,512));frame.alpha_composite(Image.fromarray(a).resize((round(cw*scale),round(ch*scale)),Image.Resampling.LANCZOS),translation);asset=f'/animations/hero1/parts/run-grounded-{i+1:02}.png';frame.save(parts/f'run-grounded-{i+1:02}.png');frames.append(frame)
 b=frame.getchannel('A').point(lambda v:255 if v>30 else 0).getbbox();records.append({'frame':i,'asset':asset,'sourceSheet':sheet,'sourceCell':n,'sourceHip':[hipx,hipy],'uniformScale':scale,'translation':translation,'registeredHip':[hipx*scale+translation[0],hipy*scale+translation[1]],'lowestFootY':foot_y*scale+translation[1],'headY':b[1],'phase':'flight' if i%4==3 else 'contact','sourceTouchesEdge':bool(main[0].any() or main[-1].any() or main[:,0].any() or main[:,-1].any()),'alphaBounds':b})
(folder/'registration.json').write_text(json.dumps(records,indent=2));sheet=Image.new('RGBA',(1024,512));
for i,f in enumerate(frames):sheet.alpha_composite(f.resize((256,256)),((i%4)*256,(i//4)*256))
sheet.save(root/'docs/run-grounded-contact-sheet.png');frames[0].save(root/'docs/run-grounded.webp',save_all=True,append_images=frames[1:],duration=[83,83,42,42,83,83,42,42],loop=0,lossless=True)
print(json.dumps([{'head':r['headY'],'sole':r['lowestFootY'],'hip':r['registeredHip']}for r in records]))

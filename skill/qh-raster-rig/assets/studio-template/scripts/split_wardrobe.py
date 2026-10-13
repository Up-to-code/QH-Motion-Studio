"""Explicit clothing ownership masks; retain source and restore composite at bind pose."""
from pathlib import Path
import json,numpy as np,cv2,shutil
from PIL import Image,ImageDraw
root=Path(__file__).resolve().parents[1]/'public/animations/fox';rig=json.loads((root/'rig.json').read_text());source=root/'source/hoodie-before-split.png'
if not source.exists():shutil.copy2(root/'parts/hoodie.png',source)
im=Image.open(source).convert('RGBA');a=np.array(im);h,w=a.shape[:2];yy,xx=np.mgrid[:h,:w];left=np.interp(yy,[0,80,115,150,220,280,340,380,h],[0,0,130,111,90,78,70,70,70]);right=w-left
armL=(yy>=85)&(xx<left);armR=(yy>=85)&(xx>right)
# String masks follow the actual generated light cloth strips.
r,g,b,alpha=[a[:,:,k].astype(float) for k in range(4)];light=(alpha>100)&(r>160)&(g>145)&(b>220)&(yy>90)&(yy<235)
strings={side:light&((xx<w/2) if side=='left' else (xx>w/2)) for side in ['left','right']}
# The kangaroo pocket and hem are separate garments, attached to torso.
pocket=(alpha>100)&(yy>=248)&(yy<=347)&(xx>=130)&(xx<=385)&(r<145)&(g<100)&(b>100)
hem=(alpha>100)&(yy>=369)
# Entire chest including the painted fold lines stays with the torso mesh. Cloth wrinkles
# are texture detail, not falsely detached independent physical objects.
baseMask=~(armL|armR|hem|pocket|strings['left']|strings['right']);originalAlpha=a[:,:,3].copy();base=a.copy();base[armL|armR|hem]=0
# Inpaint only hidden surface behind pocket/strings so moving detail reveals cloth.
fillMask=cv2.dilate((pocket|strings['left']|strings['right']).astype('uint8'),np.ones((11,11),np.uint8));filled=cv2.inpaint(a[:,:,:3],fillMask*255,9,cv2.INPAINT_TELEA);base[:,:,:3]=filled;base[armL|armR|hem]=0
# Waist underlap retains source hem texture; overlap is intentionally hidden.
base[hem]=a[hem]
base[base[:,:,3]==0]=0;Image.fromarray(base).save(root/'parts/hoodie.png')
scale=np.array([144/w,120/h]);shirt=next(p for p in rig['parts'] if p['id']=='hoodie');origin=np.array([256,280]);canvasTop=origin-np.array(shirt['pivot'])
def layer(name,mask,parent,anchor=None,z=12,spring=None):
 cut=a.copy();cut[~mask]=0;img=Image.fromarray(cut);box=img.getchannel('A').getbbox();assert box,name;img.crop(box).save(root/f'parts/{name}.png');x,y,x2,y2=box;size=((np.array([x2-x,y2-y])*scale).tolist());top=canvasTop+np.array([x,y])*scale
 if anchor is None:anchor=top+np.array([size[0]/2,2])
 parentPoint={'hoodie':origin,'upper_arm_left':np.array([210,258]),'upper_arm_right':np.array([302,258]),'forearm_left':np.array([210,300]),'forearm_right':np.array([302,300])}[parent]
 part={'id':name,'name':name.replace('_',' ').title(),'parent':parent,'position':(anchor-parentPoint).tolist(),'pivot':(anchor-top).tolist(),'size':size,'z':z,'asset':f'/animations/fox/parts/{name}.png','limits':[-20,20],'surfaceAttachment':True}
 if spring:part['secondary']=spring
 rig['parts']=[p for p in rig['parts'] if p['id']!=name]+[part];rig['assets']=list(dict.fromkeys(rig['assets']+[part['asset']]))
for side in ['left','right']:
 layer('drawstring_'+side,strings[side],'hoodie',z=14,spring={'driver':'upper_arm_right','property':'rotation','gain':.04 if side=='left' else .055,'frequencyHz':2.7,'damping':.72,'maxDegrees':9})
layer('pocket',pocket,'hoodie',z=13);layer('hem',hem,'hoodie',z=11)
# Store separated source sleeve surfaces as editable coverage, not in the stationary body.
for side,mask in [('left',armL),('right',armR)]:
 cut=a.copy();cut[~mask]=0;Image.fromarray(cut).save(root/f'source/source-sleeve-{side}.png')
 # shoulder cap belongs to arm; clean generated upper/forearm sleeves own its coverage.
 upper=next(p for p in rig['parts'] if p['id']=='upper_arm_'+side);upper['position'][0]=(-46 if side=='left' else 46);upper['name']=f'{side.title()} Shoulder Sleeve';upper['ownership']='Shoulder sleeve and upper-arm fabric; no sleeve pixels in torso';upper['limits']=[-25,135] if side=='left' else [-135,25]
 # No simultaneous scaling/rotation normalization. Child offsets remain local pixels.
 # Cuff is removed from forearm asset and restored as its own wrist-attached garment.
 fp=root/'parts/forearm.png';src=root/'source/forearm-before-split.png'
 if not src.exists():shutil.copy2(fp,src)
 f=np.array(Image.open(src).convert('RGBA'));fh,fw=f.shape[:2];cuffMask=np.indices((fh,fw))[0]>=round(fh*.84);cuff=f.copy();cuff[~cuffMask]=0;cuffImg=Image.fromarray(cuff);box=cuffImg.getchannel('A').getbbox();cuffImg.crop(box).save(root/f'parts/cuff_{side}.png');f[cuffMask]=0;Image.fromarray(f).save(fp)
 fore=next(p for p in rig['parts'] if p['id']=='forearm_'+side);fx,fy,fx2,fy2=box;size=[(fx2-fx)*38/fw,(fy2-fy)*54/fh];localTop=np.array([fx*38/fw,fy*54/fh])-np.array(fore['pivot']);asset=f'/animations/fox/parts/cuff_{side}.png';rig['parts']=[p for p in rig['parts'] if p['id']!='cuff_'+side]+[{'id':'cuff_'+side,'name':side.title()+' Cuff','parent':'forearm_'+side,'position':(localTop+np.array([size[0]/2,1])).tolist(),'pivot':[size[0]/2,1],'size':size,'z':9.2,'asset':asset,'limits':[-5,5]}];rig['assets']=list(dict.fromkeys(rig['assets']+[asset]))
shirt['mesh']={'columns':6,'rows':7,'axis':'y'};shirt['ownership']='Chest, hood and attached wrinkle texture; excludes arm clothing. Drawstrings, pocket and hem use separate layers.'
next(p for p in rig['parts'] if p['id']=='tail')['mesh']={'columns':6,'rows':4,'axis':'x'};rig['parts'].sort(key=lambda p:p['z']);rig['garmentOwnership']={'torsoExcludesSleeves':True,'arms':['shoulder sleeve','forearm sleeve','cuff','hand'],'secondaryDetails':['drawstring_left','drawstring_right'],'wrinkles':'Warp with torso texture, not independent floating overlays','sourceMasks':'source/wardrobe-masks.npz'}
np.savez_compressed(root/'source/wardrobe-masks.npz',arm_left=armL,arm_right=armR,pocket=pocket,hem=hem,string_left=strings['left'],string_right=strings['right']);(root/'rig.json').write_text(json.dumps(rig,indent=2));print('Parts:',len(rig['parts']))

"""Extract generated artwork; resize/place with numeric bind pose, never redraw anatomy."""
from pathlib import Path
import json,sys,shutil
import numpy as np
from PIL import Image
import cv2
root=Path(__file__).resolve().parents[1]; out=root/'public/animations/fox';source=Path(sys.argv[1]);shutil.copy2(source,out/'source/parts-atlas.png')
im=Image.open(source).convert('RGBA');w,h=im.size

def components(img,minimum=50):
 a=np.array(img);n,l,stats,_=cv2.connectedComponentsWithStats((a[:,:,3]>80).astype('uint8'),8);return [(int(s[4]),tuple(map(int,s[:4])),l==i) for i,s in enumerate(stats) if i and s[4]>=minimum]
def clean(img,minimum=80):
 a=np.array(img); cs=components(img,minimum);mask=np.zeros(a.shape[:2],bool)
 for _,_,m in cs:mask|=m
 # Preserve antialiased edge next to retained opaque artwork.
 mask=cv2.dilate(mask.astype('uint8'),np.ones((3,3),np.uint8)).astype(bool);a[~mask]=0;a[a[:,:,3]==0]=0
 return Image.fromarray(a).crop(Image.fromarray(a[:,:,3]).getbbox())
cells=[]
for y in range(4):
 for x in range(4):
  cell=im.crop((round(x*w/4),round(y*h/4),round((x+1)*w/4),round((y+1)*h/4)));cells.append(clean(cell))
assets={}
def save(name,img):
 img=img.convert('RGBA');a=np.array(img);a[a[:,:,3]==0]=0;Image.fromarray(a).save(out/f'parts/{name}.png');assets[name]=f'/animations/fox/parts/{name}.png';return img
names=['head','ear_left','ear_right','tail','hoodie','pelvis','leg_left','leg_right','shoe_left','shoe_right','upper_arm','forearm','hand_rest','hand_wave']
for i,n in enumerate(names):
 a=np.array(cells[i]);cs=components(cells[i]);m=max(cs,key=lambda c:c[0])[2];m=cv2.morphologyEx(m.astype('uint8'),cv2.MORPH_OPEN,np.ones((2,2),np.uint8));m=cv2.dilate(m,np.ones((3,3),np.uint8)).astype(bool);a[~m]=0;save(n,Image.fromarray(a))
# Hidden neck artwork sampled from the generated orange head plate.
head=Image.open(out/'parts/head.png');save('neck',head.crop((head.width//2-12,head.height//3,head.width//2+12,head.height//3+24)))
# Separate true eye whites and pupils from generated eye cell.
a=np.array(cells[14]);cs=sorted(components(cells[14],200),key=lambda c:c[1][0]);print('eyes',[(c[0],c[1]) for c in cs])
for side,c in zip(['left','right'],cs):
 x,y,cw,ch=c[1];eye=cells[14].crop((x,y,x+cw,y+ch));e=np.array(eye);brown=(e[:,:,0]<145)&(e[:,:,1]<100)&(e[:,:,2]<90)&(e[:,:,3]>150);n,l,st,_=cv2.connectedComponentsWithStats(brown.astype('uint8'),8);idx=max(range(1,n),key=lambda i:st[i,4]);m=l==idx;px,py,pw,ph=map(int,st[idx,:4]);p=e.copy();p[~cv2.dilate(m.astype('uint8'),np.ones((3,3),np.uint8)).astype(bool)]=0
 save('pupil_'+side,Image.fromarray(p).crop((px-1,py-1,px+pw+1,py+ph+1)))
 # Eye white hidden fill: retain sampled generated white color under pupil.
 white=e.copy();white[m,:3]=[255,255,255];white[m,3]=255;save('eye_'+side,Image.fromarray(white));
 # Exact original eye available as a replacement too.
 save('eye_full_'+side,eye)
feature=cells[15];cs=sorted(components(feature,45),key=lambda c:(c[1][1],c[1][0]));print('features',[(c[0],c[1]) for c in cs]);
# Features are separated components; assign by centroid rows.
rows={}
for c in cs:
 x,y,cw,ch=c[1];rows.setdefault(round((y+ch/2)/50),[]).append(c)
# Stable authored map from inspected generated atlas, sorted vertical rows.
cs=sorted(cs,key=lambda c:c[1][1]+c[1][3]/2)
# two brows, nose, smile and open mouth, then concerned mouth and lids.
labels=['brow_left','brow_right','nose','mouth_smile','mouth_happy','mouth_concerned','lid_left','lid_right']
# Group first 2 by horizontal; last3 by horizontal.
cs[:2]=sorted(cs[:2],key=lambda c:c[1][0]);cs[3:5]=sorted(cs[3:5],key=lambda c:c[1][0]);cs[5:]=sorted(cs[5:],key=lambda c:c[1][0])
for label,c in zip(labels,cs):
 x,y,cw,ch=c[1];a=np.array(feature);a[~c[2]]=0;save(label,Image.fromarray(a).crop((x,y,x+cw,y+ch)))
parts=[]
def part(id,parent,global_anchor,size,pivot,z,asset=None,limits=(-25,25),visible=True):
 # All rest positions converted to parent joint coordinates, never browser dimensions.
 parent_anchor=anchors[parent] if parent else [256,256];anchors[id]=global_anchor
 p={'id':id,'name':id.replace('_',' ').title(),'parent':parent,'position':[global_anchor[i]-parent_anchor[i] for i in range(2)],'pivot':pivot,'size':size,'z':z,'asset':assets[asset or id],'limits':list(limits),'visible':visible,'palette':['#ff7b21','#ffe2ab','#9364f5','#49305f','#ffcc27']};parts.append(p)
anchors={}
part('tail',None,[213,343],[124,125],[104,65],0,limits=(-12,12))
part('pelvis',None,[256,344],[93,51],[46.5,25.5],3)
part('leg_left','pelvis',[233,350],[39,76],[20,13],2,limits=(-10,10));part('leg_right','pelvis',[280,350],[39,76],[19,13],2,limits=(-10,10))
part('shoe_left','leg_left',[225,421],[65,35],[32,18],4,limits=(-5,5));part('shoe_right','leg_right',[286,421],[65,35],[32,18],4,limits=(-5,5))
part('hoodie',None,[256,280],[144,120],[72,53],10,limits=(-6,6))
for side,x in [('left',202),('right',309)]:
 part('upper_arm_'+side,'hoodie',[x,258],[45,65],[22.5,14],7,'upper_arm',(-25,135) if side=='left' else (-135,25))
 part('forearm_'+side,'upper_arm_'+side,[x,300],[38,54],[19,12],8,'forearm',(-85,20))
 part('hand_'+side,'forearm_'+side,[x,337],[35,44],[17.5,9],9,'hand_rest',(-35,35))
part('neck','hoodie',[256,242],[36,40],[18,14],18,limits=(0,0))
part('head','hoodie',[256,234],[187,147],[93.5,130],20,limits=(-10,10))
part('ear_left','head',[203,157],[68,116],[35,92],19,limits=(-8,8));part('ear_right','head',[309,153],[68,116],[35,92],19,limits=(-8,8))
for side,x in [('left',230),('right',281)]:
 part('eye_'+side,'head',[x,180],[29,39],[14.5,19.5],22,limits=(0,0))
 part('pupil_'+side,'eye_'+side,[x+2,182],[14,26],[7,13],23,limits=(0,0))
 part('brow_'+side,'head',[x,151],[24,10],[12,5],24,limits=(-18,18))
 part('lid_'+side,'head',[x,181],[30,10],[15,5],25,visible=False,limits=(0,0))
part('nose','head',[255,201],[22,12],[11,6],24,limits=(0,0))
part('mouth','head',[255,219],[31,14],[15.5,7],24,'mouth_smile',(-5,5))
rig={'version':1,'id':'fox','name':'Fox','mode':'layered','canvas':[512,512],'origin':[256,256],'ground':438.5,'parts':parts,'assets':list(assets.values()),'contacts':[{'part':'shoe_left','point':[32,35]},{'part':'shoe_right','point':[32,35]}], 'attachments':{'hat':{'parent':'head','position':[0,-135],'asset':None}},'provenance':{'provider':'built-in image_gen','source':'source/parts-atlas.png','processing':'Connected-component cleanup, alpha-safe crop, numeric bind pose; original source retained.'}}
(out/'rig.json').write_text(json.dumps(rig,indent=2));print('Saved',len(parts),'parts and',len(assets),'assets')

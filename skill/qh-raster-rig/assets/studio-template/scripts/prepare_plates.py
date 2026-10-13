from pathlib import Path
import shutil,sys
import numpy as np,cv2
from PIL import Image
root=Path(__file__).resolve().parents[1]/'public/animations/fox';src=Path(sys.argv[1]);shutil.copy2(src,root/'source/clean-plates.png');im=Image.open(src).convert('RGBA');w,h=im.size
for i,name in enumerate(['head','neck','hoodie']):
 a=np.array(im.crop((round(i*w/3),0,round((i+1)*w/3),h)));n,l,st,_=cv2.connectedComponentsWithStats((a[:,:,3]>100).astype('uint8'),8);idx=max(range(1,n),key=lambda i:st[i,4]);mask=(l==idx).astype('uint8');mask=cv2.morphologyEx(mask,cv2.MORPH_OPEN,np.ones((2,2),np.uint8));mask=cv2.dilate(mask,np.ones((3,3),np.uint8));a[mask==0]=0;a[a[:,:,3]==0]=0;out=Image.fromarray(a);out=out.crop(out.getchannel('A').getbbox());out.save(root/f'parts/{name}.png');print(name,out.size)

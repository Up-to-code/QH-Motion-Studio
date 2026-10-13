"""Deterministic registration: crop, uniform scaling and explicitly requested foot mirroring."""
from pathlib import Path
from PIL import Image,ImageOps
import json,shutil
root=Path(__file__).resolve().parent.parent
source=root/'public/animations/fox/source/regenerated-v3/foot-full.png'
folder=root/'public/animations/fox/source/regenerated-v3';folder.mkdir(parents=True,exist_ok=True)
im=Image.open(source).convert('RGBA');bbox=im.getchannel('A').point(lambda a:255 if a>30 else 0).getbbox();im=im.crop(bbox);scale=65/im.width
size=(round(im.width*scale),round(im.height*scale));foot=Image.new('RGBA',(size[0]+16,size[1]+16));foot.alpha_composite(im.resize(size,Image.Resampling.LANCZOS),(8,8))
# Authored ankle axis, and contact 17 rig units below joint; no per-foot scaling.
ankle_x=(800-bbox[0])*scale+8;floor_y=size[1]+8;ankle_y=floor_y-17
parts=root/'public/animations/fox/parts';foot.save(parts/'foot_left_v3.png');ImageOps.mirror(foot).save(parts/'foot_right_v3.png')
metadata={'sourceBBox':bbox,'uniformScale':scale,'size':foot.size,'leftPivot':[ankle_x,ankle_y],'rightPivot':[foot.width-ankle_x,ankle_y],'contactLeft':[ankle_x,floor_y],'contactRight':[foot.width-ankle_x,floor_y],'sourceAnchorReview':'ankle center x=800 source pixels; contact remains 17 rig units below ankle; mirrored complete foot'}
(folder/'registration.json').write_text(json.dumps(metadata,indent=2));print(json.dumps(metadata))

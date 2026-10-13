#!/usr/bin/env python3
"""Rebuild source-derived asset masks and bind pose from retained generation sheets."""
from pathlib import Path
import subprocess,sys
root=Path(__file__).resolve().parents[1];source=root/'public/animations/fox/source'
for name,file in [('prepare_fox.py',source/'parts-atlas.png'),('prepare_plates.py',source/'clean-plates.png')]:
 # Extractors preserve incoming source sheets; copy to temp to avoid SameFileError.
 import tempfile,shutil
 with tempfile.TemporaryDirectory() as d:
  temp=Path(d)/file.name;shutil.copy2(file,temp);subprocess.run([sys.executable,str(root/'scripts'/name),str(temp)],cwd=root,check=True)
subprocess.run([sys.executable,str(root/'scripts/split_wardrobe.py')],cwd=root,check=True)
print('Rebuilt canonical rig and raster layers. Reopen a fresh project or deliberately replace its rig through the revision-aware interface.')

#!/usr/bin/env python3
"""Refresh the portable template and archives; keep runtime/private data outside releases."""
from pathlib import Path
import shutil, zipfile, os, argparse
root=Path(__file__).resolve().parent.parent
skill=root/'skill/qh-raster-rig'
template=skill/'assets/studio-template'
if not skill.exists():raise SystemExit('Run packaging from the source repository containing skill/qh-raster-rig.')
excluded={'.git','node_modules','.local','dist','skill','__pycache__','.DS_Store'}
for entry in root.iterdir():
    if entry.name in excluded or entry.name.endswith('.tsbuildinfo') or entry.name.startswith('.env'):continue
    dest=template/entry.name
    if entry.is_dir():shutil.copytree(entry,dest,dirs_exist_ok=True,ignore=shutil.ignore_patterns('node_modules','.local','dist','__pycache__','*.pyc'))
    else:shutil.copy2(entry,dest)
def archive(source,destination,exclude):
    with zipfile.ZipFile(destination,'w',zipfile.ZIP_DEFLATED) as output:
        for folder,dirs,files in os.walk(source):
            dirs[:]=[d for d in dirs if d not in exclude]
            for name in files:
                if name=='.DS_Store' or name.endswith(('.pyc','.tsbuildinfo')) or name.startswith('.env'):continue
                file=Path(folder)/name
                output.write(file,Path(source.name)/file.relative_to(source))
    with zipfile.ZipFile(destination) as check:
        assert check.testzip() is None
archive(skill,root.parent/'qh-raster-rig-skill.zip',{'__pycache__'})
archive(root,root.parent/'qh-motion-studio-source.zip',{'.git','node_modules','.local','dist','__pycache__'})
parser=argparse.ArgumentParser();parser.add_argument('--install',type=Path);args=parser.parse_args()
if args.install:shutil.copytree(skill,args.install,dirs_exist_ok=True)
print('Portable template and verified ZIP archives updated.')

#!/usr/bin/env python3
"""Portable template installer and command launcher; no image-provider calls."""
from pathlib import Path
import argparse,shutil,subprocess,sys
p=argparse.ArgumentParser();p.add_argument('operation',choices=['init','run']);p.add_argument('workspace',type=Path);p.add_argument('command',nargs=argparse.REMAINDER);a=p.parse_args();dest=a.workspace.expanduser().resolve()
if a.operation=='init':
 if dest.exists() and any(dest.iterdir()):p.error('Destination must be empty; reuse an existing studio instead of overwriting it')
 source=Path(__file__).resolve().parents[1]/'assets/studio-template'
 shutil.copytree(source,dest,dirs_exist_ok=True);print(f'Created {dest}\nRun: pnpm install && pnpm dev')
else:
 if not (dest/'server/cli.mjs').is_file():p.error('Workspace is not a QH studio')
 if not a.command:p.error('Pass a CLI command, e.g. inspect fox')
 sys.exit(subprocess.call(['node',str(dest/'server/cli.mjs'),*a.command],cwd=dest))

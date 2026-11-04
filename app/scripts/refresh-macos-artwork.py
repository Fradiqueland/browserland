"""Refresh Browserland Mac artwork and sources from a verified portable archive."""
import argparse, subprocess, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--mac',required=True,type=Path,help='Verified Mac portable ZIP to update')
    parser.add_argument('--resume',action='store_true')
    args=parser.parse_args()
    command=[sys.executable,str(ROOT/'scripts/update-portable-sources.py'),'--mac',str(args.mac)]
    if args.resume:command.append('--resume')
    subprocess.run(command,check=True)

if __name__=='__main__':main()

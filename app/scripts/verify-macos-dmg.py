"""Independent UDIF/HFSX reader: verify every packaged byte, mode and symlink."""
from pathlib import Path
import argparse, hashlib, json, plistlib, stat, struct, tempfile, unicodedata, zipfile, zlib

def u16(b,o=0): return struct.unpack_from('>H',b,o)[0]
def u32(b,o=0): return struct.unpack_from('>I',b,o)[0]
def u64(b,o=0): return struct.unpack_from('>Q',b,o)[0]
def sha(path):
 h=hashlib.sha256()
 with open(path,'rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()

def expand_dmg(image, raw):
 size=image.stat().st_size
 with image.open('rb') as f,raw.open('w+b') as out:
  f.seek(-512,2);k=f.read(512)
  assert k[:4]==b'koly' and u32(k,4)==4 and u32(k,8)==512,'UDIF footer'
  assert u32(k,60)==1,'Image must be single-file'
  data_at,data_size=u64(k,24),u64(k,32);xml_at,xml_size=u64(k,216),u64(k,224)
  assert 0<data_size<=size-512 and xml_at>=data_at+data_size and xml_at+xml_size<=size-512
  f.seek(xml_at);p=plistlib.loads(f.read(xml_size))
  tables=p['resource-fork']['blkx'];out.truncate(u64(k,492)*512)
  table_crcs=[];global_crc=0;regions=[];chunks=0
  for item in tables:
   b=item['Data'];assert b[:4]==b'mish'
   first,sectors,data_start=u64(b,8),u64(b,16),u64(b,24)
   assert first+sectors<=u64(k,492)
   regions.append((first,first+sectors));crc=0;covered=0
   for i in range(u32(b,200)):
    typ,_,start,count,comp_at,comp_len=struct.unpack_from('>IIQQQQ',b,204+i*40)
    if typ in (0xffffffff,0x7ffffffe):continue
    assert start==covered and start+count<=sectors,'Non-contiguous UDIF chunk map'
    covered+=count;length=count*512
    assert length<=16*1024*1024,'Unexpected chunk size'
    if typ in (0,2):
     data=b'\0'*length
    else:
     assert comp_at+comp_len+data_start<=data_size
     f.seek(data_at+data_start+comp_at);data=f.read(comp_len)
     if typ==0x80000005:data=zlib.decompress(data)
     else:assert typ==1,'Unsupported compression'
     assert len(data)==length
    out.seek((first+start)*512);out.write(data)
    if typ!=2:
     crc=zlib.crc32(data,crc);global_crc=zlib.crc32(data,global_crc)
    chunks+=1
   assert covered==sectors and crc==u32(b,72),'UDIF partition CRC'
   table_crcs.append(crc)
  assert global_crc==u32(k,88),'UDIF data CRC'
  assert zlib.crc32(b''.join(struct.pack('>I',v) for v in table_crcs))==u32(k,360),'UDIF master CRC'
  regions.sort();assert regions[0][0]==0
  for a,b in zip(regions,regions[1:]):assert a[1]==b[0]
  assert regions[-1][1]==u64(k,492)
 return dict(udifChunks=chunks,udifRegions=len(regions),crcVerified=True)

def hfs_start(f):
 f.seek(512);head=f.read(512)
 if head[:8]!=b'EFI PART':return 0
 header_size=struct.unpack_from('<I',head,12)[0]
 header_crc=struct.unpack_from('<I',head,16)[0]
 check=bytearray(head[:header_size]);check[16:20]=b'\0'*4
 assert zlib.crc32(check)==header_crc,'GPT header CRC'
 table_lba,count,entry_size,table_crc=struct.unpack_from('<QIII',head,72)
 assert count<=4096 and entry_size==128
 f.seek(table_lba*512);table=f.read(count*entry_size)
 assert zlib.crc32(table)==table_crc,'GPT table CRC'
 partitions=[]
 for i in range(count):
  entry=table[i*entry_size:(i+1)*entry_size]
  if entry[:16]!=b'\0'*16:
   first,last=struct.unpack_from('<QQ',entry,32);partitions.append((first,last))
 assert len(partitions)==1
 return partitions[0][0]*512

class HFSReader:
 def __init__(self,f):
  self.f=f;self.base=hfs_start(f);self.f.seek(self.base+1024);self.header=f.read(512)
  assert self.header[:2]==b'HX' and u16(self.header,2)==5,'HFSX volume'
  self.block=u32(self.header,40);self.blocks=u32(self.header,44)
  assert self.block in (512,1024,2048,4096,8192)
  f.seek(self.base+self.block*self.blocks-1024);assert f.read(512)==self.header,'HFS alternate header'
  catalog=b''.join(self.chunks(self.header[272:352]))
  node_size=u16(catalog,14+18);nodes=u32(catalog,14+22)
  assert node_size>=512 and nodes*node_size==len(catalog),'HFS B-tree geometry'
  self.records={};files=0;folders=0;leaves=0
  for i in range(nodes):
   node=catalog[i*node_size:(i+1)*node_size]
   if node[8]!=255:continue
   for r in range(u16(node,10)):
    off=u16(node,node_size-2*(r+1));end=u16(node,node_size-2*(r+2))
    assert 14<=off<end<=node_size-2*(u16(node,10)+1)
    key_len=u16(node,off);parent=u32(node,off+2);chars=u16(node,off+6)
    name=node[off+8:off+8+chars*2].decode('utf-16-be')
    body=node[off+2+key_len:end];kind=u16(body);leaves+=1
    if kind not in (1,2):continue
    cnid=u32(body,8);mode=u16(body,42)
    assert cnid not in self.records
    self.records[cnid]=dict(parent=parent,name=name,kind=kind,mode=mode,owner=u32(body,32),group=u32(body,36),fork=body[88:168] if kind==2 else None)
    if kind==2:files+=1
    else:folders+=1
  assert leaves==u32(catalog,14+6),'Catalog leaf count'
  assert files==u32(self.header,32) and folders-1==u32(self.header,36),'Volume file counts'
  self.by_path={}
  def full(cnid,seen=None):
   if cnid==2:return ''
   seen=set() if seen is None else seen
   assert cnid not in seen,'Catalog parent cycle';seen.add(cnid)
   rec=self.records[cnid];assert rec['parent'] in self.records
   prefix=full(rec['parent'],seen)
   return (prefix+'/' if prefix else '')+rec['name']
  for cnid,rec in self.records.items():
   name=full(cnid);assert name not in self.by_path
   self.by_path[name]=rec
 def chunks(self,fork):
  remaining=u64(fork);total=u32(fork,12);blocks=0
  for i in range(8):
   start,count=struct.unpack_from('>II',fork,16+i*8);blocks+=count
   assert start+count<=self.blocks
   available=min(remaining,count*self.block);self.f.seek(self.base+start*self.block)
   while available:
    b=self.f.read(min(available,1024*1024));assert b
    yield b;available-=len(b);remaining-=len(b)
  assert remaining==0 and blocks==total,'File extents'
 def read(self,rec):return b''.join(self.chunks(rec['fork']))
 def digest(self,rec):
  h=hashlib.sha256()
  for b in self.chunks(rec['fork']):h.update(b)
  return h.hexdigest()

def validate(image,archive,report_path):
 image=Path(image);archive=Path(archive);report_path=Path(report_path)
 temp=tempfile.NamedTemporaryFile(prefix='verify-dmg-',suffix='.raw',dir=report_path.parent,delete=False)
 raw=Path(temp.name);temp.close()
 try:
  info=expand_dmg(image,raw);matched=0;symlinks=0;executables=0
  with raw.open('rb') as f,zipfile.ZipFile(archive) as z:
   hfs=HFSReader(f);expected=set()
   for entry in z.infolist():
    n=unicodedata.normalize('NFD',entry.filename.rstrip('/'));expected.add(n)
    rec=hfs.by_path[n];original=entry.external_attr>>16
    assert rec['mode']&0o7777==original&0o7777,'Changed mode: '+n
    assert rec['owner']==99 and rec['group']==99,'Owner-specific permissions'
    if entry.is_dir():assert rec['kind']==1;continue
    digest=hashlib.sha256()
    with z.open(entry) as incoming:
     for b in iter(lambda:incoming.read(1024*1024),b''):digest.update(b)
    assert hfs.digest(rec)==digest.hexdigest(),'Changed content: '+n
    if stat.S_ISLNK(original):
     assert stat.S_ISLNK(rec['mode']);symlinks+=1
    else:assert stat.S_ISREG(rec['mode'])
    if original&0o111:executables+=1
    matched+=1
   files={n for n,r in hfs.by_path.items() if r['kind']==2}
   assert files-expected=={'Applications','READ-ME-FIRST.txt'},'Unexpected files'
   assert hfs.read(hfs.by_path['Applications'])==b'/Applications'
   assert stat.S_ISLNK(hfs.by_path['Applications']['mode'])
   assert b'Copy Browserland.app' in hfs.read(hfs.by_path['READ-ME-FIRST.txt'])
   launcher=hfs.by_path['Browserland.app/Contents/MacOS/Browserland']
   assert launcher['mode']&0o111 and hfs.read(launcher).startswith(b'#!/bin/sh\n')
   for arch,cpu in [('x64',0x1000007),('arm64',0x100000c)]:
    root='Browserland.app/Contents/Resources/runtimes/'+arch+'/'
    for file in ['Browserland.app/Contents/MacOS/Electron','.runtime/chromium/Chromium.app/Contents/MacOS/Chromium']:
     rec=hfs.by_path[root+file];stream=hfs.chunks(rec['fork']);first=next(stream);stream.close()
     assert struct.unpack_from('<II',first)==(0xfeedfacf,cpu) and rec['mode']&0o111
  result=dict(ok=True,path=str(image),bytes=image.stat().st_size,sha256=sha(image),zipSha256=sha(archive),
              zipEntriesMatched=matched,originalSymlinksPreserved=symlinks,executableFilesPreserved=executables,
              filesystem='HFSX',container='UDIF/UDZO',architectures=['x64','arm64'],
              independentReader=True,executionVerified=False,signed=False,notarized=False,**info)
  report_path.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8');print(json.dumps(result),flush=True)
  return result
 finally:
  raw.unlink(missing_ok=True)

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('image');p.add_argument('archive');p.add_argument('report')
 a=p.parse_args();validate(a.image,a.archive,a.report)

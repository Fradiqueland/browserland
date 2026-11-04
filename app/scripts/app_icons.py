"""Application icon conversion and Windows PE resources (build-time only)."""
from pathlib import Path
import ctypes
from ctypes import wintypes
import io
import struct
import json
import hashlib
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
ASSETS=ROOT/'ui/assets'

def version_resource(executable_name):
    """Build a standard VERSIONINFO resource for the branded Windows executable."""
    package=json.loads((ROOT/'package.json').read_text(encoding='utf-8'))
    version=package['version'];parts=[int(n) for n in version.split('.')]
    if len(parts)!=3 or any(n<0 or n>65535 for n in parts):raise ValueError('Invalid Windows product version')
    major,minor,patch=parts
    def block(key,value=b'',children=(),text=False):
        name=(key+'\0').encode('utf-16le')
        result=bytearray(struct.pack('<HHH',0,len(value)//2 if text else len(value),1 if text else 0)+name)
        result.extend(bytes((-len(result))%4));result.extend(value)
        for child in children:
            result.extend(bytes((-len(result))%4));result.extend(child)
        struct.pack_into('<H',result,0,len(result))
        return bytes(result)
    strings={'CompanyName':'Antonio Fradique','FileDescription':'Browserland','FileVersion':version,
             'InternalName':Path(executable_name).stem,'LegalCopyright':'Antonio Fradique',
             'OriginalFilename':executable_name,'ProductName':'Browserland','ProductVersion':version}
    table=block('040904B0',children=[block(k,(v+'\0').encode('utf-16le'),text=True) for k,v in strings.items()],text=True)
    fixed=struct.pack('<13I',0xFEEF04BD,0x10000,(major<<16)|minor,patch<<16,(major<<16)|minor,patch<<16,0x3f,0,0x40004,1,0,0,0)
    return block('VS_VERSION_INFO',fixed,[block('StringFileInfo',children=[table],text=True),block('VarFileInfo',children=[block('Translation',struct.pack('<HH',0x409,1200))],text=True)])

def executable_code_hashes(path):
    data=Path(path).read_bytes();offset=struct.unpack_from('<I',data,0x3c)[0]
    count=struct.unpack_from('<H',data,offset+6)[0];table=offset+24+struct.unpack_from('<H',data,offset+20)[0]
    result={}
    for index in range(count):
        at=table+40*index;size,start=struct.unpack_from('<II',data,at+16);flags=struct.unpack_from('<I',data,at+36)[0]
        if flags&0x20:result[data[at:at+8].rstrip(b'\0').decode('ascii')]=hashlib.sha256(data[start:start+size]).hexdigest()
    if not result:raise ValueError('No executable code sections found')
    return result
def prepare(source):
    source=Path(source)
    with Image.open(source) as image:
        image.load()
        if image.width!=image.height or image.width<256:
            raise ValueError('Application icon must be square and at least 256px')
        rgba=image.convert('RGBA')
        ASSETS.mkdir(parents=True,exist_ok=True)
        (ASSETS/'app-icon.png').write_bytes(source.read_bytes())
        rgba.save(ASSETS/'app-icon.ico',format='ICO',sizes=[(n,n) for n in (16,20,24,32,48,64,128,256)])
        rgba.save(ASSETS/'app-icon.icns',format='ICNS')
    return ASSETS/'app-icon.ico'

def ico_resources(path=None):
    data=Path(path or ASSETS/'app-icon.ico').read_bytes()
    reserved,kind,count=struct.unpack_from('<HHH',data)
    if reserved or kind!=1 or not 1<=count<=32:raise ValueError('Invalid ICO header')
    group=bytearray(struct.pack('<HHH',0,1,count));images=[]
    for index in range(count):
        w,h,colors,zero,planes,bits,size,offset=struct.unpack_from('<BBBBHHII',data,6+16*index)
        if offset<6+16*count or offset+size>len(data):raise ValueError('Invalid ICO bounds')
        image=data[offset:offset+size]
        with Image.open(io.BytesIO(image)) as decoded:
            if decoded.size!=(w or 256,h or 256):raise ValueError('Invalid ICO image dimensions')
        group.extend(struct.pack('<BBBBHHIH',w,h,colors,zero,planes,bits,size,index+1))
        images.append(image)
    return bytes(group),images

def apply_windows(executable):
    executable=Path(executable).resolve()
    group,images=ico_resources()
    kernel=ctypes.WinDLL('kernel32',use_last_error=True)
    kernel.BeginUpdateResourceW.argtypes=[wintypes.LPCWSTR,wintypes.BOOL];kernel.BeginUpdateResourceW.restype=wintypes.HANDLE
    kernel.UpdateResourceW.argtypes=[wintypes.HANDLE,ctypes.c_void_p,ctypes.c_void_p,wintypes.WORD,ctypes.c_void_p,wintypes.DWORD];kernel.UpdateResourceW.restype=wintypes.BOOL
    kernel.EndUpdateResourceW.argtypes=[wintypes.HANDLE,wintypes.BOOL];kernel.EndUpdateResourceW.restype=wintypes.BOOL
    # Brand icons and version metadata; preserve executable code and the manifest.
    import importlib.util
    spec=importlib.util.spec_from_file_location('singlefile',ROOT/'scripts/build-windows-single-file.py')
    pe=importlib.util.module_from_spec(spec);spec.loader.exec_module(pe)
    resources=pe.pe_resources(executable)
    code_before=executable_code_hashes(executable)
    version=version_resource(executable.name)
    handle=kernel.BeginUpdateResourceW(str(executable),False)
    if not handle:raise ctypes.WinError(ctypes.get_last_error())
    success=False
    try:
        for kind in (3,14,16):
            for name,languages in resources.get(kind,{}).items():
                for language in languages:
                    if not kernel.UpdateResourceW(handle,kind,name,language,None,0):raise ctypes.WinError(ctypes.get_last_error())
        for kind,name,data in [(14,1,group),(16,1,version)]+[(3,index+1,image) for index,image in enumerate(images)]:
            buffer=ctypes.create_string_buffer(data)
            if not kernel.UpdateResourceW(handle,kind,name,1033,buffer,len(data)):raise ctypes.WinError(ctypes.get_last_error())
        success=True
    finally:
        if not kernel.EndUpdateResourceW(handle,not success) and success:raise ctypes.WinError(ctypes.get_last_error())
    result=pe.pe_resources(executable)
    if result[14][1][1033]!=group:raise ValueError('Windows icon group verification failed')
    for index,image in enumerate(images):
        if result[3][index+1][1033]!=image:raise ValueError('Windows icon image verification failed')
    if result[16][1][1033]!=version:raise ValueError('Windows version branding verification failed')
    if executable_code_hashes(executable)!=code_before:raise ValueError('Executable code changed during branding')

if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser()
    parser.add_argument('--source')
    parser.add_argument('--windows')
    args=parser.parse_args()
    if args.source:prepare(args.source)
    if args.windows:apply_windows(args.windows)

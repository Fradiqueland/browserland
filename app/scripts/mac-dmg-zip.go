// Browserland ZIP adapter: keep Unix modes and symlinks on Windows.
// Used with JetBrains/go-dmg-writer, pinned in build-macos-dmg.py.
package dmg

import (
 "archive/zip"
 "bytes"
 "fmt"
 "io"
 "os"
 "path"
 "sort"
 "strings"
 "github.com/jetbrains/go-dmg-writer/internal/hfsplus"
)

const installNote = "Browserland - Intel and Apple Silicon\n\nCopy Browserland.app from this image to a writable local folder before opening it.\nFor a portable workspace, choose a folder in your Home directory.\nDo not run the application directly from this read-only disk image.\nSettings and sessions are stored in a data folder beside the copied application.\nKeep this data folder with the application and close all windows before backing it up.\nmacOS 13+ is required. Electron and Chromium are included.\nThis development candidate is not signed/notarized and needs real Mac execution tests.\nDo not disable macOS protections.\n\nCreated by Antonio Fradique\nhttps://AntonioFradique.net\n"

func zipSafe(name string) bool {
 return name!="" && !strings.HasPrefix(name,"/") && !strings.ContainsAny(name,"\\:") && path.Clean(name)==strings.TrimSuffix(name,"/") && name!="." && name!=".." && !strings.HasPrefix(name,"../")
}

func walkZIP(z *zip.ReadCloser, macTime, owner, group uint32, volumeName string) (*scanResult,error) {
 rootName,err:=hfsplus.NewName(volumeName);if err!=nil{return nil,err}
 out:=&scanResult{entries:[]*hfsplus.Entry{newFolderEntry(hfsplus.CNIDRootFolder,hfsplus.CNIDRootParent,rootName,macTime,owner,group,0755)}}
 dirs:=map[string]uint16{}; files:=map[string]*zip.File{}; claimed:=map[string]bool{}
 for _,f:=range z.File {
  n:=strings.TrimSuffix(f.Name,"/")
  if !zipSafe(f.Name)||claimed[n]||n=="Applications"||n=="READ-ME-FIRST.txt"{return nil,fmt.Errorf("unsafe/duplicate/reserved ZIP entry %q",f.Name)}
  claimed[n]=true
  if f.FileInfo().IsDir(){dirs[n]=uint16(f.Mode().Perm())}else{files[n]=f}
  for p:=path.Dir(n);p!=".";p=path.Dir(p){if _,ok:=dirs[p];!ok{dirs[p]=0755}}
 }
 for n:=range files{if _,ok:=dirs[n];ok{return nil,fmt.Errorf("file/directory collision %q",n)}}
 all:=make([]string,0,len(dirs)+len(files)+2)
 for n:=range dirs{all=append(all,n)};for n:=range files{all=append(all,n)}
 all=append(all,"Applications","READ-ME-FIRST.txt");sort.Strings(all)
 cnids:=map[string]uint32{".":hfsplus.CNIDRootFolder};valence:=map[uint32]uint32{};subfolders:=map[uint32]uint32{}
 for _,n:=range all {
  parent,ok:=cnids[path.Dir(n)];if !ok{return nil,fmt.Errorf("missing parent %q",n)}
  id:=hfsplus.CNIDFirstUser+uint32(len(out.entries)-1);cnids[n]=id
  name,err:=hfsplus.NewName(path.Base(n));if err!=nil{return nil,err}
  var e *hfsplus.Entry
  if mode,folder:=dirs[n];folder {
   e=newFolderEntry(id,parent,name,macTime,owner,group,mode);subfolders[parent]++
  }else {
   e=&hfsplus.Entry{CNID:id,ParentCNID:parent,Name:name,Kind:hfsplus.KindFile,Mode:0100644,OwnerID:owner,GroupID:group,CreateTime:macTime,ContentModTime:macTime,AttributeModTime:macTime,AccessTime:macTime,BackupTime:macTime}
   var opener hfsplus.FileOpener;var size uint64
   if n=="Applications"||n=="READ-ME-FIRST.txt" {
    data:=[]byte(installNote)
    if n=="Applications"{data=[]byte("/Applications");e.Kind=hfsplus.KindSymlink;e.Mode=0120777;e.SymlinkTarget="/Applications"}
    size=uint64(len(data));opener=func()(io.ReadCloser,error){return io.NopCloser(bytes.NewReader(data)),nil}
   }else {
    f:=files[n];size=f.UncompressedSize64;e.Mode=uint16(f.Mode().Perm())|0100000
    if f.Mode()&os.ModeSymlink!=0 {
     if size>4096{return nil,fmt.Errorf("oversized symlink %q",n)}
     r,err:=f.Open();if err!=nil{return nil,err};data,err:=io.ReadAll(r);r.Close();if err!=nil{return nil,err}
     target:=string(data);resolved:=path.Clean(path.Join(path.Dir(n),target))
     if strings.HasPrefix(target,"/")||strings.ContainsAny(target,"\\\x00")||strings.Split(resolved,"/")[0]!=strings.Split(n,"/")[0]{return nil,fmt.Errorf("escaping symlink %q",n)}
     e.Kind=hfsplus.KindSymlink;e.Mode=uint16(f.Mode().Perm())|0120000;e.SymlinkTarget=target
    }
    opener=func()(io.ReadCloser,error){return f.Open()}
   }
   e.DataLogicalSize=size;out.files=append(out.files,hfsplus.UserFileInput{Entry:e,Size:size,Opener:opener})
  }
  valence[parent]++;out.entries=append(out.entries,e)
 }
 for _,e:=range out.entries{if e.Kind==hfsplus.KindFolder{e.Valence=valence[e.CNID];e.SubFolderCount=subfolders[e.CNID]}}
 return out,nil
}

package main
import("archive/zip";"fmt";"io";"os";"path/filepath";"strings";"time")
func run()error{
 if len(os.Args)!=5{return fmt.Errorf("usage: INPUT.zip OUTPUT.zip UNIVERSAL_LAUNCHER EXTRA_DIRECTORY")}
 source,err:=zip.OpenReader(os.Args[1]);if err!=nil{return err};defer source.Close()
 output,err:=os.OpenFile(os.Args[2],os.O_WRONLY|os.O_CREATE|os.O_EXCL,0644);if err!=nil{return err};defer output.Close()
 writer:=zip.NewWriter(output)
 for _,entry:=range source.File{
  if !strings.HasPrefix(entry.Name,"Browserland.app/"){return fmt.Errorf("unexpected path: %s",entry.Name)}
  clone:=*entry;clone.FileHeader.Name="Mac-Portable/"+entry.Name
  if entry.FileInfo().IsDir(){header:=clone.FileHeader;if _,err=writer.CreateHeader(&header);err!=nil{return err};continue}
  if entry.Name=="Browserland.app/Contents/MacOS/Browserland"{
   header:=clone.FileHeader;header.SetMode(0755);header.Method=zip.Deflate
   out,err:=writer.CreateHeader(&header);if err!=nil{return err};data,err:=os.Open(os.Args[3]);if err!=nil{return err};_,err=io.Copy(out,data);data.Close();if err!=nil{return err}
  }else if err=writer.Copy(&clone);err!=nil{return err}
 }
 for _,name:=range []string{"LEIA-ME.txt","Restaurar-permissoes-Mac.command","mac-portable-metadata.json"}{
  header:=&zip.FileHeader{Name:"Mac-Portable/"+name,Method:zip.Deflate,Modified:time.Date(2026,10,26,0,0,0,0,time.UTC)}
  mode:=os.FileMode(0644);if strings.HasSuffix(name,".command"){mode=0755};header.SetMode(mode)
  out,err:=writer.CreateHeader(header);if err!=nil{return err};data,err:=os.Open(filepath.Join(os.Args[4],name));if err!=nil{return err};_,err=io.Copy(out,data);data.Close();if err!=nil{return err}
 }
 if err=writer.Close();err!=nil{return err};return output.Sync()
}
func main(){if err:=run();err!=nil{fmt.Fprintln(os.Stderr,err);os.Exit(1)};fmt.Println("MAC_PORTABLE_ZIP_CREATED")}

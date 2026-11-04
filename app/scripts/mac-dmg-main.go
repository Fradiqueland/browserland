package main
import("fmt";"os";"time"; dmg "github.com/jetbrains/go-dmg-writer")
func main(){
 if len(os.Args)!=4{panic("usage: browserland-dmg INPUT.zip OUTPUT.dmg SCRATCH")}
 if _,err:=os.Stat(os.Args[2]);!os.IsNotExist(err){panic("Output already exists; preserve it")}
 d:=&dmg.DMG{VolumeName:"Browserland",OwnerID:dmg.OwnerIDUnset,GroupID:dmg.OwnerIDUnset,PartitionMap:true,TempDir:os.Args[3],Time:time.Date(2026,10,26,0,0,0,0,time.UTC)}
 fmt.Println("Building HFS+ filesystem, preserving ZIP modes and symlinks...")
 if err:=d.CreateFromZIP(os.Args[1],os.Args[2],dmg.ModeReadOnlyCompressed);err!=nil{panic(err)}
 fmt.Println("DMG_CREATED")
}

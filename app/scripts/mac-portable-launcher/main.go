package main
import("fmt";"os";"os/exec";"path/filepath";"runtime";"strings")
type launchPlan struct{Executable,DataDirectory,Architecture string}
func selectArchitecture(goarch string,hardwareArm bool)(string,error){
 if goarch=="arm64"||hardwareArm{return "arm64",nil}
 if goarch=="amd64"{return "x64",nil}
 return "",fmt.Errorf("unsupported Mac architecture: %s",goarch)
}
func prepareLaunch(executable,dataOverride,goarch string,hardwareArm bool)(launchPlan,error){
 arch,err:=selectArchitecture(goarch,hardwareArm);if err!=nil{return launchPlan{},err}
 contents:=filepath.Dir(filepath.Dir(executable))
 portable:=filepath.Dir(filepath.Dir(contents))
 base:=filepath.Join(contents,"Resources","runtimes",arch)
 electron:=filepath.Join(base,"Browserland.app","Contents","MacOS","Electron")
 chrome:=filepath.Join(base,".runtime","chromium","Chromium.app","Contents","MacOS","Chromium")
 for _,file:=range []string{electron,chrome}{
  st,err:=os.Stat(file);if err!=nil||!st.Mode().IsRegular(){return launchPlan{},fmt.Errorf("bundled runtime missing: %s",file)}
  if runtime.GOOS=="darwin"&&st.Mode().Perm()&0111==0{return launchPlan{},fmt.Errorf("bundled runtime is not executable; extract the original ZIP on macOS: %s",file)}
 }
 data:=filepath.Join(portable,"data")
 if dataOverride!=""{if !filepath.IsAbs(dataOverride){return launchPlan{},fmt.Errorf("BROWSERLAND_DATA must be an absolute path")};data=dataOverride}
 return launchPlan{Executable:electron,DataDirectory:data,Architecture:arch},nil
}
func dataOverride()string{
 if value:=os.Getenv("BROWSERLAND_DATA");value!=""{return value}
 return os.Getenv("MULTIBROWSER_DATA") // Compatibility with existing portable workspaces.
}
func run()error{
 executable,err:=os.Executable();if err!=nil{return err}
 hardwareArm:=runtime.GOARCH=="arm64"
 if !hardwareArm{out,_:=exec.Command("/usr/sbin/sysctl","-in","hw.optional.arm64").Output();hardwareArm=strings.TrimSpace(string(out))=="1"}
 plan,err:=prepareLaunch(executable,dataOverride(),runtime.GOARCH,hardwareArm);if err!=nil{return err}
 if err=os.MkdirAll(plan.DataDirectory,0700);err!=nil{return fmt.Errorf("cannot write profile data; move Mac-Portable to a writable local folder: %w",err)}
 if err=os.Setenv("BROWSERLAND_DATA",plan.DataDirectory);err!=nil{return err}
 return execNative(plan.Executable,append([]string{plan.Executable},os.Args[1:]...),os.Environ())
}
func main(){if err:=run();err!=nil{fmt.Fprintln(os.Stderr,"Browserland:",err);showError();os.Exit(1)}}

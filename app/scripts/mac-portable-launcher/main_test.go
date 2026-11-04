package main
import("os";"path/filepath";"testing")
func fixture(t *testing.T)(string,string){
 t.Helper();root:=filepath.Join(t.TempDir(),"Portable with spaces");exe:=filepath.Join(root,"Browserland.app","Contents","MacOS","Browserland")
 if err:=os.MkdirAll(filepath.Dir(exe),0755);err!=nil{t.Fatal(err)};os.WriteFile(exe,[]byte("test"),0755)
 for _,arch:=range []string{"x64","arm64"}{for _,file:=range []string{"Browserland.app/Contents/MacOS/Electron",".runtime/chromium/Chromium.app/Contents/MacOS/Chromium"}{p:=filepath.Join(root,"Browserland.app","Contents","Resources","runtimes",arch,filepath.FromSlash(file));os.MkdirAll(filepath.Dir(p),0755);os.WriteFile(p,[]byte("fixture"),0755)}}
 return root,exe
}
func TestBothArchitecturesShareExternalData(t *testing.T){root,exe:=fixture(t);for _,arch:=range []string{"amd64","arm64"}{p,err:=prepareLaunch(exe,"",arch,false);if err!=nil{t.Fatal(err)};if p.DataDirectory!=filepath.Join(root,"data"){t.Fatal(p.DataDirectory)};if !filepath.IsAbs(p.Executable){t.Fatal("relative executable")}}}
func TestRosettaPrefersNativeArm64(t *testing.T){_,exe:=fixture(t);p,err:=prepareLaunch(exe,"","amd64",true);if err!=nil||p.Architecture!="arm64"{t.Fatal(p,err)}}
func TestMissingRuntimeHasNoInstalledBrowserFallback(t *testing.T){_,exe:=fixture(t);p,err:=prepareLaunch(exe,"","arm64",false);if err!=nil{t.Fatal(err)};os.Remove(p.Executable);if _,err=prepareLaunch(exe,"","arm64",false);err==nil{t.Fatal("missing runtime accepted")}}
func TestExplicitDataOverride(t *testing.T){_,exe:=fixture(t);data:=filepath.Join(t.TempDir(),"Profiles");p,err:=prepareLaunch(exe,data,"amd64",false);if err!=nil||p.DataDirectory!=data{t.Fatal(p,err)};if _,err=prepareLaunch(exe,"relative","amd64",false);err==nil{t.Fatal("relative override accepted")}}
func TestUnsupportedArchitecture(t *testing.T){if _,err:=selectArchitecture("386",false);err==nil{t.Fatal("32-bit accepted")}}

func TestDataOverrideLegacyAndPrecedence(t *testing.T){t.Setenv("BROWSERLAND_DATA","");t.Setenv("MULTIBROWSER_DATA","legacy");if dataOverride()!="legacy"{t.Fatal("legacy override ignored")};t.Setenv("BROWSERLAND_DATA","current");if dataOverride()!="current"{t.Fatal("new override did not take precedence")}}

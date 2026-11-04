//go:build darwin
package main
import("os/exec";"syscall")
func execNative(file string,args,env []string)error{return syscall.Exec(file,args,env)}
func showError(){_ = exec.Command("/usr/bin/osascript","-e",`display alert "Browserland could not start" message "Keep Mac-Portable complete and place it in a writable local folder. If files passed through Windows, restore Mac permissions using the included instructions." as critical`).Run()}

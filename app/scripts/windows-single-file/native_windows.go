//go:build windows

package main

import (
	"crypto/sha256"
	"fmt"
	"os"
	"runtime"
	"sync"
	"syscall"
	"time"
	"unsafe"
)

var kernel32 = syscall.NewLazyDLL("kernel32.dll")
var user32 = syscall.NewLazyDLL("user32.dll")

func wide(value string) *uint16 { p, _ := syscall.UTF16PtrFromString(value); return p }
func isReparse(info os.FileInfo) bool {
	raw, ok := info.Sys().(*syscall.Win32FileAttributeData)
	return ok && raw.FileAttributes&0x400 != 0
}
func lockRuntime(base, hash string) (func(), error) {
	runtime.LockOSThread()
	name := fmt.Sprintf("Local\\BrowserlandSingleFile-%x", sha256.Sum256([]byte(base+"|"+hash)))
	handle, _, e := kernel32.NewProc("CreateMutexW").Call(0, 0, uintptr(unsafe.Pointer(wide(name))))
	if handle == 0 {
		runtime.UnlockOSThread()
		return nil, e
	}
	result, _, e := kernel32.NewProc("WaitForSingleObject").Call(handle, 180000)
	if result != 0 && result != 0x80 {
		kernel32.NewProc("CloseHandle").Call(handle)
		runtime.UnlockOSThread()
		return nil, fmt.Errorf("runtime preparation is busy or unavailable: %v", e)
	}
	return func() {
		kernel32.NewProc("ReleaseMutex").Call(handle)
		kernel32.NewProc("CloseHandle").Call(handle)
		runtime.UnlockOSThread()
	}, nil
}
func showError(message string) {
	user32.NewProc("MessageBoxW").Call(0, uintptr(unsafe.Pointer(wide(message))), uintptr(unsafe.Pointer(wide("Browserland"))), 0x10)
}

type winPoint struct{ X, Y int32 }
type winMessage struct {
	Hwnd           uintptr
	Message        uint32
	WParam, LParam uintptr
	Time           uint32
	Point          winPoint
	Private        uint32
}
type windowClass struct {
	Size, Style                        uint32
	Procedure                          uintptr
	ClassExtra, WindowExtra            int32
	Instance, Icon, Cursor, Background uintptr
	MenuName, ClassName                *uint16
	SmallIcon                          uintptr
}
type startupUI struct {
	mu             sync.Mutex
	percent        int
	stage          string
	stop, finished chan struct{}
	once           sync.Once
}

func (ui *startupUI) Update(percent int, stage string) {
	ui.mu.Lock()
	defer ui.mu.Unlock()
	if percent < ui.percent {
		return
	}
	if percent > 100 {
		percent = 100
	}
	ui.percent = percent
	ui.stage = stage
}
func (ui *startupUI) Close() { ui.once.Do(func() { close(ui.stop); <-ui.finished }) }
func showProgress() *startupUI {
	ui := &startupUI{stage: "Preparing application components", stop: make(chan struct{}), finished: make(chan struct{})}
	go func() {
		runtime.LockOSThread()
		defer runtime.UnlockOSThread()
		defer close(ui.finished)
		user32.NewProc("SetProcessDPIAware").Call()
		common := syscall.NewLazyDLL("comctl32.dll")
		settings := struct{ Size, Classes uint32 }{8, 0x20}
		common.NewProc("InitCommonControlsEx").Call(uintptr(unsafe.Pointer(&settings)))
		sx, _, _ := user32.NewProc("GetSystemMetrics").Call(0)
		sy, _, _ := user32.NewProc("GetSystemMetrics").Call(1)
		gdi := syscall.NewLazyDLL("gdi32.dll")
		brush, _, _ := gdi.NewProc("CreateSolidBrush").Call(0x261612)
		module, _, _ := kernel32.NewProc("GetModuleHandleW").Call(0)
		procedure := syscall.NewCallback(func(hwnd uintptr, msg uint32, wparam, lparam uintptr) uintptr {
			if msg == 0x138 {
				gdi.NewProc("SetTextColor").Call(wparam, 0xfff5f3)
				gdi.NewProc("SetBkColor").Call(wparam, 0x261612)
				return brush
			}
			value, _, _ := user32.NewProc("DefWindowProcW").Call(hwnd, uintptr(msg), wparam, lparam)
			return value
		})
		className := wide("BrowserlandStartupWindow")
		class := windowClass{Procedure: procedure, Instance: module, Background: brush, ClassName: className}
		class.Size = uint32(unsafe.Sizeof(class))
		atom, _, _ := user32.NewProc("RegisterClassExW").Call(uintptr(unsafe.Pointer(&class)))
		if atom == 0 {
			gdi.NewProc("DeleteObject").Call(brush)
			<-ui.stop
			return
		}
		defer user32.NewProc("UnregisterClassW").Call(uintptr(unsafe.Pointer(className)), module)
		defer gdi.NewProc("DeleteObject").Call(brush)
		window, _, _ := user32.NewProc("CreateWindowExW").Call(0x80, uintptr(unsafe.Pointer(className)), uintptr(unsafe.Pointer(wide("Starting Browserland"))), 0x10C00000, (sx-520)/2, (sy-235)/2, 520, 235, 0, 0, module, 0)
		if window == 0 {
			<-ui.stop
			return
		}
		create := func(class, text string, style, x, y, w, h uintptr) uintptr {
			v, _, _ := user32.NewProc("CreateWindowExW").Call(0, uintptr(unsafe.Pointer(wide(class))), uintptr(unsafe.Pointer(wide(text))), style, x, y, w, h, window, 0, 0, 0)
			return v
		}
		icon := create("STATIC", "", 0x50000003, 24, 20, 52, 52)
		appIcon, _, _ := user32.NewProc("LoadImageW").Call(module, 1, 1, 48, 48, 0)
		if appIcon != 0 {
			user32.NewProc("SendMessageW").Call(icon, 0x172, 1, appIcon)
		}
		title := create("STATIC", "Browserland", 0x50000000, 90, 22, 370, 28)
		subtitle := create("STATIC", "Your browsing workspace", 0x50000000, 90, 53, 370, 22)
		label := create("STATIC", ui.stage, 0x50000000, 24, 100, 415, 22)
		percent := create("STATIC", "0%", 0x50000002, 445, 100, 45, 22)
		bar := create("msctls_progress32", "", 0x50000001, 24, 130, 466, 16)
		note := create("STATIC", "The first launch can take longer. Please wait.", 0x50000000, 24, 159, 466, 22)
		font := func(height uintptr, weight uintptr) uintptr {
			v, _, _ := gdi.NewProc("CreateFontW").Call(height, 0, 0, 0, weight, 0, 0, 0, 1, 0, 0, 5, 0, uintptr(unsafe.Pointer(wide("Segoe UI"))))
			return v
		}
		guiFont := font(16, 400)
		headingFont := font(25, 700)
		defer gdi.NewProc("DeleteObject").Call(guiFont)
		defer gdi.NewProc("DeleteObject").Call(headingFont)
		for _, control := range []uintptr{subtitle, label, percent, note} {
			user32.NewProc("SendMessageW").Call(control, 0x30, guiFont, 1)
		}
		user32.NewProc("SendMessageW").Call(title, 0x30, headingFont, 1)
		if appIcon != 0 {
			user32.NewProc("SendMessageW").Call(window, 0x80, 1, appIcon)
		}
		user32.NewProc("SendMessageW").Call(bar, 0x406, 0, 100)
		user32.NewProc("SendMessageW").Call(bar, 0x410, 1, 0)
		user32.NewProc("UpdateWindow").Call(window)
		oldPercent := -1
		oldStage := ""
		for {
			select {
			case <-ui.stop:
				user32.NewProc("DestroyWindow").Call(window)
				if appIcon != 0 {
					user32.NewProc("DestroyIcon").Call(appIcon)
				}
				return
			default:
			}
			ui.mu.Lock()
			value, stage := ui.percent, ui.stage
			ui.mu.Unlock()
			if value != oldPercent || stage != oldStage {
				user32.NewProc("SetWindowTextW").Call(label, uintptr(unsafe.Pointer(wide(stage))))
				user32.NewProc("SetWindowTextW").Call(percent, uintptr(unsafe.Pointer(wide(fmt.Sprintf("%d%%", value)))))
				user32.NewProc("SendMessageW").Call(bar, 0x402, uintptr(value), 0)
				oldPercent, oldStage = value, stage
			}
			var message winMessage
			for {
				found, _, _ := user32.NewProc("PeekMessageW").Call(uintptr(unsafe.Pointer(&message)), 0, 0, 0, 1)
				if found == 0 {
					break
				}
				user32.NewProc("TranslateMessage").Call(uintptr(unsafe.Pointer(&message)))
				user32.NewProc("DispatchMessageW").Call(uintptr(unsafe.Pointer(&message)))
			}
			time.Sleep(20 * time.Millisecond)
		}
	}()
	return ui
}

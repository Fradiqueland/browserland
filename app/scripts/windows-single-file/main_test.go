package main

import (
	"archive/zip"
	"bytes"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func digest(b []byte) string { h := sha256.Sum256(b); return hex.EncodeToString(h[:]) }
func fixture(t *testing.T) *bundle {
	t.Helper()
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	m := manifest{Version: "fixture"}
	for _, name := range []string{"Browserland.exe", ".runtime/chromium/chrome.exe", "resources/app/package.json"} {
		data := []byte("fixture for " + name)
		w, e := zw.Create(name)
		if e != nil {
			t.Fatal(e)
		}
		w.Write(data)
		m.Files = append(m.Files, fileEntry{Path: name, Size: int64(len(data)), SHA256: digest(data)})
	}
	raw, _ := json.Marshal(m)
	w, _ := zw.Create(manifestName)
	w.Write(raw)
	zw.Close()
	manifestSHA = digest(raw)
	payloadSHA = digest(buf.Bytes())
	data := append(make([]byte, 1024), buf.Bytes()...)
	footer := make([]byte, 32)
	copy(footer, footerMagic)
	binary.LittleEndian.PutUint64(footer[16:], 1024)
	binary.LittleEndian.PutUint64(footer[24:], uint64(buf.Len()))
	data = append(data, footer...)
	path := filepath.Join(t.TempDir(), "package.exe")
	os.WriteFile(path, data, 0600)
	b, e := openBundle(path)
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() { b.file.Close() })
	return b
}
func TestUnsafeWindowsArchivePaths(t *testing.T) {
	for _, name := range []string{"../escape", "/absolute", "C:/drive", "a\\escape", "a:stream", "a/../b", "a//b", "a/./b", "NUL.txt", "a/COM1", "a/trailing.", "a/trailing ", "a/?", "a/\x00"} {
		t.Run(name, func(t *testing.T) {
			if _, e := safeName(name); e == nil {
				t.Fatal("unsafe name accepted")
			}
		})
	}
	if _, e := safeName(".runtime/chromium/chrome.exe"); e != nil {
		t.Fatal(e)
	}
}
func TestExtractReuseAndRejectTampering(t *testing.T) {
	b := fixture(t)
	base := filepath.Join(t.TempDir(), "cache")
	root, reused, e := ensureRuntime(b, base)
	if e != nil || reused {
		t.Fatalf("first extraction: %v %v", reused, e)
	}
	if _, reused, e = ensureRuntime(b, base); e != nil || !reused {
		t.Fatalf("reuse: %v %v", reused, e)
	}
	path := filepath.Join(root, "resources", "app", "package.json")
	original, _ := os.ReadFile(path)
	changed := bytes.Repeat([]byte("X"), len(original))
	os.WriteFile(path, changed, 0600)
	if _, _, e = ensureRuntime(b, base); e == nil {
		t.Fatal("same-size modification accepted")
	}
	actual, _ := os.ReadFile(path)
	if !bytes.Equal(actual, changed) {
		t.Fatal("existing cache was overwritten")
	}
}
func TestInjectedDLLRejected(t *testing.T) {
	b := fixture(t)
	base := filepath.Join(t.TempDir(), "cache")
	root, _, e := ensureRuntime(b, base)
	if e != nil {
		t.Fatal(e)
	}
	os.WriteFile(filepath.Join(root, "injected.dll"), []byte("foreign"), 0600)
	if _, _, e = ensureRuntime(b, base); e == nil {
		t.Fatal("injected file accepted")
	}
}
func TestCorruptPayloadRejectedBeforeExtraction(t *testing.T) {
	b := fixture(t)
	payloadSHA = strings.Repeat("0", 64)
	base := filepath.Join(t.TempDir(), "cache")
	if _, _, e := ensureRuntime(b, base); e == nil {
		t.Fatal("wrong payload hash accepted")
	}
	entries, _ := os.ReadDir(base)
	if len(entries) != 0 {
		t.Fatal("failed validation extracted files")
	}
}
func TestManifestPinnedToLauncher(t *testing.T) {
	b := fixture(t)
	manifestSHA = strings.Repeat("0", 64)
	if _, e := openBundle(b.file.Name()); e == nil {
		t.Fatal("untrusted manifest accepted")
	}
}
func TestPortableDataStableAcrossRenaming(t *testing.T) {
	base := t.TempDir()
	a, _ := dataDirectory(filepath.Join(base, "Browserland.exe"), "")
	b, _ := dataDirectory(filepath.Join(base, "Renamed.exe"), "")
	if a != b || a != filepath.Join(base, "data") {
		t.Fatal("renaming changed portable data")
	}
	override := filepath.Join(base, "custom")
	if got, e := dataDirectory("unused", override); e != nil || got != override {
		t.Fatal(got, e)
	}
	if _, e := dataDirectory("unused", "relative"); e == nil {
		t.Fatal("relative override accepted")
	}
}
func TestNodeEnvironmentCannotChangeApplicationMode(t *testing.T) {
	t.Setenv("ELECTRON_RUN_AS_NODE", "1")
	t.Setenv("NODE_OPTIONS", "--inspect=0.0.0.0")
	t.Setenv("NODE_PATH", "foreign")
	joined := strings.Join(environment("C:\\Portable\\data", "C:\\Portable\\app.exe"), "\n")
	for _, name := range []string{"ELECTRON_RUN_AS_NODE=", "NODE_OPTIONS=", "NODE_PATH="} {
		if strings.Contains(joined, name) {
			t.Fatal("unsafe inherited variable:", name)
		}
	}
	if !strings.Contains(joined, "BROWSERLAND_DATA=C:\\Portable\\data") {
		t.Fatal("data not forwarded")
	}
}
func TestTruncatedExecutableRejected(t *testing.T) {
	path := filepath.Join(t.TempDir(), "broken.exe")
	os.WriteFile(path, []byte("incomplete"), 0600)
	if _, e := openBundle(path); e == nil {
		t.Fatal("truncated payload accepted")
	}
}
func TestLinkedCacheRejected(t *testing.T) {
	base := t.TempDir()
	target := filepath.Join(base, "outside")
	os.Mkdir(target, 0700)
	link := filepath.Join(base, "link")
	if e := os.Symlink(target, link); e != nil {
		t.Skip(e)
	}
	if e := noLinks(link); e == nil {
		t.Fatal("linked cache accepted")
	}
}

func TestConcurrentFirstOpeningsShareOneRuntime(t *testing.T) {
	b := fixture(t)
	base := filepath.Join(t.TempDir(), "cache")
	type outcome struct {
		root   string
		reused bool
		err    error
	}
	done := make(chan outcome, 2)
	for i := 0; i < 2; i++ {
		go func() { root, reused, e := ensureRuntime(b, base); done <- outcome{root, reused, e} }()
	}
	first, second := <-done, <-done
	if first.err != nil || second.err != nil || first.root != second.root || first.reused == second.reused {
		t.Fatalf("concurrent extraction failed: %+v %+v", first, second)
	}
	entries, e := os.ReadDir(base)
	if e != nil || len(entries) != 1 {
		t.Fatal("leftover extraction directories", entries, e)
	}
}

func TestCompatibleEnvironmentOverrides(t *testing.T) {
	t.Setenv("MULTIBROWSER_DATA", "legacy")
	t.Setenv("BROWSERLAND_DATA", "")
	if compatibleEnv("DATA") != "legacy" {
		t.Fatal("legacy data override ignored")
	}
	t.Setenv("BROWSERLAND_DATA", "current")
	if compatibleEnv("DATA") != "current" {
		t.Fatal("new data override does not take precedence")
	}
	for _, key := range []string{"BROWSERLAND_STARTUP_TOKEN", "MULTIBROWSER_STARTUP_TOKEN", "BROWSERLAND_SINGLE_FILE", "MULTIBROWSER_SINGLE_FILE"} {
		t.Setenv(key, "stale")
	}
	env := strings.Join(environment("resolved-data", "resolved-exe"), "\n")
	if strings.Contains(env, "MULTIBROWSER_DATA=") || strings.Contains(env, "STARTUP_TOKEN=") || strings.Contains(env, "MULTIBROWSER_SINGLE_FILE=") || strings.Contains(env, "stale") {
		t.Fatal("stale launch authority forwarded")
	}
	if !strings.Contains(env, "BROWSERLAND_DATA=resolved-data") || !strings.Contains(env, "BROWSERLAND_SINGLE_FILE=resolved-exe") {
		t.Fatal("resolved launch identity missing")
	}
}

package main

import (
	"archive/zip"
	"bufio"
	"crypto/rand"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

var payloadSHA string
var manifestSHA string

// Keep the established 16-byte archive format marker for existing tooling.
const footerMagic = "MULTIBROWSER-SF1"
const manifestName = "single-file-manifest.json"

type fileEntry struct {
	Path   string
	Size   int64
	SHA256 string
}
type manifest struct {
	Version string
	Files   []fileEntry
}
type bundle struct {
	file        *os.File
	reader      *zip.Reader
	start, size int64
	manifest    manifest
}
type launchReport struct {
	StartupMS                     int64
	OK                            bool
	Error, Version, Runtime, Data string
	Reused                        bool
	Files                         int
	PreparationMS                 int64
}

func sumReader(r io.Reader) (string, error) {
	h := sha256.New()
	if _, err := io.Copy(h, r); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}
func fileSHA(path string) (string, error) {
	f, e := os.Open(path)
	if e != nil {
		return "", e
	}
	defer f.Close()
	return sumReader(f)
}
func safeName(name string) (string, error) {
	if name == "" || strings.ContainsAny(name, "\\:") || strings.HasPrefix(name, "/") || strings.ContainsRune(name, 0) {
		return "", fmt.Errorf("unsafe archive path: %q", name)
	}
	for _, part := range strings.Split(strings.TrimSuffix(name, "/"), "/") {
		if part == "" || part == "." || part == ".." || strings.TrimRight(part, " .") != part {
			return "", fmt.Errorf("unsafe archive component: %q", name)
		}
		for _, c := range part {
			if c < 32 || strings.ContainsRune("<>\"|?*", c) {
				return "", fmt.Errorf("invalid Windows archive name: %q", name)
			}
		}
		base := strings.ToUpper(strings.SplitN(part, ".", 2)[0])
		if base == "CON" || base == "PRN" || base == "AUX" || base == "NUL" || len(base) == 4 && (strings.HasPrefix(base, "COM") || strings.HasPrefix(base, "LPT")) && base[3] >= '0' && base[3] <= '9' {
			return "", fmt.Errorf("reserved Windows archive name: %q", name)
		}
	}
	return filepath.FromSlash(name), nil
}
func noLinks(path string) error {
	absolute, e := filepath.Abs(path)
	if e != nil {
		return e
	}
	for current := absolute; ; current = filepath.Dir(current) {
		info, e := os.Lstat(current)
		if e == nil {
			if info.Mode()&os.ModeSymlink != 0 || isReparse(info) {
				return fmt.Errorf("linked paths are not allowed for runtime files: %s", current)
			}
		} else if !os.IsNotExist(e) {
			return e
		}
		if filepath.Dir(current) == current {
			break
		}
	}
	return nil
}
func openBundle(path string) (*bundle, error) {
	f, e := os.Open(path)
	if e != nil {
		return nil, e
	}
	ok := false
	defer func() {
		if !ok {
			f.Close()
		}
	}()
	st, e := f.Stat()
	if e != nil {
		return nil, e
	}
	const footerSize = 32
	if st.Size() < footerSize {
		return nil, errors.New("single-file package is incomplete")
	}
	footer := make([]byte, footerSize)
	if _, e = f.ReadAt(footer, st.Size()-footerSize); e != nil {
		return nil, e
	}
	if string(footer[:16]) != footerMagic {
		return nil, errors.New("single-file package footer is invalid")
	}
	start, size := int64(binary.LittleEndian.Uint64(footer[16:24])), int64(binary.LittleEndian.Uint64(footer[24:32]))
	if start < 1024 || size < 22 || size > 2<<30 || start > st.Size()-footerSize || size != st.Size()-footerSize-start {
		return nil, errors.New("single-file package bounds are invalid")
	}
	reader, e := zip.NewReader(io.NewSectionReader(f, start, size), size)
	if e != nil {
		return nil, e
	}
	b := &bundle{file: f, reader: reader, start: start, size: size}
	seen := map[string]bool{}
	var total uint64
	var mf *zip.File
	for _, item := range reader.File {
		if _, e = safeName(item.Name); e != nil {
			return nil, e
		}
		key := strings.ToLower(strings.TrimSuffix(item.Name, "/"))
		if seen[key] {
			return nil, errors.New("duplicate archive path")
		}
		seen[key] = true
		if item.Mode()&os.ModeSymlink != 0 || !item.FileInfo().IsDir() && !item.Mode().IsRegular() {
			return nil, errors.New("archive contains links or special files")
		}
		total += item.UncompressedSize64
		if total > 5<<30 || item.UncompressedSize64 > 1<<30 {
			return nil, errors.New("archive exceeds extraction limits")
		}
		if item.Name == manifestName {
			mf = item
		}
	}
	if len(reader.File) > 10000 || mf == nil || mf.UncompressedSize64 > 8<<20 {
		return nil, errors.New("invalid package manifest")
	}
	r, e := mf.Open()
	if e != nil {
		return nil, e
	}
	bytes, e := io.ReadAll(r)
	r.Close()
	if e != nil {
		return nil, e
	}
	h := sha256.Sum256(bytes)
	if hex.EncodeToString(h[:]) != manifestSHA {
		return nil, errors.New("package manifest checksum mismatch")
	}
	if e = json.Unmarshal(bytes, &b.manifest); e != nil {
		return nil, e
	}
	listed := map[string]bool{}
	for _, entry := range b.manifest.Files {
		if _, e = safeName(entry.Path); e != nil {
			return nil, e
		}
		if entry.Size < 0 || len(entry.SHA256) != 64 || entry.Path == manifestName || listed[strings.ToLower(entry.Path)] {
			return nil, errors.New("invalid manifest file entry")
		}
		if _, e = hex.DecodeString(entry.SHA256); e != nil {
			return nil, e
		}
		listed[strings.ToLower(entry.Path)] = true
	}
	count := 0
	for _, item := range reader.File {
		if !item.FileInfo().IsDir() && item.Name != manifestName {
			if !listed[strings.ToLower(item.Name)] {
				return nil, errors.New("archive contains an unlisted file")
			}
			count++
		}
	}
	if count != len(listed) {
		return nil, errors.New("manifest does not match the archive")
	}
	for _, required := range []string{"Browserland.exe", ".runtime/chromium/chrome.exe", "resources/app/package.json"} {
		if !listed[strings.ToLower(required)] {
			return nil, errors.New("bundled application is incomplete")
		}
	}
	ok = true
	return b, nil
}
func verifyRuntime(root string, m manifest) error { return verifyRuntimeProgress(root, m, 0, 94) }
func verifyRuntimeProgress(root string, m manifest, start, span int) error {
	if e := noLinks(root); e != nil {
		return e
	}
	var total, done int64
	for _, entry := range m.Files {
		total += entry.Size
	}
	progressCallback(start, "Verifying application components")
	for _, entry := range m.Files {
		rel, e := safeName(entry.Path)
		if e != nil {
			return e
		}
		path := filepath.Join(root, rel)
		if e = noLinks(path); e != nil {
			return e
		}
		info, e := os.Lstat(path)
		if e != nil {
			return e
		}
		if !info.Mode().IsRegular() || info.Size() != entry.Size {
			return fmt.Errorf("runtime file is incomplete: %s", entry.Path)
		}
		file, e := os.Open(path)
		if e != nil {
			return e
		}
		reader := &countedReader{reader: file, done: done, total: total, start: start, span: span, stage: "Verifying application components"}
		hash, e := sumReader(reader)
		file.Close()
		if e != nil {
			return e
		}
		done += entry.Size
		if hash != entry.SHA256 {
			return fmt.Errorf("runtime checksum mismatch: %s", entry.Path)
		}
	}
	listed := map[string]bool{strings.ToLower(manifestName): true}
	for _, entry := range m.Files {
		listed[strings.ToLower(filepath.FromSlash(entry.Path))] = true
	}
	return filepath.WalkDir(root, func(path string, d os.DirEntry, e error) error {
		if e != nil {
			return e
		}
		if e = noLinks(path); e != nil {
			return e
		}
		if d.IsDir() {
			return nil
		}
		rel, e := filepath.Rel(root, path)
		if e != nil {
			return e
		}
		if !listed[strings.ToLower(rel)] {
			return fmt.Errorf("unexpected runtime file: %s", rel)
		}
		return nil
	})
}
func ensureRuntime(b *bundle, base string) (string, bool, error) {
	if len(payloadSHA) != 64 {
		return "", false, errors.New("launcher has no payload checksum")
	}
	if e := noLinks(base); e != nil {
		return "", false, e
	}
	if e := os.MkdirAll(base, 0700); e != nil {
		return "", false, e
	}
	progressCallback(0, "Checking application components")
	release, e := lockRuntime(base, payloadSHA)
	if e != nil {
		return "", false, e
	}
	defer release()
	root := filepath.Join(base, payloadSHA)
	if _, e = os.Lstat(root); e == nil {
		if e = verifyRuntime(root, b.manifest); e != nil {
			return "", true, fmt.Errorf("cached runtime failed validation; your data is unchanged: %w", e)
		}
		return root, true, nil
	} else if !os.IsNotExist(e) {
		return "", false, e
	}
	hash, e := sumReader(progressRead(io.NewSectionReader(b.file, b.start, b.size), b.size, 0, 15, "Checking the embedded package"))
	if e != nil {
		return "", false, e
	}
	if hash != payloadSHA {
		return "", false, errors.New("embedded application checksum mismatch")
	}
	stage, e := os.MkdirTemp(base, ".preparing-")
	if e != nil {
		return "", false, e
	}
	defer func() {
		if filepath.Dir(stage) == filepath.Clean(base) && strings.HasPrefix(filepath.Base(stage), ".preparing-") {
			os.RemoveAll(stage)
		}
	}()
	var total, done int64
	for _, item := range b.reader.File {
		total += int64(item.UncompressedSize64)
	}
	for _, item := range b.reader.File {
		rel, _ := safeName(item.Name)
		dest := filepath.Join(stage, rel)
		if item.FileInfo().IsDir() {
			if e = os.MkdirAll(dest, 0700); e != nil {
				return "", false, e
			}
			continue
		}
		if e = os.MkdirAll(filepath.Dir(dest), 0700); e != nil {
			return "", false, e
		}
		r, e := item.Open()
		if e != nil {
			return "", false, e
		}
		w, e := os.OpenFile(dest, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
		if e != nil {
			r.Close()
			return "", false, e
		}
		incoming := &countedReader{reader: io.LimitReader(r, int64(item.UncompressedSize64)+1), done: done, total: total, start: 15, span: 55, stage: "Preparing application files"}
		_, copyErr := io.Copy(w, incoming)
		done += int64(item.UncompressedSize64)
		closeErr := w.Close()
		r.Close()
		if copyErr != nil {
			return "", false, copyErr
		}
		if closeErr != nil {
			return "", false, closeErr
		}
	}
	if e = verifyRuntimeProgress(stage, b.manifest, 70, 24); e != nil {
		return "", false, e
	}
	if e = os.Rename(stage, root); e != nil {
		return "", false, e
	}
	return root, false, nil
}
func dataDirectory(exe, override string) (string, error) {
	if override != "" {
		if !filepath.IsAbs(override) {
			return "", errors.New("BROWSERLAND_DATA must be an absolute path")
		}
		return filepath.Clean(override), nil
	}
	return filepath.Join(filepath.Dir(exe), "data"), nil
}
func compatibleEnv(suffix string) string {
	if value := os.Getenv("BROWSERLAND_" + suffix); value != "" {
		return value
	}
	return os.Getenv("MULTIBROWSER_" + suffix)
}
func environment(data, exe string) []string {
	var values []string
	for _, item := range os.Environ() {
		key := strings.ToUpper(strings.SplitN(item, "=", 2)[0])
		if key == "BROWSERLAND_STARTUP_TOKEN" || key == "BROWSERLAND_DATA" || key == "BROWSERLAND_SINGLE_FILE" || key == "MULTIBROWSER_STARTUP_TOKEN" || key == "MULTIBROWSER_DATA" || key == "MULTIBROWSER_SINGLE_FILE" || key == "ELECTRON_RUN_AS_NODE" || key == "NODE_OPTIONS" || key == "NODE_PATH" {
			continue
		}
		values = append(values, item)
	}
	return append(values, "BROWSERLAND_DATA="+data, "BROWSERLAND_SINGLE_FILE="+exe)
}
func run() (launchReport, int, error) {
	started := time.Now()
	report := launchReport{}
	exe, e := os.Executable()
	if e != nil {
		return report, 1, e
	}
	data, e := dataDirectory(exe, compatibleEnv("DATA"))
	if e != nil {
		return report, 1, e
	}
	report.Data = data
	b, e := openBundle(exe)
	if e != nil {
		return report, 1, e
	}
	defer b.file.Close()
	report.Version = b.manifest.Version
	report.Files = len(b.manifest.Files)
	base := compatibleEnv("CACHE")
	if base == "" {
		cache, e := os.UserCacheDir()
		if e != nil {
			return report, 1, e
		}
		base = filepath.Join(cache, "AntonioFradique", "Browserland", "single-file-runtime")
	}
	if !filepath.IsAbs(base) {
		return report, 1, errors.New("BROWSERLAND_CACHE must be an absolute path")
	}
	var args []string
	verify := false
	for _, arg := range os.Args[1:] {
		if arg == "--single-file-verify" {
			verify = true
		} else if !strings.HasPrefix(arg, "--single-file-report=") {
			args = append(args, arg)
		}
	}
	closeProgress := func() {}
	if !verify {
		ui := showProgress()
		closeProgress = ui.Close
		progressCallback = ui.Update
		defer closeProgress()
	}
	root, reused, e := ensureRuntime(b, base)
	if e != nil {
		return report, 1, e
	}
	report.Runtime = root
	report.Reused = reused
	report.PreparationMS = time.Since(started).Milliseconds()
	if verify {
		report.OK = true
		return report, 0, nil
	}
	if e = os.MkdirAll(data, 0700); e != nil {
		return report, 1, fmt.Errorf("cannot save portable data beside the EXE; move the EXE to a writable folder: %w", e)
	}
	probe, e := os.CreateTemp(data, ".write-check-")
	if e != nil {
		return report, 1, e
	}
	probe.Close()
	os.Remove(probe.Name())
	log, e := os.OpenFile(filepath.Join(data, "single-file-launch.log"), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0600)
	if e != nil {
		return report, 1, e
	}
	defer log.Close()
	encoded, _ := json.Marshal(report)
	fmt.Fprintf(log, "%s %s\n", time.Now().UTC().Format(time.RFC3339), encoded)
	progressCallback(96, "Opening your workspace")
	stdout, writer, e := os.Pipe()
	if e != nil {
		return report, 1, e
	}
	defer stdout.Close()
	nonce := make([]byte, 16)
	if _, e = rand.Read(nonce); e != nil {
		writer.Close()
		return report, 1, e
	}
	token := hex.EncodeToString(nonce)
	command := exec.Command(filepath.Join(root, "Browserland.exe"), args...)
	command.Dir = root
	command.Env = append(environment(data, exe), "BROWSERLAND_STARTUP_TOKEN="+token)
	command.Stdout = writer
	command.Stderr = log
	if e = command.Start(); e != nil {
		writer.Close()
		return report, 1, e
	}
	writer.Close()
	ready := make(chan struct{}, 1)
	readDone := make(chan struct{})
	go func() {
		defer close(readDone)
		scanner := bufio.NewScanner(stdout)
		scanner.Buffer(make([]byte, 4096), 1024*1024)
		for scanner.Scan() {
			line := scanner.Text()
			if line == "BROWSERLAND_STARTUP_READY="+token {
				select {
				case ready <- struct{}{}:
				default:
				}
			} else {
				fmt.Fprintln(log, line)
			}
		}
		if scanner.Err() != nil {
			io.Copy(log, stdout)
		}
	}()
	exited := make(chan error, 1)
	go func() { exited <- command.Wait() }()
	var childError error
	ended := false
	select {
	case <-ready:
		report.StartupMS = time.Since(started).Milliseconds()
		progressCallback(100, "Ready")
		time.Sleep(140 * time.Millisecond)
		closeProgress()
	case childError = <-exited:
		ended = true
		closeProgress()
	case <-time.After(60 * time.Second):
		command.Process.Kill()
		<-exited
		closeProgress()
		return report, 1, errors.New("the application did not finish starting within 60 seconds")
	}
	if !ended {
		childError = <-exited
	}
	select {
	case <-readDone:
	case <-time.After(2 * time.Second):
		stdout.Close()
		<-readDone
	}
	if childError != nil {
		var exit *exec.ExitError
		if errors.As(childError, &exit) {
			return report, exit.ExitCode(), childError
		}
		return report, 1, childError
	}

	report.OK = true
	return report, 0, nil
}
func main() {
	report, code, e := run()
	if e != nil {
		report.Error = e.Error()
	}
	wrote := false
	for _, arg := range os.Args[1:] {
		if strings.HasPrefix(arg, "--single-file-report=") {
			path := strings.TrimPrefix(arg, "--single-file-report=")
			if filepath.IsAbs(path) {
				bytes, _ := json.MarshalIndent(report, "", "  ")
				if err := os.WriteFile(path, bytes, 0600); err == nil {
					wrote = true
				}
			}
		}
	}
	if e != nil && !wrote {
		showError(e.Error())
	}
	os.Exit(code)
}

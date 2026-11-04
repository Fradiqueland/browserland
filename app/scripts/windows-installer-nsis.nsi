Unicode true
Target x86-unicode
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"
!include "x64.nsh"
!include "Win\COM.nsh"
!include "Win\Propkey.nsh"
!include "${MB_PAYLOAD_INCLUDE}"

!define MB_APP_ID "net.antoniofradique.browserland"
; The previous product is recognized only for an in-place, data-preserving update.
!define MB_LEGACY_APP_ID "net.antoniofradique.multibrowser"
; A new path for every release avoids reusing Explorer's cached EXE icon.
!define MB_SHELL_ICON "$INSTDIR\Browserland-${MB_VERSION}.ico"
!ifndef MB_TEST
 !define MB_SETUP_KEY "Software\AntonioFradique\Browserland\Setup"
 !define MB_UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\AntonioFradique.Browserland"
!else
 !define MB_SETUP_KEY "Software\AntonioFradique\Browserland\InstallerTests\${MB_TEST_ID}"
 !define MB_UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\Browserland-Test-${MB_TEST_ID}"
!endif

Name "Browserland"
OutFile "${MB_OUTPUT}"
InstallDir "$LOCALAPPDATA\Programs\Browserland"
InstallDirRegKey HKCU "${MB_SETUP_KEY}" "InstallLocation"
RequestExecutionLevel user
CRCCheck force
SetCompressor /SOLID zlib
SetDatablockOptimize on
AllowSkipFiles off
ShowInstDetails show
ShowUninstDetails show
BrandingText "Antonio Fradique | AntonioFradique.net"
VIProductVersion "${MB_VERSION}.0"
VIAddVersionKey "ProductName" "Browserland Setup"
VIAddVersionKey "CompanyName" "Antonio Fradique"
VIAddVersionKey "FileDescription" "Browserland Electron application installer"
VIAddVersionKey "ProductVersion" "${MB_VERSION}"
VIAddVersionKey "FileVersion" "${MB_VERSION}"
VIAddVersionKey "LegalCopyright" "Antonio Fradique"

Var DesktopRoot
Var MenuRoot
Var PinnedRoot
Var LegacyUpgrade
!define MUI_ABORTWARNING
!define MUI_ICON "${MB_ICON}"
!define MUI_UNICON "${MB_ICON}"
!define MUI_FINISHPAGE_RUN "$INSTDIR\Browserland.exe"
!define MUI_FINISHPAGE_RUN_NOTCHECKED
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH
!insertmacro MUI_LANGUAGE "English"
!insertmacro MUI_LANGUAGE "Portuguese"

LangString Need64 ${LANG_ENGLISH} "Browserland requires 64-bit Windows."
LangString Need64 ${LANG_PORTUGUESE} "O Browserland necessita de Windows de 64 bits."
LangString CloseApplication ${LANG_ENGLISH} "Close Browserland and its browser profiles before continuing."
LangString CloseApplication ${LANG_PORTUGUESE} "Fecha o Browserland e os seus perfis antes de continuar."
LangString PreviousMSI ${LANG_ENGLISH} "An MSI installation was found. Remove it in Windows Settings > Apps before running this setup. Its data folder will be preserved."
LangString PreviousMSI ${LANG_PORTUGUESE} "Foi encontrada uma instalacao MSI. Remove-a em Definicoes do Windows > Aplicacoes antes de executar este instalador. A pasta data sera conservada."
LangString WrongFolder ${LANG_ENGLISH} "The installation marker does not match Browserland. No files were removed."
LangString WrongFolder ${LANG_PORTUGUESE} "A pasta nao corresponde a uma instalacao do Browserland. Nenhum ficheiro foi removido."
LangString LockedFiles ${LANG_ENGLISH} "Some application files are in use. Close all Browserland windows and retry. Your data folder is preserved."
LangString LockedFiles ${LANG_PORTUGUESE} "Existem ficheiros da aplicacao em utilizacao. Fecha todas as janelas do Browserland e tenta novamente. A pasta data sera conservada."

!macro CheckApplicationClosed PREFIX
 !ifndef MB_TEST
  ${PREFIX}check_running:
  FindWindow $0 "Chrome_WidgetWin_1" "Browserland"
  StrCmp $0 0 0 ${PREFIX}running
  FindWindow $0 "Chrome_WidgetWin_1" "Multi-Browser"
  StrCmp $0 0 ${PREFIX}closed
  ${PREFIX}running:
  IfSilent ${PREFIX}busy
  MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(CloseApplication)" IDRETRY ${PREFIX}check_running
  ${PREFIX}busy:
  SetErrorLevel 1618
  Abort
  ${PREFIX}closed:
 !endif
!macroend

Function .onInit
 SetShellVarContext current
 SetRegView 64
 ${IfNot} ${RunningX64}
  MessageBox MB_OK|MB_ICONSTOP "$(Need64)"
  SetErrorLevel 1633
  Abort
 ${EndIf}
 !ifndef MB_TEST
  ; Prefer a Browserland installation; otherwise upgrade the registered legacy
  ; directory in place. Never move or copy the user's data/credential stores.
  ReadRegStr $0 HKCU "${MB_SETUP_KEY}" "InstallLocation"
  StrCmp $0 "" 0 existing_location_ready
  StrCmp $INSTDIR "$LOCALAPPDATA\Programs\Browserland" 0 existing_location_ready
  ReadRegStr $0 HKCU "Software\AntonioFradique\Multi-Browser\Setup" "InstallLocation"
  StrCmp $0 "" existing_location_ready
  IfFileExists "$0\Multi-Browser.install.ini" 0 existing_location_ready
  ReadINIStr $1 "$0\Multi-Browser.install.ini" "Setup" "AppId"
  StrCmp $1 "${MB_LEGACY_APP_ID}" 0 existing_location_ready
  StrCpy $INSTDIR $0
  existing_location_ready:
  ReadRegStr $0 HKCU "Software\AntonioFradique\Browserland\Installer" "InstallDir"
  StrCmp $0 "" 0 msi_prompt
  ReadRegStr $0 HKCU "Software\AntonioFradique\Multi-Browser\Installer" "InstallDir"
  StrCmp $0 "" no_msi
  msi_prompt:
  IfSilent msi_found
  MessageBox MB_OK|MB_ICONEXCLAMATION "$(PreviousMSI)"
  msi_found:
  SetErrorLevel 1638
  Abort
  no_msi:
 !endif
 !insertmacro CheckApplicationClosed "install_"
FunctionEnd

Function .onVerifyInstDir
 Call ValidateInstallDirectory
FunctionEnd

Function ValidateInstallDirectory
 StrCpy $LegacyUpgrade 0
 ${GetRoot} "$INSTDIR" $0
 StrCmp "$INSTDIR" "$0" invalid_directory
 StrCmp "$INSTDIR" "$0\" invalid_directory
 IfFileExists "$INSTDIR\Browserland.install.ini" existing_installation
 IfFileExists "$INSTDIR\Multi-Browser.install.ini" legacy_installation
 ; A fresh destination may be empty or contain retained user data only.
 FindFirst $0 $1 "$INSTDIR\*"
 directory_loop:
 StrCmp $1 "" directory_valid
 StrCmp $1 "." directory_next
 StrCmp $1 ".." directory_next
 StrCmp $1 "data" directory_next
 FindClose $0
 Goto invalid_directory
 directory_next:
 FindNext $0 $1
 Goto directory_loop
 directory_valid:
 FindClose $0
 Return
 existing_installation:
 ReadINIStr $0 "$INSTDIR\Browserland.install.ini" "Setup" "AppId"
 StrCmp $0 "${MB_APP_ID}" 0 invalid_directory
 IfFileExists "$INSTDIR\Multi-Browser.install.ini" legacy_installation
 Return
 legacy_installation:
 ReadINIStr $0 "$INSTDIR\Multi-Browser.install.ini" "Setup" "AppId"
 StrCmp $0 "${MB_LEGACY_APP_ID}" 0 invalid_directory
 StrCpy $LegacyUpgrade 1
 Return
 invalid_directory:
 Abort
FunctionEnd

Function SetShortcutIdentity
 ; $3 is the loaded IShellLink; return HRESULT in $5. The property store is
 ; edited in place, preserving all unrelated shortcut metadata.
 Push $0
 Push $1
 Push $2
 Push $4
 StrCpy $0 0
 ${IUnknown::QueryInterface} $3 '("${IID_IPropertyStore}",.r0).r5'
 ${If} $0 P<> 0
  System::Call '*${SYSSTRUCT_PROPERTYKEY}(${PKEY_AppUserModel_RelaunchIconResource})p.r1'
  System::Alloc ${SYSSIZEOF_PROPVARIANT}
  Pop $2
  ${If} $1 P<> 0
  ${AndIf} $2 P<> 0
   ; An existing relaunch icon can override the ordinary shortcut icon. Refresh
   ; it only when present, preserving relaunch commands and all other properties.
   ${IPropertyStore::GetValue} $0 '($1,$2).r5'
   ${If} $5 = 0
    ${V_GetVT} $2 r4
    !insertmacro PropVariantClear $2
    ${If} $4 = ${VT_LPWSTR}
     System::Call 'SHLWAPI::SHStrDupW(w "${MB_SHELL_ICON},0", *p.r4) i.r5'
     ${If} $5 = 0
      ${V_SetPointer} $2 ${VT_LPWSTR} r4
      ${IPropertyStore::SetValue} $0 '($1,$2).r5'
      !insertmacro PropVariantClear $2
     ${EndIf}
    ${EndIf}
   ${EndIf}
   ; Set AppID last so any taskbar refresh sees the new relaunch icon already.
   ${If} $5 = 0
    System::Call '*$1${SYSSTRUCT_PROPERTYKEY}(${PKEY_AppUserModel_ID})'
    System::Call 'SHLWAPI::SHStrDupW(w "${MB_APP_ID}", *p.r4) i.r5'
    ${If} $5 = 0
     ${V_SetPointer} $2 ${VT_LPWSTR} r4
     ${IPropertyStore::SetValue} $0 '($1,$2).r5'
     ${If} $5 = 0
      ${IPropertyStore::Commit} $0 '().r5'
     ${EndIf}
    ${EndIf}
   ${EndIf}
   ; PropVariantClear owns and frees the SHStrDupW string.
   !insertmacro PropVariantClear $2
  ${Else}
   StrCpy $5 -2147024882 ; E_OUTOFMEMORY
  ${EndIf}
  System::Free $2
  System::Free $1
  ${IUnknown::Release} $0 ""
 ${EndIf}
 Pop $4
 Pop $2
 Pop $1
 Pop $0
FunctionEnd

Function RefreshShortcut
 ; A full .lnk path is passed on the stack. Change only links to this install.
 Exch $2
 Push $3
 Push $4
 Push $5
 Push $6
 Push $7
 StrCpy $3 0
 StrCpy $4 0
 !insertmacro ComHlpr_CreateInProcInstance ${CLSID_ShellLink} ${IID_IShellLink} r3 ""
 ${If} $3 P<> 0
  ${IUnknown::QueryInterface} $3 '("${IID_IPersistFile}",.r4)'
  ${If} $4 P<> 0
   ${IPersistFile::Load} $4 '("$2",${STGM_READWRITE}).r5'
   ${If} $5 = 0
    StrCpy $6 ""
    ; SLGP_RAWPATH avoids resolving, launching or searching for missing targets.
    ${IShellLink::GetPath} $3 '(.r6,${NSIS_MAX_STRLEN},0,4).r5'
    ${If} $5 = 0
     StrCpy $7 0
     StrCmp $6 "$INSTDIR\Browserland.exe" shortcut_match
     StrCmp $6 "$INSTDIR\Multi-Browser.exe" 0 shortcut_release
     StrCpy $7 1
     shortcut_match:
     ${IShellLink::SetIconLocation} $3 '("${MB_SHELL_ICON}",0).r5'
     ${If} $5 = 0
      ${If} $7 = 1
       ${IShellLink::SetPath} $3 '("$INSTDIR\Browserland.exe").r5'
      ${EndIf}
      ${If} $5 = 0
       Call SetShortcutIdentity
      ${EndIf}
      ${If} $5 = 0
       ${IPersistFile::Save} $4 '("$2",1).r5'
       ${If} $5 = 0
        ; SHCNE_UPDATEITEM, SHCNF_PATHW | SHCNF_FLUSHNOWAIT.
        System::Call 'SHELL32::SHChangeNotify(i 0x2000, i 0x3005, w "$2", p 0)'
       ${EndIf}
      ${EndIf}
     ${EndIf}
    ${EndIf}
   ${EndIf}
   shortcut_release:
   ${IUnknown::Release} $4 ""
  ${EndIf}
  ${IUnknown::Release} $3 ""
 ${EndIf}
 Pop $7
 Pop $6
 Pop $5
 Pop $4
 Pop $3
 Pop $2
FunctionEnd

Function RefreshPinnedShortcuts
 ; Update existing links in place: preserve their names, arguments, working
 ; directories and taskbar positions. Never create, unpin or reorder pins.
 ; NSIS initializes OLE on its installer worker thread.
 Push $0
 Push $1
 FindFirst $0 $1 "$PinnedRoot\*.lnk"
 pinned_loop:
 StrCmp $1 "" pinned_finished
 Push "$PinnedRoot\$1"
 Call RefreshShortcut
 FindNext $0 $1
 Goto pinned_loop
 pinned_finished:
 FindClose $0
 ; Inaccessible or malformed user pins must not fail an application update.
 ClearErrors
 Pop $1
 Pop $0
FunctionEnd

Section "Browserland"
 ; Also validate silent installs; UI directory-page callbacks alone are insufficient.
 Call ValidateInstallDirectory
 SetShellVarContext current
 SetRegView 64
 SetOverwrite on
 !insertmacro MB_INSTALL_FILES
 SetOutPath "$INSTDIR"
 ClearErrors
 CopyFiles /SILENT "$INSTDIR\resources\app\ui\assets\app-icon.ico" "${MB_SHELL_ICON}"
 IfErrors legacy_cleanup_failed
 WriteINIStr "$INSTDIR\Browserland.install.ini" "Setup" "AppId" "${MB_APP_ID}"
 WriteINIStr "$INSTDIR\Browserland.install.ini" "Setup" "Version" "${MB_VERSION}"
 WriteUninstaller "$INSTDIR\Uninstall Browserland.exe"
 !ifndef MB_TEST
  StrCpy $DesktopRoot "$DESKTOP"
  StrCpy $MenuRoot "$SMPROGRAMS\Browserland"
  StrCpy $PinnedRoot "$APPDATA\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar"
 !else
  StrCpy $DesktopRoot "$INSTDIR\TestLinks\Desktop"
  StrCpy $MenuRoot "$INSTDIR\TestLinks\StartMenu"
  StrCpy $PinnedRoot "$INSTDIR\TestLinks\TaskBar"
 !endif
 CreateDirectory "$DesktopRoot"
 CreateDirectory "$MenuRoot"
 CreateShortcut "$DesktopRoot\Browserland.lnk" "$INSTDIR\Browserland.exe" "" "${MB_SHELL_ICON}" 0
 CreateShortcut "$MenuRoot\Browserland.lnk" "$INSTDIR\Browserland.exe" "" "${MB_SHELL_ICON}" 0
 WriteINIStr "$INSTDIR\Browserland.install.ini" "Setup" "DesktopRoot" "$DesktopRoot"
 WriteINIStr "$INSTDIR\Browserland.install.ini" "Setup" "MenuRoot" "$MenuRoot"
 WriteRegStr HKCU "${MB_SETUP_KEY}" "InstallLocation" "$INSTDIR"
 WriteRegStr HKCU "${MB_UNINSTALL_KEY}" "DisplayName" "Browserland"
 WriteRegStr HKCU "${MB_UNINSTALL_KEY}" "DisplayVersion" "${MB_VERSION}"
 WriteRegStr HKCU "${MB_UNINSTALL_KEY}" "Publisher" "Antonio Fradique"
 WriteRegStr HKCU "${MB_UNINSTALL_KEY}" "DisplayIcon" "${MB_SHELL_ICON}"
 WriteRegStr HKCU "${MB_UNINSTALL_KEY}" "InstallLocation" "$INSTDIR"
 WriteRegStr HKCU "${MB_UNINSTALL_KEY}" "UninstallString" '$\"$INSTDIR\Uninstall Browserland.exe$\"'
 WriteRegStr HKCU "${MB_UNINSTALL_KEY}" "QuietUninstallString" '$\"$INSTDIR\Uninstall Browserland.exe$\" /S'
 WriteRegStr HKCU "${MB_UNINSTALL_KEY}" "URLInfoAbout" "https://AntonioFradique.net"
 WriteRegDWORD HKCU "${MB_UNINSTALL_KEY}" "EstimatedSize" ${MB_SIZE_KB}
 WriteRegDWORD HKCU "${MB_UNINSTALL_KEY}" "NoModify" 1
 WriteRegDWORD HKCU "${MB_UNINSTALL_KEY}" "NoRepair" 1
 IfErrors legacy_cleanup_failed
 ${If} $LegacyUpgrade == 1
  ; The new payload and uninstall metadata are complete before retiring the old
  ; program names. Only these known application files are removed; data is kept.
  ClearErrors
  Delete "$INSTDIR\Multi-Browser.exe"
  Delete "$INSTDIR\Multi-Browser.cmd"
  Delete "$INSTDIR\Uninstall Multi-Browser.exe"
  IfErrors legacy_cleanup_failed
  !ifndef MB_TEST
   Delete "$DESKTOP\Multi-Browser.lnk"
   Delete "$SMPROGRAMS\Multi-Browser\Multi-Browser.lnk"
   RMDir "$SMPROGRAMS\Multi-Browser"
   ReadRegStr $0 HKCU "Software\AntonioFradique\Multi-Browser\Setup" "InstallLocation"
   ${If} $0 == $INSTDIR
    DeleteRegKey HKCU "Software\AntonioFradique\Multi-Browser\Setup"
   ${EndIf}
   ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AntonioFradique.Multi-Browser" "InstallLocation"
   ${If} $0 == $INSTDIR
    DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AntonioFradique.Multi-Browser"
   ${EndIf}
  !else
   Delete "$DesktopRoot\Multi-Browser.lnk"
   Delete "$MenuRoot\Multi-Browser.lnk"
  !endif
  Delete "$INSTDIR\Multi-Browser.install.ini"
 ${EndIf}
 Goto legacy_cleanup_complete
 legacy_cleanup_failed:
 IfSilent legacy_cleanup_abort
 MessageBox MB_OK|MB_ICONEXCLAMATION "$(LockedFiles)"
 legacy_cleanup_abort:
 SetErrorLevel 1
 Abort
 legacy_cleanup_complete:
 !ifndef MB_TEST
  ; Invalidate the shell cache first. Windows 11 also needs the per-link
  ; UPDATEITEM notifications sent after saving each refreshed shortcut below.
  System::Call 'SHELL32::SHChangeNotify(i 0x08000000, i 0x3000, p 0, p 0)'
 !endif
 Push "$DesktopRoot\Browserland.lnk"
 Call RefreshShortcut
 Push "$MenuRoot\Browserland.lnk"
 Call RefreshShortcut
 Call RefreshPinnedShortcuts
SectionEnd

Function un.onInit
 SetShellVarContext current
 SetRegView 64
 ReadINIStr $0 "$INSTDIR\Browserland.install.ini" "Setup" "AppId"
 StrCmp $0 "${MB_APP_ID}" marker_valid
 IfSilent marker_invalid
 MessageBox MB_OK|MB_ICONSTOP "$(WrongFolder)"
 marker_invalid:
 SetErrorLevel 1
 Abort
 marker_valid:
 !insertmacro CheckApplicationClosed "uninstall_"
FunctionEnd

Section "Uninstall"
 SetShellVarContext current
 SetRegView 64
 uninstall_files:
 ClearErrors
 !insertmacro MB_REMOVE_FILES
 IfErrors 0 uninstall_files_removed
 IfSilent uninstall_failed
 MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(LockedFiles)" IDRETRY uninstall_files
 uninstall_failed:
 SetErrorLevel 1
 Abort
 uninstall_files_removed:
 ReadINIStr $DesktopRoot "$INSTDIR\Browserland.install.ini" "Setup" "DesktopRoot"
 ReadINIStr $MenuRoot "$INSTDIR\Browserland.install.ini" "Setup" "MenuRoot"
 Delete "$DesktopRoot\Browserland.lnk"
 Delete "$MenuRoot\Browserland.lnk"
 Delete "${MB_SHELL_ICON}"
 RMDir "$MenuRoot"
 !ifdef MB_TEST
  RMDir "$DesktopRoot"
  RMDir "$INSTDIR\TestLinks"
 !endif
 DeleteRegKey HKCU "${MB_UNINSTALL_KEY}"
 DeleteRegKey HKCU "${MB_SETUP_KEY}"
 Delete "$INSTDIR\Browserland.install.ini"
 Delete "$INSTDIR\Uninstall Browserland.exe"
 !insertmacro MB_REMOVE_EMPTY_DIRECTORIES
 SetOutPath "$TEMP"
 ; No recursive directory removal: data and other user files are retained.
 RMDir "$INSTDIR"
SectionEnd

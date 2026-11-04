Unicode true
Target x86-unicode
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"
!include "x64.nsh"
!include "${MB_PAYLOAD_INCLUDE}"

!define MB_APP_ID "net.antoniofradique.browserland"
; The previous product is recognized only for an in-place, data-preserving update.
!define MB_LEGACY_APP_ID "net.antoniofradique.multibrowser"
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

Section "Browserland"
 ; Also validate silent installs; UI directory-page callbacks alone are insufficient.
 Call ValidateInstallDirectory
 SetShellVarContext current
 SetRegView 64
 SetOverwrite on
 !insertmacro MB_INSTALL_FILES
 SetOutPath "$INSTDIR"
 ClearErrors
 WriteINIStr "$INSTDIR\Browserland.install.ini" "Setup" "AppId" "${MB_APP_ID}"
 WriteINIStr "$INSTDIR\Browserland.install.ini" "Setup" "Version" "${MB_VERSION}"
 WriteUninstaller "$INSTDIR\Uninstall Browserland.exe"
 !ifndef MB_TEST
  StrCpy $DesktopRoot "$DESKTOP"
  StrCpy $MenuRoot "$SMPROGRAMS\Browserland"
 !else
  StrCpy $DesktopRoot "$INSTDIR\TestLinks\Desktop"
  StrCpy $MenuRoot "$INSTDIR\TestLinks\StartMenu"
 !endif
 CreateDirectory "$DesktopRoot"
 CreateDirectory "$MenuRoot"
 CreateShortcut "$DesktopRoot\Browserland.lnk" "$INSTDIR\Browserland.exe" "" "$INSTDIR\Browserland.exe" 0
 CreateShortcut "$MenuRoot\Browserland.lnk" "$INSTDIR\Browserland.exe" "" "$INSTDIR\Browserland.exe" 0
 WriteINIStr "$INSTDIR\Browserland.install.ini" "Setup" "DesktopRoot" "$DesktopRoot"
 WriteINIStr "$INSTDIR\Browserland.install.ini" "Setup" "MenuRoot" "$MenuRoot"
 WriteRegStr HKCU "${MB_SETUP_KEY}" "InstallLocation" "$INSTDIR"
 WriteRegStr HKCU "${MB_UNINSTALL_KEY}" "DisplayName" "Browserland"
 WriteRegStr HKCU "${MB_UNINSTALL_KEY}" "DisplayVersion" "${MB_VERSION}"
 WriteRegStr HKCU "${MB_UNINSTALL_KEY}" "Publisher" "Antonio Fradique"
 WriteRegStr HKCU "${MB_UNINSTALL_KEY}" "DisplayIcon" "$INSTDIR\Browserland.exe"
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

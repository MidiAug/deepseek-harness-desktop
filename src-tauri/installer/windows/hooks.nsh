; B50: install conflict guard + Chinese Start Menu alias (search "桌面版").
; B71: after "uninstall then install", only uninstall.exe often remains — drop it before empty check.
; English "DeepSeek Harness Desktop" comes from Tauri PRODUCTNAME shortcut.
; NOTE: never use IfFileExists "$INSTDIR\*.*" alone — empty dirs still match "." / "..".

!macro NSIS_HOOK_PREINSTALL
  IfFileExists "$INSTDIR\${MAINBINARYNAME}.exe" preinstall_ok 0

  ; 卸后常见残留：主程序已删，仅剩 uninstall.exe（「卸载后安装」竞态）
  IfFileExists "$INSTDIR\uninstall.exe" 0 preinstall_after_residual
  Delete "$INSTDIR\uninstall.exe"
  preinstall_after_residual:

  IfFileExists "$INSTDIR\*.*" 0 preinstall_ok
  ClearErrors
  FindFirst $R9 $R8 "$INSTDIR\*.*"
  IfErrors preinstall_ok
  preinstall_scan:
    StrCmp $R8 "." preinstall_next
    StrCmp $R8 ".." preinstall_next
    FindClose $R9
    MessageBox MB_OK|MB_ICONEXCLAMATION \
      "The install folder already exists and does not belong to DeepSeek Harness Desktop.$\n$\nChoose another location or remove the existing folder first." \
      /SD IDOK
    Abort
  preinstall_next:
    ClearErrors
    FindNext $R9 $R8
    IfErrors 0 preinstall_scan
    FindClose $R9
  preinstall_ok:
!macroend

!macro NSIS_HOOK_POSTINSTALL
  CreateDirectory "$SMPROGRAMS\DeepSeek Harness"
  ; Chinese alias for Start/Search — same target as PRODUCTNAME shortcut.
  CreateShortcut \
    "$SMPROGRAMS\DeepSeek Harness\DeepSeek Harness 桌面版.lnk" \
    "$INSTDIR\${MAINBINARYNAME}.exe" \
    "" \
    "$INSTDIR\${MAINBINARYNAME}.exe" \
    0
  !insertmacro SetLnkAppUserModelId "$SMPROGRAMS\DeepSeek Harness\DeepSeek Harness 桌面版.lnk"
  ; Ensure English PRODUCTNAME shortcut also has AUMID (Tauri usually sets it; idempotent).
  !insertmacro SetLnkAppUserModelId "$SMPROGRAMS\DeepSeek Harness\${PRODUCTNAME}.lnk"
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  Delete "$SMPROGRAMS\DeepSeek Harness\DeepSeek Harness 桌面版.lnk"
  ; Legacy B50 builds also created an English alias duplicate — clean up if present.
  Delete "$SMPROGRAMS\DeepSeek Harness\DeepSeek Harness Desktop.lnk"
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
!macroend

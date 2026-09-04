; Project implementation using documented Windows Shell COM APIs and the
; zlib-licensed NSIS System plug-in/Win headers. No additional native library.
; !cd gives the reviewed generated templates priority over builder's includes.
!cd "${__FILEDIR__}\..\..\.cache\nsis-templates"
!include LogicLib.nsh
!include FileFunc.nsh
!include Win\COM.nsh
!include Win\Propkey.nsh

; electron-builder uses this flag test for install/update modes. FileFunc is
; part of NSIS, so the offline installer does not need StdUtils.dll.
!macro PepperonTestParameter out name
  Push $R8
  Push $R9
  ${GetParameters} $R8
  ClearErrors
  ${GetOptions} "$R8" "--${name}" $R9
  StrCpy $R8 "true"
  IfErrors 0 +2
  StrCpy $R8 "false"
  Pop $R9
  Exch $R8
  Pop ${out}
!macroend
!undef StdUtils.TestParameter
!define StdUtils.TestParameter '!insertmacro PepperonTestParameter'

; Only the standalone acceptance probe defines this output file. Production
; installers have no probe file or diagnostic side effects.
!macro PepperonShellProbe operation
  !ifdef PEPPERON_SHELL_PROBE
    FileOpen $7 "${PEPPERON_SHELL_PROBE}" a
    FileSeek $7 0 END
    FileWrite $7 "${operation}:$8$\r$\n"
    FileClose $7
  !endif
!macroend

!macro PepperonSetShortcutAppId link appId
  System::Store S
  System::Call 'ole32::CoInitializeEx(p0, i2)i.r9'
  StrCpy $8 -1
  StrCpy $0 0
  !insertmacro ComHlpr_CreateInProcInstance ${CLSID_ShellLink} ${IID_IShellLink} r0 ""
  ${If} $0 P<> 0
    StrCpy $1 0
    ${IUnknown::QueryInterface} $0 '("${IID_IPersistFile}",.r1)'
    ${If} $1 P<> 0
      ${IPersistFile::Load} $1 '("${link}",2).r8'
      ${If} $8 >= 0
        StrCpy $2 0
        ${IUnknown::QueryInterface} $0 '("${IID_IPropertyStore}",.r2)'
        ${If} $2 P<> 0
          System::Call '*${SYSSTRUCT_PROPERTYKEY}(${PKEY_AppUserModel_ID})p.r3'
          ; IPropertyStore copies the string; these buffers are owned by System.
          System::Call '*(&w${NSIS_MAX_STRLEN} "${appId}")p.r5'
          System::Call '*${SYSSTRUCT_PROPVARIANT}(${VT_LPWSTR},,p r5)p.r4'
          ${IPropertyStore::SetValue} $2 '($3,$4).r8'
          ${If} $8 >= 0
            ${IPropertyStore::Commit} $2 '().r8'
            ${If} $8 >= 0
              ${IPersistFile::Save} $1 '("${link}",1).r8'
            ${EndIf}
          ${EndIf}
          System::Free $5
          System::Free $4
          System::Free $3
          ${IUnknown::Release} $2 ''
        ${EndIf}
      ${EndIf}
      ${IUnknown::Release} $1 ''
    ${EndIf}
    ${IUnknown::Release} $0 ''
  ${EndIf}
  ${If} $9 >= 0
    System::Call 'ole32::CoUninitialize()'
  ${EndIf}
  !insertmacro PepperonShellProbe "SetShortcutAppId"
  System::Store L
!macroend

; Remove only the application's destinations. Upgrades retain these through
; electron-builder's existing keep-shortcuts branch.
!macro PepperonClearDestinations appId
  System::Store S
  System::Call 'ole32::CoInitializeEx(p0, i2)i.r9'
  StrCpy $0 0
  ; CLSID_ApplicationDestinations / IID_IApplicationDestinations
  System::Call 'ole32::CoCreateInstance(g "{86C14003-4D6B-4EF3-A7B4-0506663B2E68}", p0, i1, g "{12337D35-94C6-48A0-BCE7-6A9C69D4D600}", *p.r0)i.r8'
  ${If} $0 P<> 0
    System::Call '$0->3(w "${appId}")i.r8'
    ${If} $8 >= 0
      System::Call '$0->5()i.r8'
    ${EndIf}
    ${IUnknown::Release} $0 ''
  ${EndIf}
  !insertmacro PepperonShellProbe "RemoveAllDestinations"
  StrCpy $0 0
  ; CLSID_DestinationList / IID_ICustomDestinationList
  System::Call 'ole32::CoCreateInstance(g "{77F10CF0-3DB5-4966-B520-B7C54FD35ED6}", p0, i1, g "{6332DEBF-87B5-4670-90C0-5E57B408A49E}", *p.r0)i.r8'
  ${If} $0 P<> 0
    System::Call '$0->10(w "${appId}")i.r8'
    ${IUnknown::Release} $0 ''
  ${EndIf}
  ${If} $9 >= 0
    System::Call 'ole32::CoUninitialize()'
  ${EndIf}
  !insertmacro PepperonShellProbe "DeleteList"
  System::Store L
!macroend

; The same documented IStartMenuPinnedList::RemoveFromList operation as before.
; Windows controls whether an item is pinned; this does not pin new items.
!macro PepperonUnpinShortcut link
  System::Store S
  System::Call 'ole32::CoInitializeEx(p0, i2)i.r9'
  StrCpy $0 0
  ; IID_IShellItem
  System::Call 'shell32::SHCreateItemFromParsingName(w "${link}", p0, g "{43826D1E-E718-42EE-BC55-A1E261C37BFE}", *p.r0)i.r8'
  ${If} $0 P<> 0
    StrCpy $1 0
    ; CLSID_StartMenuPin / IID_IStartMenuPinnedList
    System::Call 'ole32::CoCreateInstance(g "{A2A9545D-A0C2-42B4-9708-A0B2BADD77C8}", p0, i1, g "{4CD19ADA-25A5-4A32-B3B7-347BEE5BE36B}", *p.r1)i.r8'
    ${If} $1 P<> 0
      System::Call '$1->3(p r0)i.r8'
      ${IUnknown::Release} $1 ''
    ${EndIf}
    ${IUnknown::Release} $0 ''
  ${EndIf}
  ${If} $9 >= 0
    System::Call 'ole32::CoUninitialize()'
  ${EndIf}
  !insertmacro PepperonShellProbe "UnpinShortcut"
  System::Store L
!macroend

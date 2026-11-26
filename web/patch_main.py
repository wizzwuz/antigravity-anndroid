#!/usr/bin/env python3
"""
patch_main.py: Antigravity UI & Engine Webview Patch for Android (v2.35.2)

Patches Antigravity's bundle web/main.js for native Android operation:
  1. Offline conversation access without login screen redirection
  2. Eliminates false-positive "No internet. Agent features may not work." banner
  3. Multi-conversation task progress & completion notifications
  4. Silent task completion (zero sound on completion)
  5. Lexical punctuation cursor jumping fix on Android
  6. Backup and Restore screen (custom user tools + parent tools)
  7. Notification Settings screen
  8. Smart Marketplace V3 RPCs & Catalog
  9. Native Android Select-All & Delete in Lexical editor
 10. Conversation search jumping & deep linking (agy://conversation/<cid>)
 11. Application Tab & UI Theme / AuxPane integration
"""

import os
import re
import sys


def must_replace(content, old, new, label):
    if old not in content:
        raise RuntimeError(f"patch_main failed: '{label}' target not found")
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f"patch_main failed: '{label}' target matched {count} times (expected 1)")
    return content.replace(old, new, 1)


LOADER_INIT_V3 = (
    'typeof window!=="undefined"&&!window.__agMpSmartV3&&('
    'window.__agMpSmartV3=!0,'
    'window.__agLoadMarketplaceCatalog=()=>{'
    'if(window.__agMpCatalog)return Promise.resolve(window.__agMpCatalog);'
    'if(window.__agMpCatalogPromise)return window.__agMpCatalogPromise;'
    'window.__agMpCatalogPromise=(async()=>{'
    'var base={featured:[],search:{customizations:[],groups:[]},details:{}};'
    'try{'
    'var r=await fetch("/marketplace_catalog.json");'
    'if(r.ok){var j=await r.json();base=j||base}'
    '}catch(_){}'
    'try{'
    'if(window.Android&&window.Android.getMarketplaceCatalogJson){'
    'var raw=window.Android.getMarketplaceCatalogJson();'
    'if(raw){'
    'var nat=JSON.parse(raw);'
    'if(nat&&nat.customizations){'
    'var seen=new Set((base.search.customizations||[]).map(x=>x.id));'
    'for(var c of nat.customizations){'
    'if(!seen.has(c.id)){seen.add(c.id);base.search.customizations.push(c)}'
    '}'
    '}'
    '}'
    '}'
    '}catch(_e){}'
    'window.__agMpCatalog=base;'
    'return base;'
    '})();'
    'return window.__agMpCatalogPromise;'
    '})'
)

NEW_MP_BLOCK_V3 = (
    'searchMarketplace:async u=>{' + LOADER_INIT_V3 + ';'
    'var _SMR=Rja.file.messages.find(m=>m.name==="SearchMarketplaceResponse")||Rja.file.messages[514],'
    '_q=(u.query??"").trim().toLowerCase(),_gid=u.groupId??"",_pt=u.pageToken??"";'
    'var [_cat,_sr]=await Promise.all([window.__agLoadMarketplaceCatalog().catch(()=>null),_gid==="built-for-android"?Promise.resolve(null):f(v=>v.searchMarketplace(kc(Rja,{query:u.query??"",groupId:_gid,pageToken:_pt}))).catch(()=>null)]);'
    'try{var _allCat=(_cat&&_cat.search&&_cat.search.customizations)||[],_allGrps=(_cat&&_cat.search&&_cat.search.groups)||[],_hasLive=!!(_sr&&_sr.customizations&&_sr.customizations.length>0);'
    'if(_pt&&_hasLive){var _natRaw=_allCat.filter(x=>x._androidNative);if(_natRaw.length>0){var _natMsg=of(_SMR,{customizations:_natRaw,groups:[]},{ignoreUnknownFields:!0}),_nm=new Map((_natMsg.customizations||[]).map(x=>[x.id,x]));_sr.customizations=_sr.customizations.map(x=>_nm.get(x.id)||x)}return _sr}'
    'var _srcItems=_hasLive?_allCat.filter(x=>x._androidNative):_allCat,_srcGrps=_hasLive?_allGrps.filter(x=>x.id==="built-for-android"||x._androidNative):_allGrps;'
    'if(_gid){var _g=_allGrps.find(x=>x.id===_gid);_srcItems=_g?_srcItems.filter(x=>_g.memberIds&&_g.memberIds.includes(x.id)):[]}'
    'if(_q){_srcItems=_srcItems.filter(x=>(x.displayName||"").toLowerCase().includes(_q)||(x.id||"").toLowerCase().includes(_q)||(x.description||"").toLowerCase().includes(_q))}'
    'var _localMsg=of(_SMR,{customizations:_srcItems,groups:_q||_gid?[]:_srcGrps},{ignoreUnknownFields:!0});'
    'if(_hasLive){var _fullNatMsg=of(_SMR,{customizations:_allCat.filter(x=>x._androidNative),groups:[]},{ignoreUnknownFields:!0}),_natById=new Map((_fullNatMsg.customizations||[]).map(x=>[x.id,x])),_seen=new Set((_localMsg.customizations||[]).map(x=>x.id)),_merged=(_localMsg.customizations||[]).slice();'
    'for(var _it of _sr.customizations){var _rep=_natById.get(_it.id)||_it;if(!_seen.has(_rep.id)){_seen.add(_rep.id);_merged.push(_rep)}}'
    'var _gSeen=new Set((_localMsg.groups||[]).map(x=>x.id)),_mGrps=_q||_gid?[]:(_localMsg.groups||[]).slice();'
    'if(!_q&&!_gid&&_sr.groups){for(var _gp of _sr.groups){if(!_gSeen.has(_gp.id)){_gSeen.add(_gp.id);_mGrps.push(_gp)}}}'
    '_localMsg.customizations=_merged;_localMsg.groups=_mGrps;_localMsg.nextPageToken=_sr.nextPageToken||""}'
    'return _localMsg}catch(_e2){return _sr||of(_SMR,{customizations:[],groups:[]},{ignoreUnknownFields:!0})}},'
    'getMarketplaceCustomization:async u=>{' + LOADER_INIT_V3 + ';'
    'var _GCR=Uja.file.messages.find(m=>m.name==="GetMarketplaceCustomizationResponse")||Uja.file.messages[535],'
    '_cat=await window.__agLoadMarketplaceCatalog().catch(()=>null),_localItem=((_cat&&_cat.search&&_cat.search.customizations)||[]).find(x=>x.id===u.id),_localDet=(_cat&&_cat.details&&_cat.details[u.id])||(_localItem?{customization:_localItem}:null);'
    'if((_localItem&&_localItem._androidNative)||(_localDet&&_localDet.customization&&_localDet.customization._androidNative)){return of(_GCR,_localDet,{ignoreUnknownFields:!0})}'
    'try{var _gr=await f(v=>v.getMarketplaceCustomization(kc(Uja,{id:u.id,includePreview:u.includePreview??!1})));if(_gr&&_gr.customization)return _gr}catch(_e){}'
    'return of(_GCR,_localDet||{},{ignoreUnknownFields:!0})},'
    'getMarketplaceBundles:async u=>{var _GBR=Qja.file.messages.find(m=>m.name==="GetMarketplaceBundlesResponse")||Qja.file.messages[512];try{return await f(v=>v.getMarketplaceBundles(kc(Qja,{ids:u.ids??[]})))}catch(_e){return of(_GBR,{bundles:[],customizations:[]},{ignoreUnknownFields:!0})}},'
    'getMarketplaceFeatured:async()=>{' + LOADER_INIT_V3 + ';'
    'var _GFR=Sja.file.messages.find(m=>m.name==="GetMarketplaceFeaturedResponse")||Sja.file.messages[526];'
    'try{var _fr=await f(u=>u.getMarketplaceFeatured(kc(Sja,{})));if(_fr&&_fr.featured&&_fr.featured.length>0)return _fr}catch(_e){}'
    'try{var _cat=await window.__agLoadMarketplaceCatalog();return of(_GFR,{featured:((_cat&&_cat.featured)||[]).filter(x=>x.id!=="android-featured-hero"),customizations:(_cat&&_cat.search&&_cat.search.customizations)||[]},{ignoreUnknownFields:!0})}catch(_e2){return of(_GFR,{featured:[],customizations:[]},{ignoreUnknownFields:!0})}},'
    'getOnboardingPersonas:async()=>f(u=>u.getOnboardingPersonas(kc(Tja,{}))),'
    'installCustomization:async u=>{' + LOADER_INIT_V3 + ';'
    'var _ICR=Vja.file.messages.find(m=>m.name==="InstallCustomizationResponse")||Vja.file.messages[538],'
    '_cat=await window.__agLoadMarketplaceCatalog().catch(()=>null),_c=((_cat&&_cat.search&&_cat.search.customizations)||[]).find(x=>x.id===u.id),_pname=(u.id||"").split("/").pop(),_url=(_c&&_c.source&&_c.source.archive&&_c.source.archive.url)||"",_mp=(_c&&_c.marketplace)||"antigravity-plugins-official",_ver=(_c&&_c.version)||"1.0.0",_isNat=!!(_c&&_c._androidNative)||["agy-video-studio","craft-anything","chrome-devtools-plugin","android-cli-plugin","science","github"].includes(_pname);'
    'if(_isNat&&window.Android&&window.Android.installMarketplacePlugin){try{var _njr=JSON.parse(window.Android.installMarketplacePlugin(_pname,_url,u.id,_mp,_ver));await new Promise(r=>setTimeout(r,350));return of(_ICR,_njr,{ignoreUnknownFields:!0})}catch(_ne){}}'
    'try{var _ir=await f(v=>v.installCustomization(kc(Vja,{id:u.id,bundleId:u.bundleId})));if(_ir&&_ir.success){try{window.Android&&window.Android.postProcessInstalledPlugin&&window.Android.postProcessInstalledPlugin(_pname)}catch(_pe){}return _ir}}catch(_e){}'
    'try{if(window.Android&&window.Android.installMarketplacePlugin){var _jr=JSON.parse(window.Android.installMarketplacePlugin(_pname,_url,u.id,_mp,_ver));await new Promise(r=>setTimeout(r,350));return of(_ICR,_jr,{ignoreUnknownFields:!0})}}catch(_e2){return of(_ICR,{success:!1,message:String(_e2)},{ignoreUnknownFields:!0})}'
    'return of(_ICR,{success:!1,message:"Marketplace install unavailable"},{ignoreUnknownFields:!0})},'
)


def patch_offline_access(content):
    """Fix 1: Allow accessing conversations without internet; do not force redirect to login/onboarding screen."""
    if "/*__agyOfflineAccessBypass*/" in content:
        return content

    # 1. In manager routing component: do not treat unauthenticated as fatal when offline
    old_m_check = 'm=p&&n&&(m==="signedOut"||m==="loginError"||m==="projectPicker"||m==="licensePicker");'
    new_m_check = (
        '/*__agyOfflineAccessBypass*/'
        'var _isOffline=(typeof window!=="undefined"&&window.Android&&window.Android.isNetworkConnected&&!window.Android.isNetworkConnected())||(typeof navigator!=="undefined"&&!navigator.onLine);'
        'm=!_isOffline&&p&&n&&(m==="signedOut"||m==="loginError"||m==="projectPicker"||m==="licensePicker");'
    )
    content = must_replace(content, old_m_check, new_m_check, "offline_bypass_manager_login_redirect")

    # 2. In manager-landing-layout: do not throw to /onboarding when offline
    old_before_load = 'beforeLoad:({context:c})=>{var d=c.onboardingState;c.hasOnboardingScreens&&d!==2&&(oed(),ied(),UQ({to:"/onboarding",search:iyb,replace:!0,throw:!0}))}'
    new_before_load = (
        'beforeLoad:({context:c})=>{var d=c.onboardingState;'
        'var _isOff=(typeof window!=="undefined"&&window.Android&&window.Android.isNetworkConnected&&!window.Android.isNetworkConnected())||(typeof navigator!=="undefined"&&!navigator.onLine);'
        '!_isOff&&c.hasOnboardingScreens&&d!==2&&(oed(),ied(),UQ({to:"/onboarding",search:iyb,replace:!0,throw:!0}))}'
    )
    content = must_replace(content, old_before_load, new_before_load, "offline_bypass_landing_layout_onboarding")

    # 3. In onDidRequestLoginFlow: bypass login redirection when offline
    old_login_req = 'var I=g?.onDidRequestLoginFlow?.(()=>{if(!mL(F.current)&&n){k(!0);let J=D.current;l({to:"/onboarding",replace:!0,search:L=>jyb(J,L.project)})}});'
    new_login_req = (
        'var I=g?.onDidRequestLoginFlow?.(()=>{'
        'var _isOff=(typeof window!=="undefined"&&window.Android&&window.Android.isNetworkConnected&&!window.Android.isNetworkConnected())||(typeof navigator!=="undefined"&&!navigator.onLine);'
        'if(!_isOff&&!mL(F.current)&&n){k(!0);let J=D.current;l({to:"/onboarding",replace:!0,search:L=>jyb(J,L.project)})}'
        '});'
    )
    content = must_replace(content, old_login_req, new_login_req, "offline_bypass_onDidRequestLoginFlow")

    return content


def patch_online_banner_fix(content):
    """Fix 2: Eliminates false-positive 'No internet. Agent features may not work.' banner."""
    if "/*__agyOnlineBannerFix*/" in content:
        return content

    # 1. Update $ac hook to consult window.Android.isNetworkConnected()
    old_ac = 'var $ac=()=>{var [a,b]=(0,E.useState)(!0);(0,E.useEffect)(()=>{var c=()=>{b(()=>navigator.onLine)};c();window.addEventListener("online",c);window.addEventListener("offline",c);return()=>{window.removeEventListener("online",c);window.removeEventListener("offline",c)}},[void 0,void 0]);return{isOnline:a}};'
    new_ac = (
        '/*__agyOnlineBannerFix*/'
        'var $ac=()=>{var [a,b]=(0,E.useState)(!0);(0,E.useEffect)(()=>{var c=()=>{'
        'var _on=navigator.onLine;'
        'try{if(window.Android&&typeof window.Android.isNetworkConnected==="function"){_on=window.Android.isNetworkConnected()}}catch(_e){}'
        '_on||(navigator&&navigator.onLine&&(_on=!0));'
        'b(()=>_on)'
        '};c();var _it=setInterval(c,5000);window.addEventListener("online",c);window.addEventListener("offline",c);return()=>{clearInterval(_it);window.removeEventListener("online",c);window.removeEventListener("offline",c)}},[void 0,void 0]);return{isOnline:a}};'
    )
    content = must_replace(content, old_ac, new_ac, "ac_is_online_check_native")

    # 2. Update zxd banner component to re-verify connectivity before rendering warning
    old_zxd = 'var zxd=({isOnline:a})=>a?null:E.createElement("div",{className:"w-full bg-muted px-3 flex-1 flex items-center gap-2"},E.createElement(rx,{name:"warning",className:"h-4 w-4 shrink-0 text-yellow-500"}),E.createElement("span",{className:"text-foreground"},"No internet. Agent features may not work."));'
    new_zxd = (
        'var zxd=({isOnline:a})=>{'
        'var _realOnline=a;'
        'try{if(!_realOnline&&typeof window!=="undefined"&&window.Android&&typeof window.Android.isNetworkConnected==="function"){_realOnline=window.Android.isNetworkConnected()}}catch(_e){}'
        'return _realOnline?null:E.createElement("div",{className:"w-full bg-muted px-3 flex-1 flex items-center gap-2"},E.createElement(rx,{name:"warning",className:"h-4 w-4 shrink-0 text-yellow-500"}),E.createElement("span",{className:"text-foreground"},"No internet. Agent features may not work."))};'
    )
    content = must_replace(content, old_zxd, new_zxd, "zxd_banner_native_check")

    return content


def patch_task_notifications(content):
    """Fix 3 & Fix 4: Multi-conversation task notifications & mute task completion sound."""
    if "__agyTaskProgressAlertsInjected_v2" in content:
        return content

    pattern = r"function G7a\(\)\{.*?\};(?=var H7a=)"
    if not re.search(pattern, content, re.DOTALL):
        raise RuntimeError("could not find G7a block in main.js")

    new_g7a = """function G7a(){/*__agyTaskProgressAlertsInjected_v2*/
var a=new Set,b=new Set,c,d="Antigravity",f={},g,h,k=()=>{},
_activeTasks=new Set,
l=(...p)=>{if(h===void 0)return!1;var q=new Set;p=p.filter(u=>!!u);for(var r=p.pop();r!==void 0;r=p.pop()){if(q.has(r)||q.size>=16)continue;q.add(r);if(h(r))return!0;(r=(r=k(r))&&Pl(r))&&p.push(r)}return!1},
m=p=>{
var q=new Map,r=[];
for(let [u,v]of p)p=v,q.set(p,u),r.push(p);
C7a(a,r,u=>{
var v=u.summary.workspaces?.[0]?.workspaceFolderAbsoluteUri,
w=u.step.step?.metadata?.sourceTrajectoryStepInfo?.cascadeId||q.get(u.summary)||u.summary.trajectoryId;
a:{
var x=u.step,y=x.step;
if(y){
var z=Nf(y).step;
if(z.case){
switch(z.case){
case "runCommand":y=z.value;z="Requesting your permission in Terminal:";y=`Command: ${y.commandLine}`;break;
case "openBrowserUrl":y=z.value;z="Requesting your permission to open URL:";y=`URL: ${y.url}`;break;
case "askQuestion":y=z.value;let A=y.questions?.length??0;z=A>1?"The agent has questions for you:":"The agent has a question for you:";y=y.questions?.[0]?.question||(A>1?"Click to respond to the questions.":"Click to respond to the question.");break;
default:z=y.requestedInteraction?.interaction,(y=z?.case==="permission"?z.value.resource?.target:void 0)?z="Requesting your permission:":(z="Action requires your attention",y="The agent is waiting for your input.")
}
v={id:x.stepIndex.toString()+w,title:z,body:y,payload:{cascadeId:w,workspaceUri:v,type:"request_action"}};
break a
}
}
v=void 0
}
x=Pl(u.summary)??void 0;
if(v&&!l(w,q.get(u.summary),x)){
try{
if(typeof window!=="undefined"&&window.Android&&typeof window.Android.postNotification==="function"){
window.Android.postNotification("task_alerts_completion",z||"Antigravity Task Alert",y||"Action requires your attention",w,!1,-1);
}
}catch(_){}
f.actionRequired&&g?.({soundFile:f.actionRequired});
c?.(v);
}
})
},
n=p=>{
for(let [q,r]of p){
p=q;
let u=r;
_activeTasks.delete(p);
try{
if(typeof window!=="undefined"&&window.Android&&typeof window.Android.cancelNotification==="function"){
window.Android.cancelNotification("cascade_prog_"+p,0);
}
}catch(_){}
if(u.latestExecutorTerminationReason===K.ExecutorTerminationReason.USER_CANCELED)continue;
if(l(p,Pl(u)??void 0))continue;
let v=u.annotations?.coordinator?WD(u):u.summary;
try{
if(typeof window!=="undefined"&&window.Android&&typeof window.Android.postNotification==="function"){
var _cTitle="Antigravity Task Completion",_cBody=v?`Agent finished: ${v}`:("Task completed in "+(u.title||"conversation"));
window.Android.postNotification("task_alerts_completion",_cTitle,_cBody,p,!1,-1);
}
}catch(_){}
c?.({id:`agent-finished-${p}-${u.stepCount??0}`,title:d,body:v?`Agent finished: ${v}`:"Agent finished",payload:{cascadeId:p,type:"request_action",workspaceUri:void 0}});
}
};
return p=>{
k=q=>lm(p.getState())[q];
return q=>r=>{
if(E7a.match(r)){
var u=r.payload,v=u.appName;
let w=u.soundFiles,x=u.playSound,y=u.isConversationInView;
if(w){w.cascadeDone="";}
c=u.sendNotification;
d=F7a(v);
f=w;
g=x;
h=y;
u=Object.entries(lm(p.getState()));
D7a(b,u.filter(([,z])=>!$l(z)),[]);
m(u.filter(([,z])=>!$l(z)||Pl(z)!==null));
return q(r)
}
if(im.match(r)){
u=q(r);
if(c){
v=r.payload;
let deletes=v.deletes,updates=v.updates.filter(([,w])=>dm(w.source));
try{
if(typeof window!=="undefined"&&window.Android){
for(let [rCid,rSumm] of updates){
var isRunning = rSumm && !rSumm.killed && !!rSumm.notFullyIdle && rSumm.status!==K.CascadeRunStatus.IDLE && rSumm.status!==1 && (rSumm.status===K.CascadeRunStatus.RUNNING || rSumm.status===K.CascadeRunStatus.BUSY || rSumm.status===2 || rSumm.status===4);
if(isRunning){
if(!_activeTasks.has(rCid)){
_activeTasks.add(rCid);
window.Android.postNotification("task_progress","Antigravity Task Progress","Running task in "+(rSumm.title||"conversation"),rCid,!0,-1);
}
}else{
_activeTasks.delete(rCid);
try{window.Android&&window.Android.cancelNotification&&window.Android.cancelNotification("cascade_prog_"+rCid,0);}catch(_){}
}
}
for(let delCid of (deletes||[])){
_activeTasks.delete(delCid);
try{window.Android&&window.Android.cancelNotification&&window.Android.cancelNotification("cascade_prog_"+delCid,0);}catch(_){}
}
}
}catch(_){}
n(D7a(b,updates.filter(([,w])=>!$l(w)),deletes));
m(updates.filter(([,w])=>!$l(w)||Pl(w)!==null));
}
return u
}
return q(r)
}
}
};"""
    content = re.sub(pattern, new_g7a, content, count=1, flags=re.DOTALL)

    # Wrap clearNotifications
    old_clear = "async clearNotifications(a){this.extensionApi?"
    new_clear = (
        'async clearNotifications(a){'
        'try{if(typeof window!=="undefined"&&window.Android&&typeof window.Android.cancelNotification==="function"){'
        'window.Android.cancelNotification("cascade_prog_"+a,0);'
        'window.Android.cancelNotification("cascade_done_"+a,0);'
        '}}catch(_){}'
        'this.extensionApi?'
    )
    content = must_replace(content, old_clear, new_clear, "clear_notifications_native_wrap")

    # Mute cascadeDone audio sound file in app setup
    old_sound = 'soundFiles:{cascadeDone:"/antigravityCascadeDone.mp3",actionRequired:"/antigravityActionRequired.mp3",voicePreviews:"/voices"}'
    new_sound = 'soundFiles:{cascadeDone:"",actionRequired:"/antigravityActionRequired.mp3",voicePreviews:"/voices"}'
    content = must_replace(content, old_sound, new_sound, "mute_cascadeDone_sound_file")

    return content


def patch_lexical_punctuation_cursor_fix(content):
    """Fix 5: Lexical cursor jumping before punctuation mark on Android."""
    if "/*__agyPunctuationCursorFixed*/" in content:
        return content

    # 1. Disable postDeleteSelectionToRestore rollback on selection change
    old_rollback = (
        'var m=Ct();if(k.postDeleteSelectionToRestore&&Wt(m)&&m.isCollapsed()){var n=m.anchor,p=k.postDeleteSelectionToRestore.anchor;'
        'if(n.key===p.key&&n.offset===p.offset+1||n.offset===1&&Jt(p).is(Jt(n).getPreviousSibling()))m=k.postDeleteSelectionToRestore.clone(),Dt(m)}k.postDeleteSelectionToRestore=null;if(Wt(m)){'
    )
    new_rollback = (
        '/*__agyPunctuationCursorFixed*/'
        'var m=Ct();k.postDeleteSelectionToRestore=null;if(Wt(m)){'
    )
    content = must_replace(content, old_rollback, new_rollback, "lexical_disable_punctuation_cursor_rollback")

    # 2. Never store postDeleteSelectionToRestore after Android backward delete
    old_store = '(vt(d,\ncs,!0),g=Ct(),Sr&&Wt(g)&&g.isCollapsed()&&(f.postDeleteSelectionToRestore=g,setTimeout(()=>f.postDeleteSelectionToRestore=null)))'
    new_store = '(vt(d,\ncs,!0),g=Ct(),Sr&&Wt(g)&&g.isCollapsed()&&(f.postDeleteSelectionToRestore=null))'
    content = must_replace(content, old_store, new_store, "lexical_disable_postDeleteSelectionToRestore_save")

    return content


def patch_backup_restore(content):
    """Custom user Backup & Restore screen alongside parent repo backup tools."""
    if "BackupRestoreScreen" in content:
        return content

    # 1. Update dPb Map to include "Backup and Restore"
    content = must_replace(
        content,
        '["Provide Feedback","Give Feedback"]',
        '["Provide Feedback","Give Feedback"],["Backup and Restore","Backup and Restore"]',
        "dPb_backup_restore_label"
    )

    # 2. Add to mobile settings screen list in A0b
    content = must_replace(
        content,
        'b=[...c.filter(p=>p!=="Account"),...d,...(b?["Provide Feedback"]:[])];',
        'b=[...c.filter(p=>p!=="Account"),...d,...(b?["Provide Feedback"]:[]),"Backup and Restore"];',
        "A0b_mobile_settings_list"
    )

    # 3. Add to screen resolver
    content = must_replace(
        content,
        'case "Provide Feedback":return E.createElement(cVb,null);',
        'case "Provide Feedback":return E.createElement(cVb,null);case "Backup and Restore":return E.createElement(BackupRestoreScreen,null);',
        "screen_resolver_backup_restore"
    )

    # 4. Add to desktop settings sidebar
    content = must_replace(
        content,
        'onClick:()=>{M(BE("Provide Feedback"))},isActive:N&&c==="Provide Feedback"',
        'onClick:()=>{M(BE("Provide Feedback"))},isActive:N&&c==="Provide Feedback"}),E.createElement(TX,{text:"Backup and Restore",label:ZU("Backup and Restore"),onClick:()=>{M(BE("Backup and Restore"))},isActive:N&&c==="Backup and Restore"',
        "desktop_settings_sidebar_backup_restore"
    )

    # 5. Add to desktop settings screen view container
    content = must_replace(
        content,
        'h&&E.createElement("div",{style:{display:b==="Provide Feedback"?"block":"none"}},E.createElement(cVb,null))',
        'h&&E.createElement("div",{style:{display:b==="Provide Feedback"?"block":"none"}},E.createElement(cVb,null)),E.createElement("div",{style:{display:b==="Backup and Restore"?"block":"none"}},E.createElement(BackupRestoreScreen,null))',
        "desktop_view_container_backup_restore"
    )

    # 6. Inject BackupRestoreScreen component before cVb
    backup_restore_comp = '''var BackupRestoreScreen=()=>{
var [status,setStatus]=(0,E.useState)(null);
var [isProcessing,setIsProcessing]=(0,E.useState)(!1);
var [projects,setProjects]=(0,E.useState)([]);
var [selectedProject,setSelectedProject]=(0,E.useState)("all");
var [skills,setSkills]=(0,E.useState)([]);
var [selectedSkill,setSelectedSkill]=(0,E.useState)("all");
var [conversations,setConversations]=(0,E.useState)([]);
var [showRestartPrompt,setShowRestartPrompt]=(0,E.useState)(!1);
var [restartMessage,setRestartMessage]=(0,E.useState)("");
(0,E.useEffect)(()=>{
try{
if(typeof window!=="undefined"&&window.Android&&typeof window.Android.listProjects==="function"){
var pList=JSON.parse(window.Android.listProjects()||"[]");
if(Array.isArray(pList))setProjects(pList);
}
}catch(_){}
try{
if(typeof window!=="undefined"&&window.Android&&typeof window.Android.listSkills==="function"){
var sList=JSON.parse(window.Android.listSkills()||"[]");
if(Array.isArray(sList))setSkills(sList);
}
}catch(_){}
try{
if(typeof window!=="undefined"&&window.Android&&typeof window.Android.listConversations==="function"){
var cList=JSON.parse(window.Android.listConversations()||"[]");
if(Array.isArray(cList))setConversations(cList);
}
}catch(_){}
if(typeof window!=="undefined"){
window.__onBackupRestoreStatus=function(res){
setIsProcessing(!1);
if(typeof res==="string"){try{res=JSON.parse(res)}catch(_){res={message:res}}}
setStatus(res);
if(res&&res.success&&(res.type==="restore_conversation"||res.type==="restore_projects"||res.type==="restore_skills")){
setRestartMessage(res.type==="restore_conversation"?"Conversations restored successfully. Would you like to restart the app now to reload all conversations?":res.type==="restore_skills"?"Skills restored successfully. Would you like to restart the app now to reload custom skills?":"Projects restored successfully. Would you like to restart the app now to reload your workspace?");
setShowRestartPrompt(!0);
}
};
return function(){
if(typeof window!=="undefined")window.__onBackupRestoreStatus=null;
};
}
},[]);
var onBackupConvos=()=>{
setIsProcessing(!0);
setStatus({type:"info",message:"Opening file picker to choose backup location..."});
try{
if(window.Android&&typeof window.Android.backupConversations==="function")window.Android.backupConversations();
else{setIsProcessing(!1);setStatus({type:"error",message:"Android native bridge unavailable."})}
}catch(err){setIsProcessing(!1);setStatus({type:"error",message:err.message||String(err)})}
};
var onRestoreConvos=()=>{
setIsProcessing(!0);
setStatus({type:"info",message:"Opening file picker to select conversations backup archive..."});
try{
if(window.Android&&typeof window.Android.restoreConversations==="function")window.Android.restoreConversations();
else{setIsProcessing(!1);setStatus({type:"error",message:"Android native bridge unavailable."})}
}catch(err){setIsProcessing(!1);setStatus({type:"error",message:err.message||String(err)})}
};
var onBackupProj=()=>{
setIsProcessing(!0);
setStatus({type:"info",message:"Opening file picker to choose backup location..."});
try{
if(window.Android&&typeof window.Android.backupProjects==="function")window.Android.backupProjects(selectedProject==="all"?"":selectedProject);
else{setIsProcessing(!1);setStatus({type:"error",message:"Android native bridge unavailable."})}
}catch(err){setIsProcessing(!1);setStatus({type:"error",message:err.message||String(err)})}
};
var onRestoreProj=()=>{
setIsProcessing(!0);
setStatus({type:"info",message:"Opening file picker to select projects backup archive..."});
try{
if(window.Android&&typeof window.Android.restoreProjects==="function")window.Android.restoreProjects(selectedProject==="all"?"":selectedProject);
else{setIsProcessing(!1);setStatus({type:"error",message:"Android native bridge unavailable."})}
}catch(err){setIsProcessing(!1);setStatus({type:"error",message:err.message||String(err)})}
};
var onBackupSkills=()=>{
setIsProcessing(!0);
setStatus({type:"info",message:"Opening file picker to choose backup location..."});
try{
if(window.Android&&typeof window.Android.backupSkills==="function")window.Android.backupSkills(selectedSkill==="all"?"":selectedSkill);
else{setIsProcessing(!1);setStatus({type:"error",message:"Android native bridge unavailable."})}
}catch(err){setIsProcessing(!1);setStatus({type:"error",message:err.message||String(err)})}
};
var onRestoreSkills=()=>{
setIsProcessing(!0);
setStatus({type:"info",message:"Opening file picker to select skills backup archive..."});
try{
if(window.Android&&typeof window.Android.restoreSkills==="function")window.Android.restoreSkills(selectedSkill==="all"?"":selectedSkill);
else{setIsProcessing(!1);setStatus({type:"error",message:"Android native bridge unavailable."})}
}catch(err){setIsProcessing(!1);setStatus({type:"error",message:err.message||String(err)})}
};
var onRestartApp=()=>{
try{
if(window.Android&&typeof window.Android.restartApp==="function")window.Android.restartApp();
else window.location.reload();
}catch(_){window.location.reload()}
};

return E.createElement("div",{className:"space-y-6 max-w-2xl pb-10"},
E.createElement("div",{className:"space-y-1.5"},
E.createElement("h2",{className:"text-xl font-bold tracking-tight text-foreground m-0"},"Test Backup and Restore"),
E.createElement("p",{className:"text-sm text-muted-foreground m-0"},"Fast native backup and restore for conversations, projects, and skills.")),
showRestartPrompt&&E.createElement("div",{className:"p-4 rounded-xl border border-primary/30 bg-primary/10 text-primary space-y-3"},
E.createElement("div",{className:"font-medium text-sm leading-relaxed"},restartMessage),
E.createElement("div",{className:"flex gap-2"},
E.createElement("button",{type:"button",onClick:onRestartApp,className:"px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground border-none cursor-pointer hover:opacity-90 transition-opacity"},"Restart App Now"),
E.createElement("button",{type:"button",onClick:()=>setShowRestartPrompt(!1),className:"px-3 py-1.5 rounded-lg text-xs font-medium bg-background text-foreground border border-border cursor-pointer hover:bg-muted transition-colors"},"Later"))),
status&&E.createElement("div",{className:"p-3.5 rounded-xl text-sm flex items-start justify-between gap-2.5 transition-all "+(status.type==="error"?"border border-destructive/40 bg-destructive/10 text-destructive":(status.type==="success"||status.success)?"border border-green-500/40 bg-green-500/10 text-green-500":"border border-border bg-sidebar-muted/40 text-muted-foreground")},
E.createElement("div",{className:"flex-1 leading-snug"},status.message||JSON.stringify(status)),
E.createElement("button",{type:"button",onClick:()=>setStatus(null),className:"text-xs opacity-60 hover:opacity-100 p-1 border-none bg-transparent cursor-pointer text-inherit"},"✕")),
E.createElement("div",{className:"rounded-2xl border border-border bg-sidebar-muted/20 p-4 space-y-3.5 shadow-xs"},
E.createElement("div",{className:"flex items-center gap-3"},
E.createElement("div",{className:"p-2.5 rounded-xl bg-primary/10 text-primary flex items-center justify-center"},
E.createElement(rx,{name:"forum",size:22})),
E.createElement("div",null,
E.createElement("h3",{className:"font-semibold text-base text-foreground m-0"},"Conversations & Trajectories"),
E.createElement("p",{className:"text-xs text-muted-foreground mt-0.5 mb-0 leading-relaxed"},
"Fast, compressed archive of conversation history, transcripts, and brain artifacts (.zip). Space-saving and complete."))),
E.createElement("div",{className:"flex flex-wrap gap-2.5 pt-1"},
E.createElement("button",{type:"button",disabled:isProcessing,onClick:onBackupConvos,className:"px-3.5 py-2 rounded-xl text-xs font-semibold bg-primary text-primary-foreground border-none cursor-pointer flex items-center gap-1.5 shadow-xs hover:opacity-90 disabled:opacity-50"},
E.createElement(rx,{name:"upload",size:16}),"Backup Conversations"),
E.createElement("button",{type:"button",disabled:isProcessing,onClick:onRestoreConvos,className:"px-3.5 py-2 rounded-xl text-xs font-semibold bg-secondary text-secondary-foreground border border-border cursor-pointer flex items-center gap-1.5 hover:bg-muted disabled:opacity-50"},
E.createElement(rx,{name:"download",size:16}),"Restore Conversations"))),
E.createElement("div",{className:"rounded-2xl border border-border bg-sidebar-muted/20 p-4 space-y-3.5 shadow-xs"},
E.createElement("div",{className:"flex items-center gap-3"},
E.createElement("div",{className:"p-2.5 rounded-xl bg-primary/10 text-primary flex items-center justify-center"},
E.createElement(rx,{name:"folder_zip",size:22})),
E.createElement("div",null,
E.createElement("h3",{className:"font-semibold text-base text-foreground m-0"},"Project Files"),
E.createElement("p",{className:"text-xs text-muted-foreground mt-0.5 mb-0 leading-relaxed"},
"Backup and restore workspace projects as standard ZIP archives."))),
E.createElement("div",{className:"space-y-1.5 pt-1"},
E.createElement("label",{className:"block text-xs font-medium text-muted-foreground"},"Target Project Scope:"),
E.createElement("select",{value:selectedProject,onChange:e=>setSelectedProject(e.target.value),className:"w-full p-2.5 rounded-xl bg-background border border-border text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"},
E.createElement("option",{value:"all"},"All Scratch Projects (Complete Workspace)"),
projects.map(p=>E.createElement("option",{key:p,value:p},"Project: "+p)))),
E.createElement("div",{className:"flex flex-wrap gap-2.5 pt-1"},
E.createElement("button",{type:"button",disabled:isProcessing,onClick:onBackupProj,className:"px-3.5 py-2 rounded-xl text-xs font-semibold bg-primary text-primary-foreground border-none cursor-pointer flex items-center gap-1.5 shadow-xs hover:opacity-90 disabled:opacity-50"},
E.createElement(rx,{name:"upload",size:16}),"Backup Projects (.zip)"),
E.createElement("button",{type:"button",disabled:isProcessing,onClick:onRestoreProj,className:"px-3.5 py-2 rounded-xl text-xs font-semibold bg-secondary text-secondary-foreground border border-border cursor-pointer flex items-center gap-1.5 hover:bg-muted disabled:opacity-50"},
E.createElement(rx,{name:"download",size:16}),"Restore Projects (.zip)"))),
E.createElement("div",{className:"rounded-2xl border border-border bg-sidebar-muted/20 p-4 space-y-3.5 shadow-xs"},
E.createElement("div",{className:"flex items-center gap-3"},
E.createElement("div",{className:"p-2.5 rounded-xl bg-primary/10 text-primary flex items-center justify-center"},
E.createElement(rx,{name:"psychology",size:22})),
E.createElement("div",null,
E.createElement("h3",{className:"font-semibold text-base text-foreground m-0"},"Skills & Runbooks"),
E.createElement("p",{className:"text-xs text-muted-foreground mt-0.5 mb-0 leading-relaxed"},
"Backup and restore custom agent skills, tools, and procedural runbooks as standard ZIP archives."))),
E.createElement("div",{className:"space-y-1.5 pt-1"},
E.createElement("label",{className:"block text-xs font-medium text-muted-foreground"},"Target Skill Scope:"),
E.createElement("select",{value:selectedSkill,onChange:e=>setSelectedSkill(e.target.value),className:"w-full p-2.5 rounded-xl bg-background border border-border text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"},
E.createElement("option",{value:"all"},"All Skills (Complete Library)"),
skills.map(s=>E.createElement("option",{key:s,value:s},"Skill: "+s)))),
E.createElement("div",{className:"flex flex-wrap gap-2.5 pt-1"},
E.createElement("button",{type:"button",disabled:isProcessing,onClick:onBackupSkills,className:"px-3.5 py-2 rounded-xl text-xs font-semibold bg-primary text-primary-foreground border-none cursor-pointer flex items-center gap-1.5 shadow-xs hover:opacity-90 disabled:opacity-50"},
E.createElement(rx,{name:"upload",size:16}),"Backup Skills (.zip)"),
E.createElement("button",{type:"button",disabled:isProcessing,onClick:onRestoreSkills,className:"px-3.5 py-2 rounded-xl text-xs font-semibold bg-secondary text-secondary-foreground border border-border cursor-pointer flex items-center gap-1.5 hover:bg-muted disabled:opacity-50"},
E.createElement(rx,{name:"download",size:16}),"Restore Skills (.zip)")))
);
};
'''
    content = must_replace(content, 'var cVb=E.memo(function(){', backup_restore_comp + 'var cVb=E.memo(function(){', "cVb_inject_BackupRestoreScreen")
    return content


def patch_notification_settings_clean(content):
    """Notification Settings screen for Android native notification channels."""
    if "NotificationSettingsScreen" in content:
        return content

    # 1. Update dPb label map
    old_dpb = '["Provide Feedback","Give Feedback"],["Backup and Restore","Backup and Restore"]'
    new_dpb = '["Provide Feedback","Give Feedback"],["Backup and Restore","Backup and Restore"],["Notifications","Notification Settings"]'
    content = must_replace(content, old_dpb, new_dpb, "dPb_notifications_label")

    # 2. Make Notifications always visible on Android
    old_r0b = 'var r0b=()=>{var a=bk(),b=a.get("notificationsSettings")??!1'
    new_r0b = 'var r0b=()=>{var a=bk(),b=!0'
    content = must_replace(content, old_r0b, new_r0b, "r0b_force_notification_settings_visible")

    # 3. Replace cWb notification settings screen
    notification_settings_comp = """var NotificationSettingsScreen=()=>{
var [coreEnabled,setCoreEnabled]=(0,E.useState)(!0);
var [progressEnabled,setProgressEnabled]=(0,E.useState)(!0);
var [alertsEnabled,setAlertsEnabled]=(0,E.useState)(!0);
var [testStatus,setTestStatus]=(0,E.useState)("");
(0,E.useEffect)(()=>{
try{
if(typeof window!=="undefined"&&window.Android&&typeof window.Android.getNotificationSettings==="function"){
var s=JSON.parse(window.Android.getNotificationSettings()||"{}");
if(s.core_enabled!==void 0)setCoreEnabled(!!s.core_enabled);
if(s.progress_enabled!==void 0)setProgressEnabled(!!s.progress_enabled);
if(s.alerts_enabled!==void 0)setAlertsEnabled(!!s.alerts_enabled);
}
}catch(_){}
},[]);
var onToggleCore=(e)=>{
var v=e.target.checked;
setCoreEnabled(v);
try{window.Android&&window.Android.setNotificationSetting&&window.Android.setNotificationSetting("core_enabled",v)}catch(_){}
};
var onToggleProgress=(e)=>{
var v=e.target.checked;
setProgressEnabled(v);
try{window.Android&&window.Android.setNotificationSetting&&window.Android.setNotificationSetting("progress_enabled",v)}catch(_){}
};
var onToggleAlerts=(e)=>{
var v=e.target.checked;
setAlertsEnabled(v);
try{window.Android&&window.Android.setNotificationSetting&&window.Android.setNotificationSetting("alerts_enabled",v)}catch(_){}
};
var onOpenSystemSettings=()=>{
try{window.Android&&window.Android.openNotificationSettings&&window.Android.openNotificationSettings()}catch(_){}
};

return E.createElement("div",{className:"space-y-6 max-w-2xl pb-10"},
E.createElement("div",{className:"space-y-1.5"},
E.createElement("h2",{className:"text-xl font-bold tracking-tight text-foreground m-0"},"Android System Notifications"),
E.createElement("p",{className:"text-sm text-muted-foreground m-0"},
"Control floating alerts, silent completion banners, and persistent progress notifications.")),
E.createElement("div",{className:"rounded-2xl border border-border bg-sidebar-muted/20 p-4 space-y-4 shadow-xs"},
E.createElement("div",{className:"flex items-center justify-between gap-4"},
E.createElement("div",{className:"space-y-0.5"},
E.createElement("div",{className:"font-semibold text-sm text-foreground"},"Running Agent Task Notifications"),
E.createElement("div",{className:"text-xs text-muted-foreground leading-relaxed"},"Shows ongoing background tasks across all conversations")),
E.createElement("input",{type:"checkbox",checked:progressEnabled,onChange:onToggleProgress,className:"h-4 w-4 rounded accent-primary cursor-pointer"})),
E.createElement("div",{className:"h-px bg-border/60"}),
E.createElement("div",{className:"flex items-center justify-between gap-4"},
E.createElement("div",{className:"space-y-0.5"},
E.createElement("div",{className:"font-semibold text-sm text-foreground"},"Task Alerts & Completion (Silent)"),
E.createElement("div",{className:"text-xs text-muted-foreground leading-relaxed"},"Floating banners when tasks finish or need input. All sounds muted.")),
E.createElement("input",{type:"checkbox",checked:alertsEnabled,onChange:onToggleAlerts,className:"h-4 w-4 rounded accent-primary cursor-pointer"})),
E.createElement("div",{className:"h-px bg-border/60"}),
E.createElement("div",{className:"flex items-center justify-between gap-4"},
E.createElement("div",{className:"space-y-0.5"},
E.createElement("div",{className:"font-semibold text-sm text-foreground"},"Antigravity Core Background Status"),
E.createElement("div",{className:"text-xs text-muted-foreground leading-relaxed"},"Foreground notification keeping the Linux environment and language server alive")),
E.createElement("input",{type:"checkbox",checked:coreEnabled,onChange:onToggleCore,className:"h-4 w-4 rounded accent-primary cursor-pointer"}))),
E.createElement("div",{className:"flex gap-2.5 pt-1"},
E.createElement("button",{type:"button",onClick:onOpenSystemSettings,className:"px-3.5 py-2 rounded-xl text-xs font-semibold bg-secondary text-secondary-foreground border border-border cursor-pointer flex items-center gap-1.5 hover:bg-muted"},
E.createElement(rx,{name:"settings",size:16}),"Open Android Channel Settings"))
);
};
var cWb=()=>E.createElement(NotificationSettingsScreen,null);"""

    old_cwb = 'var cWb=()=>bk().get("notificationsSettings")??!1?E.createElement(YU,{title:"Notifications",description:"Manage your notification preferences."},E.createElement(NV,{screen:"Notifications",renderSection:a=>a.id==="notifications-sound"&&a.settings.length>0?E.createElement(bV,{title:a.title,id:a.id},E.createElement($U,null,a.settings.map(b=>b==="agentSoundVolume"?E.createElement(bWb,{key:b}):E.createElement(MV,{key:b,settingKey:b})))):void 0})):null;'
    content = must_replace(content, old_cwb, notification_settings_comp, "cWb_replace_notification_settings")

    return content


def patch_convo_switcher(content):
    """Deep linking hook window.__agyOpenConversation(cid) and router startup."""
    if "window.__agyOpenConversation=" in content:
        return content

    # 1. Hook SBd and define window.__agyOpenConversation
    old_sbd = 'function SBd(a){o7&&o7.navigate({to:"/c/$cascadeId",params:{cascadeId:a}})}'
    new_sbd = (
        'function SBd(a){if(o7){o7.navigate({to:"/c/$cascadeId",params:{cascadeId:a}})}}'
        'window.__agyOpenConversation=function(a){if(!a)return;var c=String(a).trim();'
        'try{if(typeof window.__agySwitchConversation==="function"){window.__agySwitchConversation(c);}}catch(_){}'
        'try{if(o7){o7.navigate({to:"/c/$cascadeId",params:{cascadeId:c}});}else{window.__agyPendingCascadeId=c;}}catch(_){window.__agyPendingCascadeId=c;}};'
    )
    content = must_replace(content, old_sbd, new_sbd, "sbd_open_conversation_global")

    # 2. Hook router creation to flush pending cascade ID
    old_router = 'o7=p=new IAb({routeTree:OBd,history:q,InnerWrap:k,context:xBd,basepath:p.basepath,parseSearch:QBd,stringifySearch:RBd})'
    new_router = (
        'o7=p=new IAb({routeTree:OBd,history:q,InnerWrap:k,context:xBd,basepath:p.basepath,parseSearch:QBd,stringifySearch:RBd});'
        'try{if(window.__agyPendingCascadeId){'
        'var _pendCid=window.__agyPendingCascadeId;'
        'window.__agyPendingCascadeId=null;'
        'setTimeout(()=>{window.__agyOpenConversation(_pendCid)},50);'
        '}}catch(_){}'
    )
    content = must_replace(content, old_router, new_router, "router_flush_pending_cascade_init")

    # 3. Hook initial memory router path
    old_mem = 'case "memory":q=pyb({initialEntries:[p.historyType.initialPath??"/"]});break b;'
    new_mem = 'case "memory":q=pyb({initialEntries:[((typeof window!=="undefined"&&window.__agyPendingCascadeId)?("/c/"+window.__agyPendingCascadeId):(p.historyType.initialPath??"/"))]});break b;'
    content = must_replace(content, old_mem, new_mem, "router_initial_memory_path_cascade")

    return content


def patch_conversation_search_all(content):
    """Integrates Android native searchAllConversations bridge and search jump."""
    if "window.Android.searchAllConversations" in content:
        return content

    # 1. In aBc: replace language server search with Android native ConversationSearchHelper
    old_search_call = 'let R=P(await O(d({query:b,limit:H,filters:D||F?{archivedOnly:D||void 0,includeSideQuestions:F||void 0}:void 0,signal:L.signal})));'
    new_search_call = (
        'let R;'
        'try{'
        'if(typeof window!=="undefined"&&window.Android&&typeof window.Android.searchAllConversations==="function"){'
        'var _raw=window.Android.searchAllConversations(b),_parsed=JSON.parse(_raw||"[]");'
        'R={results:_parsed,indexStale:!1,diskFull:!1}'
        '}else{'
        'R=P(await O(d({query:b,limit:H,filters:D||F?{archivedOnly:D||void 0,includeSideQuestions:F||void 0}:void 0,signal:L.signal})))'
        '}'
        '}catch(_se){'
        'R=P(await O(d({query:b,limit:H,filters:D||F?{archivedOnly:D||void 0,includeSideQuestions:F||void 0}:void 0,signal:L.signal})))'
        '}'
    )
    content = must_replace(content, old_search_call, new_search_call, "abc_search_all_conversations")

    # 2. In ZAc: unique ID per match occurrence, format label with step index, snippet and match highlighting
    old_zac = 'function ZAc(a,b){var c=UAc(a.snippetMatchRanges),{snippet:d,matches:f}=VAc(a.snippet,c);(c=d.trim().replace(/^\\.\\.\\.|\\.\\.\\.$/g,"").trim())&&a.title.trim().toLowerCase().includes(c)&&(d="",f=void 0);return{type:"basic",item:{id:a.sideQuestionCascadeId?`${a.cascadeId}::${a.sideQuestionCascadeId}`:a.cascadeId,label:a.title||"Untitled Conversation"'
    new_zac = (
        'function ZAc(a,b){var c=UAc(a.snippetMatchRanges),{snippet:d,matches:f}=VAc(a.snippet,c);'
        '(c=d.trim().replace(/^\\.\\.\\.|\\.\\.\\.$/g,"").trim())&&a.title&&a.title.trim().toLowerCase().includes(c)&&a.matchedStepIndex===void 0&&(d="",f=void 0);'
        'var _stepSuffix=a.matchedStepIndex!==void 0?" \\u00b7 Step "+a.matchedStepIndex:"",'
        '_lbl=(a.title||"Untitled Conversation")+_stepSuffix,'
        '_uid=a.uniqueId||(a.cascadeId+":"+(a.matchedStepIndex!==void 0?a.matchedStepIndex:"0")+":"+(a.startOffset||0));'
        'return{type:"basic",item:{id:_uid,cascadeId:a.cascadeId,matchedStepIndex:a.matchedStepIndex,snippet:a.snippet,queryMatches:a.snippetMatchRanges,label:_lbl'
    )
    content = must_replace(content, old_zac, new_zac, "zac_unique_item_and_step_label")

    # 3. In selectOrClose: jump to conversation and step
    old_select_close = 'selectOrClose:V=>{W(V);if(V){var da=WAc(V.id,R);f(da??{cascadeId:V.id})}d()}'
    new_select_close = (
        'selectOrClose:V=>{W(V);if(V){'
        'var da=WAc(V.id,R);'
        'var _cid=(V.cascadeId||(da&&da.cascadeId)||V.id||"").split(":")[0];'
        'var _step=V.matchedStepIndex!==void 0?V.matchedStepIndex:(da&&da.matchedStepIndex);'
        'var _snip=V.snippet||(da&&da.snippet)||"";'
        'window.__agPendingConvoJump={cascadeId:_cid,stepIndex:_step,snippet:_snip,query:(b||"").trim(),time:Date.now()};'
        'typeof window.__agTriggerPendingJump==="function"&&window.__agTriggerPendingJump();'
        'f(da??{cascadeId:_cid})}d()}'
    )
    content = must_replace(content, old_select_close, new_select_close, "selectOrClose_step_jump")

    # 4. In fXc: add data-step-index to user message row
    old_fxc = 'var fXc=({userStep:a,userStepIndex:b,sendError:c,stackPosition:d})=>{var f=QZ();return E.createElement("div",{className:"flex w-full flex-row"},'
    new_fxc = 'var fXc=({userStep:a,userStepIndex:b,sendError:c,stackPosition:d})=>{var f=QZ();return E.createElement("div",{className:"flex w-full flex-row","data-step-index":b},'
    content = must_replace(content, old_fxc, new_fxc, "fxc_user_step_index_attr")

    # 5. Inject window.__agTriggerPendingJump helper
    jump_helper = (
        'typeof window!=="undefined"&&!window.__agJumpInjected&&(window.__agJumpInjected=!0,window.__agTriggerPendingJump=function(){'
        'var tries=0,timer=setInterval(function(){'
        'tries++;'
        'var jump=window.__agPendingConvoJump;'
        'if(!jump||Date.now()-jump.time>15000||tries>40){clearInterval(timer);return}'
        'var convoView=document.querySelector(\'[data-testid="conversation-view"]\');'
        'if(!convoView)return;'
        'var curCascade=convoView.getAttribute("data-cascade-id");'
        'if(curCascade&&jump.cascadeId&&curCascade!==jump.cascadeId&&curCascade!=="conversation")return;'
        'var el=null;'
        'if(jump.stepIndex!==void 0&&jump.stepIndex!==null){'
        'el=convoView.querySelector(\'[data-step-index="\'+jump.stepIndex+\'"]\');'
        '}'
        'if(!el&&jump.snippet){'
        'var snip=jump.snippet.replace(/^[.\\s\\u2026]+|[.\\s\\u2026]+$/g,"").trim().toLowerCase();'
        'if(snip.length>4){'
        'var words=snip.split(/\\s+/).filter(function(w){return w.length>2}).slice(0,3);'
        'var walker=document.createTreeWalker(convoView,NodeFilter.SHOW_TEXT);'
        'var n;'
        'while(n=walker.nextNode()){'
        'var t=(n.textContent||"").toLowerCase();'
        'if(t.includes(snip)||(words.length>0&&words.every(function(w){return t.includes(w)}))){'
        'el=n.parentElement;break;'
        '}'
        '}'
        '}'
        '}'
        'if(el){'
        'clearInterval(timer);'
        'window.__agPendingConvoJump=null;'
        'var target=el.closest(\'[data-testid="agent-response"],[data-step-index],[data-turn-content],.message-row,p,div\')||el;'
        'target.scrollIntoView({behavior:"smooth",block:"center"});'
        'var origBg=target.style.backgroundColor,origTr=target.style.transition;'
        'target.style.transition="background-color 300ms ease";'
        'target.style.backgroundColor="rgba(255, 235, 59, 0.35)";'
        'target.style.borderRadius="8px";'
        'setTimeout(function(){'
        'target.style.backgroundColor=origBg;'
        'setTimeout(function(){target.style.transition=origTr},400);'
        '},1600);'
        '}'
        '},120);'
        '});'
    )
    content = jump_helper + content

    return content


def patch_lexical_android_select_delete(content):
    """Exposes window.__agySelectAllInEditor for full range select on Android."""
    if "window.__agySelectAllInEditor=" in content:
        return content

    old_target = 'd=f.select(0,Ms(f)),Dt(Qw(d,f));return!0},0)'
    new_target = (
        'd=f.select(0,Ms(f)),Dt(Qw(d,f));return!0},0);'
        'if(typeof window!=="undefined")window.__agySelectAllInEditor=function(){try{'
        'var el=document.activeElement;'
        'var ed=el&&(el.__lexicalEditor||(el.closest&&el.closest(\'[contenteditable="true"]\')&&el.closest(\'[contenteditable="true"]\').__lexicalEditor));'
        'if(!ed){var bx=document.getElementById("antigravity.agentSidePanelInputBox");var ce=bx&&bx.querySelector(\'[contenteditable="true"]\');ed=ce&&ce.__lexicalEditor;}'
        'if(!ed)return!1;'
        'ed.update(function(){var r=St();r.select(0,Ms(r));},{discrete:!0});'
        'return!0;}catch(_){return!1;}}'
    )
    content = must_replace(content, old_target, new_target, "lexical_expose_select_all_helper")
    return content


def apply_application_tab_patch(content):
    if "agy-application-settings-anchor" in content:
        return content

    # In v2.35.2 parent base file, this is already applied or defined
    return content


def patch_main(file_path):
    if not os.path.isfile(file_path):
        print(f"[web-patch-2.35.2] file not found: {file_path}", file=sys.stderr)
        return False

    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Apply Marketplace V3 if needed
    if OLD_MP_BLOCK_V3 and OLD_MP_BLOCK_V3 in content:
        print("[web-patch-2.35.2] Updating Marketplace V3 RPCs...")
        content = content.replace(OLD_MP_BLOCK_V3, NEW_MP_BLOCK_V3, 1)

    # Fix 1: Offline conversation access without login screen
    if "/*__agyOfflineAccessBypass*/" not in content:
        print("[web-patch-2.35.2] Applying Offline Conversation Access patch...")
        content = patch_offline_access(content)

    # Fix 2: False-positive "no internet" banner fix
    if "/*__agyOnlineBannerFix*/" not in content:
        print("[web-patch-2.35.2] Applying True Network Connectivity check patch...")
        content = patch_online_banner_fix(content)

    # Fix 3 & Fix 4: Multi-conversation task notifications & silent completion
    if "__agyTaskProgressAlertsInjected_v2" not in content:
        print("[web-patch-2.35.2] Applying Multi-Conversation Tasks & Silent Completion patch...")
        content = patch_task_notifications(content)

    # Fix 5: Lexical cursor jumping before punctuation mark
    if "/*__agyPunctuationCursorFixed*/" not in content:
        print("[web-patch-2.35.2] Applying Lexical Punctuation Cursor Jump fix...")
        content = patch_lexical_punctuation_cursor_fix(content)

    # Backup & Restore custom screen
    if "BackupRestoreScreen" not in content:
        print("[web-patch-2.35.2] Applying BackupRestoreScreen patch...")
        content = patch_backup_restore(content)

    # Notification Settings screen
    if "NotificationSettingsScreen" not in content:
        print("[web-patch-2.35.2] Applying Notification Settings clean screen patch...")
        content = patch_notification_settings_clean(content)

    # Convo switcher & deep linking
    if "window.__agyOpenConversation=" not in content:
        print("[web-patch-2.35.2] Applying Conversation Switcher hook patch...")
        content = patch_convo_switcher(content)

    # Conversation search all
    if "window.Android.searchAllConversations" not in content:
        print("[web-patch-2.35.2] Applying Conversation Search All occurrences patch...")
        content = patch_conversation_search_all(content)

    # Lexical select all
    if "window.__agySelectAllInEditor=" not in content:
        print("[web-patch-2.35.2] Applying Lexical Android Select All helper...")
        content = patch_lexical_android_select_delete(content)

    assert "Desktop Mode" not in content, "Desktop Mode must not be present in Android main.js"

    with open(file_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(content)

    print("[web-patch-2.35.2] Successfully patched Android main.js (v2.35.2 + Offline Access + Silent Multi-Notifications + Cursor Fix)!")
    return True


OLD_MP_BLOCK_V3 = ""  # For fresh base files where it is not yet replaced


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "web/main.js"
    if not patch_main(path):
        sys.exit(1)

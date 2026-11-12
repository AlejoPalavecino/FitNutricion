from pathlib import Path
import re

def write(name,text):
 p=Path(name);p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text)
write('src/config/env.ts',r'''export interface AppEnvironmentConfig {
 readonly supabaseUrl:string; readonly supabaseAnonKey:string;
 readonly appEnv:'development'|'production'|'test';readonly authMode:'local'|'cloud';
 readonly isCloudConfigured:boolean;readonly configurationError:string|null;
}
export function parseEnvironment(values:Record<string,unknown>,production=false):AppEnvironmentConfig{
 const text=(key:string)=>typeof values[key]==='string'?(values[key] as string).trim():'';
 const mode=text('VITE_AUTH_MODE');const authMode=mode==='cloud'?'cloud':'local';
 const supabaseUrl=text('VITE_SUPABASE_URL').replace(/\/rest\/v1\/?$/i,'').replace(/\/+$/,'');
 const supabaseAnonKey=text('VITE_SUPABASE_ANON_KEY');let configurationError:string|null=null;
 let validUrl=false;try{const u=new URL(supabaseUrl);validUrl=u.protocol==='https:'&&!u.username&&!u.password&&!u.hostname.includes('tu-proyecto-id');}catch{validUrl=false;}
 let privileged=supabaseAnonKey.startsWith('sb_secret_');
 try{const payload=JSON.parse(atob(supabaseAnonKey.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));privileged ||= payload.role==='service_role';}catch{ /* Publishable keys are not JWTs. */ }
 if((production&&!mode)||(mode&&mode!=='local'&&mode!=='cloud'))configurationError='Configura VITE_AUTH_MODE explícitamente como local o cloud.';
 if(authMode==='cloud'&&(!validUrl||supabaseAnonKey.length<21||privileged))configurationError='Configuración de nube inválida. Usa HTTPS y una clave pública; nunca una clave privilegiada.';
 return {supabaseUrl,supabaseAnonKey,authMode,appEnv:values.MODE==='test'?'test':production?'production':'development',configurationError,isCloudConfigured:authMode==='cloud'&&!configurationError};
}
export const envConfig=Object.freeze(parseEnvironment(import.meta.env,import.meta.env.PROD));
''')
write('src/services/passwordRecovery.ts',r'''import { supabase } from './supabaseClient';
import {isValidEmail,sanitizeEmail,validatePasswordPolicy,mapSafeAuthError} from './securityService';
export async function requestPasswordRecovery(email:string):Promise<string>{
 if(!supabase)throw new Error('Las cuentas locales no tienen recuperación por correo.');
 if(!isValidEmail(email))throw new Error('Ingresa un correo válido.');
 const {error}=await supabase.auth.resetPasswordForEmail(sanitizeEmail(email),{redirectTo:window.location.origin+'/?recovery=1'});
 if(error)throw new Error(mapSafeAuthError(error));
 return 'Si existe una cuenta, recibirás instrucciones en tu correo.';
}
export async function replaceRecoveredPassword(password:string):Promise<void>{
 if(!supabase)throw new Error('La recuperación requiere una cuenta cloud.');
 const check=validatePasswordPolicy(password);if(!check.isValid)throw new Error(check.feedback);
 const {error}=await supabase.auth.updateUser({password});if(error)throw new Error(mapSafeAuthError(error));
}
''')
write('src/components/auth/RecoveryScreen.tsx',r'''import {useState} from 'react';
import {replaceRecoveredPassword} from '../../services/passwordRecovery';
import {useAuthStore} from '../../store/useAuthStore';
export function RecoveryScreen(){
 const [password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 return <main className="mx-auto max-w-md p-6"><h1 className="text-2xl font-bold">Restablecer contraseña</h1><form className="space-y-4" onSubmit={async event=>{
 event.preventDefault();if(password!==confirm){setMessage('Las contraseñas no coinciden.');return;}setBusy(true);
 try{await replaceRecoveredPassword(password);await useAuthStore.getState().logout();useAuthStore.setState({isRecovering:false});window.history.replaceState(null,'','/');}
 catch{setMessage('No se pudo cambiar la contraseña. Comprueba el enlace y vuelve a solicitar uno si venció.');}finally{setBusy(false);}
 }}><label className="block" htmlFor="recovery-password">Nueva contraseña</label><input className="w-full border p-2" id="recovery-password" type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} required minLength={8}/><label className="block" htmlFor="recovery-confirm">Repetir contraseña</label><input className="w-full border p-2" id="recovery-confirm" type="password" autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)} required/><p role="alert">{message}</p><button className="rounded bg-emerald-700 p-3 text-white" disabled={busy}>Guardar nueva contraseña</button></form></main>;
}
''')
write('src/services/authLifecycle.ts',r'''import {supabase} from './supabaseClient';
import {useAuthStore} from '../store/useAuthStore';
import {useNutritionStore} from '../store/useNutritionStore';
import {cloudSyncService} from './cloudSyncService';
/** Never await Supabase methods inside its auth callback. */
export function subscribeAuthLifecycle():()=>void{
 if(!supabase)return ()=>undefined;
 let disposed=false;const timers=new Set<ReturnType<typeof setTimeout>>();
 const {data}=supabase.auth.onAuthStateChange((event)=>{
  const timer=setTimeout(()=>{
   timers.delete(timer);if(disposed)return;
   if(event==='PASSWORD_RECOVERY')useAuthStore.setState({isRecovering:true,isInitialized:true});
   if(event==='SIGNED_OUT'){
    cloudSyncService.disconnect();useNutritionStore.getState().clearActiveSessionState();useAuthStore.setState({currentUser:null,isInitialized:true});
   }
  },0);timers.add(timer);
 });
 return ()=>{disposed=true;timers.forEach(clearTimeout);data.subscription.unsubscribe();};
}
''')
p=Path('src/store/useAuthStore.ts');s=p.read_text().replace('  currentUser: AuthenticatedUser | null;','  currentUser: AuthenticatedUser | null;\n  isRecovering: boolean;\n  initializationError: string | null;').replace('  currentUser: null,\n  isInitialized: false,','  currentUser: null,\n  isRecovering: false,\n  initializationError: null,\n  isInitialized: false,')
s=s.replace('    const generation = ++authGeneration;\n    try {','    const generation = ++authGeneration;\n    set({initializationError:null});\n    try {',1)
s=s.replace('        currentUser: null,\n        isInitialized: true,','        currentUser: null,\n        initializationError: \'No se pudo abrir la sesión o validar los datos locales. Se conservaron sin sobrescribir. No borres el almacenamiento; exporta una copia antes de reparar.\',\n        isInitialized: true,',1)
p.write_text(s)
p=Path('src/components/auth/AuthScreen.tsx');s="import { requestPasswordRecovery } from '../../services/passwordRecovery';\n"+p.read_text()
s=s.replace('          </form>','''          </form>
          {isCloudActive ? <button type="button" className="mt-4 text-sm underline" disabled={isSubmitting} onClick={async()=>{try{setInfoMessage(await requestPasswordRecovery(email));}catch(error){setErrorMessage(error instanceof Error?error.message:'No se pudo solicitar la recuperación.');}}}>Olvidé mi contraseña</button> : <p className="mt-4 text-xs">La cuenta local solo existe en este navegador y no tiene recuperación por correo.</p>}
''',1);p.write_text(s)
write('src/components/navigation/AccountActions.tsx',r'''import {useState} from 'react';
import {useAuthStore} from '../../store/useAuthStore';
import {useSyncStatusStore} from '../../store/useSyncStatusStore';
export function AccountActions(){
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 const pending=useSyncStatusStore(s=>s.pendingOperations);
 async function leave(wipe:boolean){
  if(wipe&&!window.confirm(`Se borrarán los datos de esta cuenta en este dispositivo. ${pending?'Hay cambios pendientes que podrían perderse. ':''}Esto no elimina la cuenta ni los datos del servidor. ¿Continuar?`))return;
  setBusy(true);try{await useAuthStore.getState().logout(wipe);}catch{setError('No se pudo completar la salida o el borrado. Reintenta antes de dejar el dispositivo.');}finally{setBusy(false);}
 }
 return <div className="flex flex-wrap gap-3 px-4 py-2 text-xs"><button type="button" disabled={busy} onClick={()=>void leave(false)}>Cerrar sesión</button><button type="button" disabled={busy} className="underline" onClick={()=>void leave(true)}>Salir y borrar datos del dispositivo</button>{error&&<p role="alert">{error}</p>}</div>;
}
''')
write('src/components/ErrorBoundary.tsx',r'''import {Component,type ReactNode} from 'react';
export class ErrorBoundary extends Component<{children:ReactNode},{failed:boolean}>{
 state={failed:false};static getDerivedStateFromError(){return {failed:true};}
 render(){return this.state.failed?<main role="alert" className="p-6"><h1>No se pudo mostrar esta pantalla</h1><p>No se borraron tus datos. Recarga para intentar recuperar la sesión.</p><button type="button" onClick={()=>window.location.reload()}>Recargar aplicación</button></main>:this.props.children;}
}
''')
p=Path('src/App.tsx');s=p.read_text();s="import {envConfig} from './config/env';\nimport {subscribeAuthLifecycle} from './services/authLifecycle';\nimport {RecoveryScreen} from './components/auth/RecoveryScreen';\nimport {AccountActions} from './components/navigation/AccountActions';\n"+s
s=s.replace('useEffect, useMemo, useRef, useState','lazy, Suspense, useEffect, useMemo, useRef, useState')
for comp,folder in [('OnboardingDiagnostic','onboarding'),('BiometricCheckinView','onboarding'),('NutritionDashboard','dashboard'),('OpenGymHub','gym')]:
 s=s.replace(f"import {{ {comp} }} from './components/{folder}/{comp}';",f"const {comp}=lazy(()=>import('./components/{folder}/{comp}').then(m=>({{default:m.{comp}}})));" )
s=s.replace('  const currentUser =','  const isRecovering = useAuthStore(s=>s.isRecovering);\n  const initializationError = useAuthStore(s=>s.initializationError);\n  const currentUser =',1)
s=s.replace('    void initializeAuth();\n  }, [initializeAuth]);','    const unsubscribe=subscribeAuthLifecycle();\n    if(!envConfig.configurationError)void initializeAuth();\n    return unsubscribe;\n  }, [initializeAuth]);')
s=s.replace('  if (!isInitialized) {','  if(envConfig.configurationError)return <main role="alert" className="p-6">{envConfig.configurationError}</main>;\n  if(isRecovering)return <RecoveryScreen/>;\n  if(initializationError)return <main role="alert" className="p-6">{initializationError}</main>;\n  if (!isInitialized) {')
s=s.replace('      <main className="pb-24">','      <AccountActions/>\n      <main className="pb-24"><Suspense fallback={<p role="status" className="p-6">Cargando pantalla...</p>}>').replace('      </main>','      </Suspense></main>')
p.write_text(s)
p=Path('src/main.tsx');s="import {ErrorBoundary} from './components/ErrorBoundary';\n"+p.read_text();s=s.replace('<App />','<ErrorBoundary><App /></ErrorBoundary>');p.write_text(s)
p=Path('index.html');s=p.read_text();s=s.replace(', maximum-scale=1.0, user-scalable=no','');s=re.sub(r'    <link rel="preconnect"[^\n]*\n','',s);s=re.sub(r'    <link\n      href="https://fonts.googleapis.com[\s\S]*?    />\n','',s);p.write_text(s)
# Associate existing visible labels with the next control; retain visible text and layout.
for p in Path('src/components').rglob('*.tsx'):
 s=p.read_text();offset=0;idx=0
 pattern=re.compile(r'<label(?![^>]*htmlFor)([^>]*)>([\s\S]*?)</label>([\s\S]*?)<(input|select|textarea)\b(?![^>]*\bid=)')
 def label(m):
  global idx
  idx+=1;name=f'{p.stem.lower()}-field-{idx}'
  return f'<label htmlFor="{name}"{m[1]}>{m[2]}</label>{m[3]}<{m[4]} id="{name}"'
 s=pattern.sub(label,s);p.write_text(s)
# Explicit labels for heading-only inputs.
p=Path('src/components/dashboard/NutritionDashboard.tsx');s=p.read_text().replace('type="date"','type="date" aria-label="Fecha de comidas"');p.write_text(s)
p=Path('src/components/navigation/QuickActionCommand.tsx');s=p.read_text();s=s.replace('  if (!isOpen) return null;', '''  const dialogRef=React.useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!isOpen)return;
    const previous=document.activeElement as HTMLElement|null;
    const panel=dialogRef.current;
    panel?.querySelector<HTMLElement>('input,button')?.focus();
    const keydown=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();onClose();}
      if(event.key==='Tab'&&panel){
        const elements=Array.from(panel.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex="0"]')).filter(el=>el.getClientRects().length);
        const first=elements[0],last=elements[elements.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
    };
    document.addEventListener('keydown',keydown);
    return ()=>{document.removeEventListener('keydown',keydown);previous?.focus();};
  },[isOpen,onClose]);
  if (!isOpen) return null;''')
# Inner panel, not backdrop, owns the dialog semantics.
s=s.replace('        <motion.div\n','        <motion.div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Añadir rápido"\n',1)
p.write_text(s)
write('.env.example','''# Explicit mode: local or cloud. Production must choose one.
VITE_AUTH_MODE=local
VITE_APP_ENV=development
# Required only in cloud mode. Never use service_role or sb_secret keys.
VITE_SUPABASE_URL=https://tu-proyecto-id.supabase.co
VITE_SUPABASE_ANON_KEY=tu_clave_publica_anon_de_supabase
''')
write('.nvmrc','22\n')

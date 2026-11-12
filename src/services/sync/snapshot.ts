import type { PersistedUserSnapshot } from '../../store/useNutritionStore';
import { sameValue,documentId,type Change,type Document } from './engine';
const collections={biometric:'biometricLogs',food:'customFoods',recipe:'customRecipes',exercise:'customExercises',timeline:'timelineLogs',checkin:'metabolicCheckins',routine:'workoutRoutines',session:'workoutSessions'} as const;
export function snapshotDocuments(snapshot:PersistedUserSnapshot):Change[]{
  const result:Change[]=[];
  if(snapshot.userProfile)result.push({kind:'profile',key:snapshot.userProfile.id,value:{...snapshot.userProfile}});
  for(const [kind,field]of Object.entries(collections) as [keyof typeof collections,typeof collections[keyof typeof collections]][]){
    for(const item of snapshot[field]){const value={...item} as Record<string,unknown>;result.push({kind,key:String(kind==='biometric'?value.date:value.id),value});}
  }
  result.push({kind:'preferences',key:'favorites',value:{favoriteFoodIds:snapshot.favoriteFoodIds}});return result;
}
export function diffDocuments(before:Change[],after:Change[]):Change[]{
  const prev=new Map(before.map(doc=>[documentId(doc),doc]));const next=new Map(after.map(doc=>[documentId(doc),doc]));const changes:Change[]=[];
  for(const[key,doc]of next)if(!prev.has(key)||!sameValue(prev.get(key)?.value,doc.value))changes.push({...doc,previous:prev.get(key)?.value??null});
  for(const[key,doc]of prev)if(!next.has(key)&&doc.value!==null)changes.push({...doc,value:null,previous:doc.value});
  return changes;
}
export function applyDocuments(snapshot:PersistedUserSnapshot,docs:Document[]):PersistedUserSnapshot{
  const next:PersistedUserSnapshot={...snapshot,userProfile:null,biometricLogs:[],customFoods:[],customRecipes:[],customExercises:[],timelineLogs:[],metabolicCheckins:[],workoutRoutines:[],workoutSessions:[],deletedRecordIds:[]};
  for(const doc of docs){
    if(doc.value===null){next.deletedRecordIds.push(doc.key);continue;}
    if(doc.kind==='profile')next.userProfile=doc.value as unknown as PersistedUserSnapshot['userProfile'];
    else if(doc.kind==='preferences')next.favoriteFoodIds=Array.isArray(doc.value.favoriteFoodIds)?doc.value.favoriteFoodIds.filter((id):id is string=>typeof id==='string'):[];
    else (next[collections[doc.kind]] as unknown as Record<string,unknown>[]).push(doc.value);
  }
  next.biometricLogs.sort((a,b)=>a.date.localeCompare(b.date));next.workoutSessions.sort((a,b)=>b.date.localeCompare(a.date));next.metabolicCheckins.sort((a,b)=>b.weekDate.localeCompare(a.weekDate));return next;
}

/** Civil date arithmetic is independent from device timezone and DST. */
export function localDate(now=new Date()):string {
 if(!Number.isFinite(now.getTime()))throw new RangeError('Fecha inválida.');
 return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
}
export function isCivilDate(value:string):boolean {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const[y,m,d]=value.split('-').map(Number),date=new Date(Date.UTC(y,m-1,d));
 return y>=1000&&date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d;
}
export function dayNumber(value:string):number {
 if(!isCivilDate(value))throw new RangeError('Fecha civil inválida.');return Date.parse(`${value}T00:00:00Z`)/86400000;
}
export function addDays(value:string,amount:number):string {
 if(!Number.isInteger(amount))throw new RangeError('El desplazamiento debe ser entero.');return new Date((dayNumber(value)+amount)*86400000).toISOString().slice(0,10);
}
export const daysBetween=(start:string,end:string):number=>dayNumber(end)-dayNumber(start);
export function weekStart(value=localDate()):string {const day=new Date(dayNumber(value)*86400000).getUTCDay();return addDays(value,-((day+6)%7));}
export function ageOn(birthDate:string,reference=localDate()):number {
 if(!isCivilDate(birthDate)||!isCivilDate(reference)||birthDate>reference)throw new RangeError('Fecha de nacimiento inválida.');
 const[year,month,day]=birthDate.split('-').map(Number),[ry,rm,rd]=reference.split('-').map(Number);
 return ry-year-(rm<month||(rm===month&&rd<day)?1:0);
}

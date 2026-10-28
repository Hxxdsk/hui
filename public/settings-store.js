let pending=null,saving=false,waiters=[];
export async function loadSettings(){const response=await fetch('/api/preferences/load',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});const result=await response.json();if(!response.ok)throw new Error(result.error||'读取设置失败');return result;}
export function persistSettings(data){
 pending=structuredClone(data);
 const promise=new Promise((resolve,reject)=>waiters.push({resolve,reject}));
 if(!saving)drain();return promise;
}
async function drain(){saving=true;
 while(pending){const data=pending;pending=null;const current=waiters;waiters=[];
  try{const body=JSON.stringify(data),response=await fetch('/api/preferences/save',{method:'POST',headers:{'Content-Type':'application/json'},body,keepalive:body.length<50000});const result=await response.json();if(!response.ok)throw new Error(result.error||'本机设置保存失败');current.forEach(p=>p.resolve());}
  catch(error){current.forEach(p=>p.reject(error));}
 }
 saving=false;
}

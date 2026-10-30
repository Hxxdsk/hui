export function createDesktopLifecycle({enabled=false,shutdown=()=>{},busy=()=>false}={}){
 const clients=new Map();let stopping=false;
 const valid=id=>typeof id==='string'&&/^[a-zA-Z0-9-]{8,100}$/.test(id);
 return {open(id){if(!valid(id))throw new Error('页面会话无效');if(clients.size>=100&&!clients.has(id))clients.delete(clients.keys().next().value);clients.set(id,Date.now());return this.status();},ping(id){return this.open(id);},close(id){clients.delete(id);return this.status();},quit(){if(!enabled)throw new Error('请通过绘.exe启动后退出');if(busy())throw new Error('正在更新，请完成后退出');if(!stopping){stopping=true;setTimeout(shutdown,150);}return this.status();},status(){return {managed:enabled,pages:clients.size,stopping};},tick(){},dispose(){clients.clear();}};
}

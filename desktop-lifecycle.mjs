export function createDesktopLifecycle({enabled=false,shutdown=()=>{},busy=()=>false,now=Date.now,grace=2500,heartbeatTimeout=130000,startupTimeout=90000}={}){
 const clients=new Map();let last=now(),seen=false,stopping=false;
 const valid=id=>typeof id==='string'&&/^[a-zA-Z0-9-]{8,100}$/.test(id);
 const tick=()=>{const time=now();for(const [id,date]of clients)if(time-date>heartbeatTimeout)clients.delete(id);if(enabled&&!stopping&&!busy()&&!clients.size&&time-last>(seen?grace:startupTimeout)){stopping=true;shutdown();}};
 const timer=enabled?setInterval(tick,500):null;timer?.unref();
 return {open(id){if(!valid(id))throw new Error('页面会话无效');if(clients.size>=100&&!clients.has(id))throw new Error('页面数量过多');clients.set(id,now());last=now();seen=true;return this.status();},ping(id){return this.open(id);},close(id){if(valid(id))clients.delete(id);last=now();return this.status();},status(){return {managed:enabled,pages:clients.size,stopping};},tick,dispose(){clearInterval(timer);clients.clear();}};
}

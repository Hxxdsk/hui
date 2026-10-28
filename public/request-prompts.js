export function composeRequest(messages, config) {
  const wire = messages.map(m=>({...m}));
  const system = [config.systemEnabled!==false ? config.system : '', config.extraEnabled!==false ? config.extra : ''].filter(s=>typeof s==='string'&&s.trim()).join('\n\n');
  if(system)wire.unshift({role:'system',content:system});
  if(config.tailEnabled && config.tail?.trim())wire.push({role:'user',content:config.tail.trim()});
  return wire;
}
export function appendRequestInstructions(messages,instructions){
 const text=instructions.filter(s=>typeof s==='string'&&s.trim()).map(s=>s.trim()).join('\n\n');
 const wire=messages.map(m=>({...m,content:Array.isArray(m.content)?m.content.map(p=>({...p})):m.content}));if(!text)return wire;
 const last=wire.at(-1);if(last?.role==='user'){if(typeof last.content==='string')last.content+='\n\n'+text;else last.content.push({type:'text',text});}else wire.push({role:'user',content:text});return wire;
}
export function requestPlan(config){return [['系统指令',config.systemEnabled!==false,config.system],['每轮附加指令',config.extraEnabled!==false,config.extra],['对话历史',true,'保留最新用户消息，按完整轮次裁剪较早历史。'],['末尾约束',config.tailEnabled,config.tail],['续写指令（仅续写请求）',true,config.continuePrompt]].map(([name,on,text])=>`${name} · ${on?'启用':'关闭'}\n${text?.trim()||'（空）'}`).join('\n\n────────────\n\n');}

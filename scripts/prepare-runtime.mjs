import {startAnimaInstall,animaStatus} from '../anima-service.mjs';
await startAnimaInstall({kind:'validator'});
while(true){const status=await animaStatus();console.log(status.job.message||'正在准备便携环境');if(status.job.state==='failed')throw new Error(status.job.message);if(status.job.state==='done'){if(!status.validator)throw new Error('校验环境未就绪');break;}await new Promise(r=>setTimeout(r,1500));}

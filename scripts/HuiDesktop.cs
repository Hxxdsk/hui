using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

class HuiDesktop : ApplicationContext {
 string root,app,node,address;int port=3210;Process server;IntPtr job;Mutex mutex;bool starting,started,exiting,opened,reuse,noBrowser;DateTime readyAt;System.Windows.Forms.Timer timer;Control dispatcher=new Control();string[] args;
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)]static extern IntPtr CreateJobObject(IntPtr a,string b);
 [DllImport("kernel32.dll")]static extern bool SetInformationJobObject(IntPtr a,int b,IntPtr c,uint d);
 [DllImport("kernel32.dll")]static extern bool AssignProcessToJobObject(IntPtr a,IntPtr b);
 [DllImport("kernel32.dll")]static extern bool CloseHandle(IntPtr a);
 [StructLayout(LayoutKind.Sequential)]struct Basic{public long A,B;public uint Flags;public UIntPtr C,D;public uint E;public UIntPtr F;public uint G,H;}
 [StructLayout(LayoutKind.Sequential)]struct Io{public ulong A,B,C,D,E,F;}
 [StructLayout(LayoutKind.Sequential)]struct Limits{public Basic Basic;public Io Io;public UIntPtr A,B,C,D;}
 static string Quote(string s){s=s.Replace("\"","");int n=0;for(int i=s.Length-1;i>=0&&s[i]=='\\';i--)n++;return "\""+s+new string('\\',n)+"\"";}
 string Arg(string key){int i=Array.IndexOf(args,key);return i>=0&&i+1<args.Length?args[i+1]:null;}
 public HuiDesktop(){root=AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);app=Directory.Exists(Path.Combine(root,"app"))?Path.Combine(root,"app"):root;node=Path.Combine(root,"runtime","node.exe");args=Environment.GetCommandLineArgs();reuse=Array.IndexOf(args,"--reuse-page")>=0;noBrowser=Array.IndexOf(args,"--no-browser")>=0;dispatcher.CreateControl();timer=new System.Windows.Forms.Timer{Interval=400};timer.Tick+=async(s,e)=>await Tick();timer.Start();Application.ApplicationExit+=(s,e)=>Cleanup();}
 int FreePort(int first){for(int i=first;i<first+100&&i<65536;i++){try{var listener=new TcpListener(IPAddress.Loopback,i);listener.Start();listener.Stop();return i;}catch(SocketException){}}throw new Exception("没有可用的本地端口");}
 void Open(){if(noBrowser)return;opened=true;Process.Start(new ProcessStartInfo(address){UseShellExecute=true});}
 async Task Tick(){if(exiting||starting)return;starting=true;try{
  if(!started){await Start();return;}
  if(server.HasExited){await HandoffOrExit();return;}
  if(reuse&&!opened&&!noBrowser&&(DateTime.UtcNow-readyAt).TotalSeconds>10){bool pages=false;try{using(var web=new WebClient()){var data=new JavaScriptSerializer().Deserialize<System.Collections.Generic.Dictionary<string,object>>(await web.DownloadStringTaskAsync(address+"/api/session/status"));pages=Convert.ToInt32(data["pages"])>0;}}catch{}if(!pages)Open();else opened=true;}
 }catch(Exception error){MessageBox.Show(error.Message,"绘",MessageBoxButtons.OK,MessageBoxIcon.Error);Exit();}finally{starting=false;}}
 async Task Start(){
  if(!File.Exists(node))throw new Exception("请完整解压便携包，缺少 runtime/node.exe。");
  if(File.Exists(Path.Combine(root,".hui-update","update.lock")))throw new Exception("上次更新可能中断。请按升级教程使用保留的事务备份恢复，勿删除备份目录。");
  string portFile=Path.Combine(app,"user-data","desktop.json");int preferred=3210;if(Arg("--port")!=null)int.TryParse(Arg("--port"),out preferred);else if(File.Exists(portFile)){try{var saved=new JavaScriptSerializer().Deserialize<System.Collections.Generic.Dictionary<string,object>>(File.ReadAllText(portFile));preferred=Convert.ToInt32(saved["port"]);}catch{}}if(preferred<1024||preferred>65400)preferred=3210;
  bool created;string name;using(var sha=SHA256.Create())name=BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(root.ToLowerInvariant()))).Replace("-","");mutex=new Mutex(true,"Local\\HuiDesktop-"+name,out created);if(!created){address="http://127.0.0.1:"+preferred;Open();Exit();return;}
  port=FreePort(preferred);address="http://127.0.0.1:"+port;Directory.CreateDirectory(Path.GetDirectoryName(portFile));File.WriteAllText(portFile,new JavaScriptSerializer().Serialize(new {port=port}));
  job=CreateJobObject(IntPtr.Zero,null);if(job==IntPtr.Zero)throw new Exception("无法建立本地服务进程组");var limits=new Limits();limits.Basic.Flags=0x2000;int size=Marshal.SizeOf(limits);IntPtr ptr=Marshal.AllocHGlobal(size);try{Marshal.StructureToPtr(limits,ptr,false);if(!SetInformationJobObject(job,9,ptr,(uint)size))throw new Exception("无法配置进程退出清理");}finally{Marshal.FreeHGlobal(ptr);}
  var info=new ProcessStartInfo(node,Quote(Path.Combine(app,"server.mjs"))){UseShellExecute=false,CreateNoWindow=true,WorkingDirectory=app,RedirectStandardOutput=true,RedirectStandardError=true};info.EnvironmentVariables["PORT"]=port.ToString();info.EnvironmentVariables["HUI_MANAGED"]="1";info.EnvironmentVariables["HUI_INSTALL_ROOT"]=root;server=new Process{StartInfo=info};server.Start();if(!AssignProcessToJobObject(job,server.Handle))throw new Exception("无法接管后台服务");server.BeginOutputReadLine();server.BeginErrorReadLine();bool ready=false;
  for(int i=0;i<100;i++){if(server.HasExited)throw new Exception("绘服务启动失败，请检查程序文件是否完整。");try{using(var web=new WebClient()){if((await web.DownloadStringTaskAsync(address+"/api/health")).Contains("true")){ready=true;break;}}}catch{}await Task.Delay(100);}
  if(!ready)throw new Exception("绘服务启动超时。");started=true;readyAt=DateTime.UtcNow;if(!reuse)Open();CleanHelper();
 }
 async Task HandoffOrExit(){
  string pendingFile=Path.Combine(root,".hui-update","pending.json");if(File.Exists(pendingFile)){
   var pending=new JavaScriptSerializer().Deserialize<System.Collections.Generic.Dictionary<string,object>>(File.ReadAllText(pendingFile));if((string)pending["schema"]!="hui-desktop-update")throw new Exception("更新接管记录无效");
   string download=Path.GetFullPath(Path.Combine(root,".hui-update","download"))+Path.DirectorySeparatorChar;string engine=Path.GetFullPath(Path.Combine(root,(string)pending["engine"])),package=Path.GetFullPath(Path.Combine(root,(string)pending["package"]));if(!engine.StartsWith(download,StringComparison.OrdinalIgnoreCase)||!package.StartsWith(download,StringComparison.OrdinalIgnoreCase)||!File.Exists(engine)||!File.Exists(package))throw new Exception("更新包接管路径无效，原程序未替换。");
   string helper=Path.Combine(Path.GetTempPath(),"hui-update-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(helper);string helperNode=Path.Combine(helper,"node.exe");File.Copy(node,helperNode);string worker=Path.Combine(app,"update-worker.mjs");if(!File.Exists(worker))throw new Exception("缺少更新恢复组件。");
   var info=new ProcessStartInfo(helperNode,Quote(worker)+" --root "+Quote(root)+" --parent "+Process.GetCurrentProcess().Id+" --engine "+Quote(engine)+" --package "+Quote(package)+" --port "+port){UseShellExecute=false,CreateNoWindow=true,WorkingDirectory=app};Process.Start(info);
  }
  await Task.Delay(100);Exit();
 }
 void CleanHelper(){string file=Arg("--cleanup-helper"),id=Arg("--helper-pid");int pid;if(file==null||!int.TryParse(id,out pid))return;string full=Path.GetFullPath(file),prefix=Path.GetFullPath(Path.GetTempPath());if(!full.StartsWith(prefix+"hui-update-",StringComparison.OrdinalIgnoreCase)||Path.GetFileName(full)!="node.exe")return;Task.Run(async()=>{for(int i=0;i<60;i++){bool alive=true;try{alive=!Process.GetProcessById(pid).HasExited;}catch{alive=false;}if(!alive){try{File.Delete(full);Directory.Delete(Path.GetDirectoryName(full),false);}catch{}return;}await Task.Delay(500);}});}
 void Cleanup(){if(job!=IntPtr.Zero){CloseHandle(job);job=IntPtr.Zero;}try{if(server!=null&&!server.HasExited)server.Kill();}catch{}if(mutex!=null){try{mutex.ReleaseMutex();}catch{}mutex.Dispose();mutex=null;}}
 void Exit(){exiting=true;timer.Stop();Cleanup();ExitThread();dispatcher.Dispose();}
}

using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Text;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

class HuiUpdater : Form {
 TextBox folder=new TextBox(),package=new TextBox(),details=new TextBox();Label status=new Label();Button apply=new Button(),inspect=new Button(),undo=new Button();
 [STAThread] static void Main(){Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);Application.Run(new HuiUpdater());}
 public HuiUpdater(){
  Text="绘 · 升级助手";ClientSize=new Size(700,520);MinimumSize=new Size(660,550);Font=new Font("Microsoft YaHei UI",11);BackColor=Color.FromArgb(248,245,251);ForeColor=Color.FromArgb(65,48,79);StartPosition=FormStartPosition.CenterScreen;
  var heading=new Label{Text="更新绘",Font=new Font(Font.FontFamily,23,FontStyle.Bold),AutoSize=true,Location=new Point(28,23)};Controls.Add(heading);
  Controls.Add(new Label{Text="保留设置与已下载的模型，仅更新有差异的程序文件",AutoSize=true,Location=new Point(31,77)});
  Controls.Add(new Label{Text="旧版安装目录",AutoSize=true,Location=new Point(31,119)});folder.SetBounds(31,147,526,32);Controls.Add(folder);var browse=new Button{Text="选择目录",Location=new Point(569,145),Size=new Size(100,36)};browse.Click+=(s,e)=>{using(var dialog=new FolderBrowserDialog()){dialog.Description="选择包含 绘.exe、app 和 runtime 的旧版目录";if(dialog.ShowDialog()==DialogResult.OK)folder.Text=dialog.SelectedPath;}};Controls.Add(browse);
  Controls.Add(new Label{Text="升级数据包",AutoSize=true,Location=new Point(31,194)});package.SetBounds(31,222,526,32);Controls.Add(package);var pick=new Button{Text="选择文件",Location=new Point(569,220),Size=new Size(100,36)};pick.Click+=(s,e)=>{using(var dialog=new OpenFileDialog()){dialog.Filter="绘升级数据包|*.zip";if(dialog.ShowDialog()==DialogResult.OK)package.Text=dialog.FileName;}};Controls.Add(pick);
  status.SetBounds(31,274,638,44);status.Text="请先关闭目标目录的绘启动器，再检查升级。";Controls.Add(status);
  details.SetBounds(31,322,638,116);details.Multiline=true;details.ScrollBars=ScrollBars.Vertical;details.ReadOnly=true;details.BackColor=Color.White;details.ForeColor=ForeColor;details.Font=new Font("Microsoft YaHei UI",10);Controls.Add(details);
  inspect.Text="检查差异";inspect.SetBounds(31,460,135,38);inspect.Click+=async(s,e)=>await Run("--plan");Controls.Add(inspect);undo.Text="回滚上次升级";undo.SetBounds(181,460,150,38);undo.Click+=async(s,e)=>await Run("--rollback");Controls.Add(undo);apply.Text="开始升级";apply.SetBounds(514,460,155,38);apply.BackColor=Color.FromArgb(114,90,140);apply.ForeColor=Color.White;apply.FlatStyle=FlatStyle.Flat;apply.Click+=async(s,e)=>await Run("");Controls.Add(apply);
  string root=AppDomain.CurrentDomain.BaseDirectory;string parent=Path.GetFullPath(Path.Combine(root,".."));if(File.Exists(Path.Combine(root,"app","server.mjs")))folder.Text=root;else if(File.Exists(Path.Combine(parent,"app","server.mjs")))folder.Text=parent;
  string[] args=Environment.GetCommandLineArgs();if(args.Length>1)folder.Text=args[1];string[] packages=Directory.GetFiles(root,"hui-update-data-*.zip");if(packages.Length==1)package.Text=packages[0];
  FormClosing+=(s,e)=>{if(!apply.Enabled){e.Cancel=true;status.Text="正在完成文件更新，请等待操作结束。";}};
 }
 static string Quote(string s){s=s.Replace("\"","");int n=0;for(int i=s.Length-1;i>=0&&s[i]=='\\';i--)n++;return "\""+s+new string('\\',n)+"\"";}
 async Task Run(string mode){
  inspect.Enabled=apply.Enabled=undo.Enabled=false;
  try{
   string root=Path.GetFullPath(folder.Text.Trim());string node=Path.Combine(root,"runtime","node.exe");if(!File.Exists(node))throw new Exception("请选择完整旧版目录，缺少 runtime/node.exe。");
   string script=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"apply-update.mjs");if(!File.Exists(script))throw new Exception("缺少 apply-update.mjs，请完整解压升级助手。");if(mode!="--rollback"&&!File.Exists(package.Text))throw new Exception("请选择 hui-update-data 升级数据包。");
   status.Text=mode=="--plan"?"正在检查差异…":mode=="--rollback"?"正在回滚…":"正在校验并升级，请勿断电或关闭窗口…";details.Text="";
   string helper=Path.Combine(Path.GetTempPath(),"hui-update-manual-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(helper);string helperNode=Path.Combine(helper,"node.exe");File.Copy(node,helperNode);
   var info=new ProcessStartInfo(helperNode,Quote(script)+" --target "+Quote(root)+(mode=="--rollback"?"":" --package "+Quote(package.Text))+" "+mode){UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true,StandardOutputEncoding=Encoding.UTF8,StandardErrorEncoding=Encoding.UTF8,WorkingDirectory=root};
   var process=new Process{StartInfo=info};process.Start();var output=process.StandardOutput.ReadToEndAsync();var errors=process.StandardError.ReadToEndAsync();await Task.Run(()=>process.WaitForExit());string text=await output;string log=await errors;try{File.Delete(helperNode);Directory.Delete(helper,false);}catch{}
   var data=new JavaScriptSerializer().Deserialize<System.Collections.Generic.Dictionary<string,object>>(text);if(!data.ContainsKey("ok")||!(bool)data["ok"])throw new Exception(data.ContainsKey("error")?(string)data["error"]:text);
   if(data.ContainsKey("needsRecovery")){status.Text="上次升级中断，请点击回滚上次升级，然后重试。";return;}
   if(data.ContainsKey("rolledBack")){status.Text="已恢复到升级前版本，可以重新启动绘。";details.Text="用户配置与模型未改动。";return;}
   string summary="版本："+data["from"]+" → "+data["to"]+Environment.NewLine+"替换 "+data["replace"]+" · 新增 "+data["add"]+" · 相同跳过 "+data["unchanged"]+" · 保留资源 "+data["preserved"];
   details.Text=summary+(data.ContainsKey("backup")?Environment.NewLine+"回滚备份："+data["backup"]:"");status.Text=mode=="--plan"?"检查完成。确认关闭旧版后，点击开始升级。":"升级完成。可以双击原目录的绘.exe。";
  }catch(Exception error){status.Text="未完成："+error.Message;details.Text=error.Message;}finally{inspect.Enabled=apply.Enabled=undo.Enabled=true;}
 }
}

using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Windows.Forms;

class SoftButton : Control {
    public bool Primary;
    bool hover,pressed;
    public SoftButton(){Cursor=Cursors.Hand;TabStop=true;AccessibleRole=AccessibleRole.PushButton;SetStyle(ControlStyles.UserPaint|ControlStyles.AllPaintingInWmPaint|ControlStyles.OptimizedDoubleBuffer|ControlStyles.SupportsTransparentBackColor|ControlStyles.Selectable|ControlStyles.StandardClick,true);BackColor=Color.Transparent;}
    protected override void OnPaintBackground(PaintEventArgs e){base.OnPaintBackground(e);}
    protected override void OnMouseEnter(EventArgs e){hover=true;Invalidate();base.OnMouseEnter(e);}
    protected override void OnMouseLeave(EventArgs e){hover=false;pressed=false;Invalidate();base.OnMouseLeave(e);}
    protected override void OnMouseDown(MouseEventArgs e){if(e.Button==MouseButtons.Left){Focus();pressed=true;Invalidate();}base.OnMouseDown(e);}
    protected override void OnMouseUp(MouseEventArgs e){pressed=false;Invalidate();base.OnMouseUp(e);}
    protected override void OnGotFocus(EventArgs e){Invalidate();base.OnGotFocus(e);}
    protected override void OnLostFocus(EventArgs e){pressed=false;Invalidate();base.OnLostFocus(e);}
    protected override void OnEnabledChanged(EventArgs e){Invalidate();base.OnEnabledChanged(e);}
    protected override bool IsInputKey(Keys key){return key==Keys.Enter||key==Keys.Space||base.IsInputKey(key);}
    protected override void OnKeyDown(KeyEventArgs e){if(Enabled&&(e.KeyCode==Keys.Enter||e.KeyCode==Keys.Space)){pressed=true;Invalidate();e.Handled=true;}base.OnKeyDown(e);}
    protected override void OnKeyUp(KeyEventArgs e){if(Enabled&&pressed&&(e.KeyCode==Keys.Enter||e.KeyCode==Keys.Space)){pressed=false;Invalidate();OnClick(EventArgs.Empty);e.Handled=true;}base.OnKeyUp(e);}
    protected override void OnPaint(PaintEventArgs e){var g=e.Graphics;g.SmoothingMode=SmoothingMode.AntiAlias;float scale=DeviceDpi/96f;int margin=Math.Max(2,(int)(2*scale));Color fill=Primary?Color.FromArgb(114,90,140):Color.FromArgb(239,232,245);Color ink=Primary?Color.White:Color.FromArgb(82,59,100);if(Enabled&&(hover||pressed))fill=Primary?Color.FromArgb(96,72,122):Color.FromArgb(226,214,237);if(!Enabled){fill=Color.FromArgb(230,221,237);ink=Color.FromArgb(104,85,118);}using(var path=HuiLauncher.Round(new Rectangle(margin,margin,Width-margin*2-1,Height-margin*2-1),(int)(12*scale))){using(var brush=new SolidBrush(fill))g.FillPath(brush,path);using(var pen=new Pen(Primary?Color.FromArgb(110,84,134):Color.FromArgb(211,194,224)))g.DrawPath(pen,path);}TextRenderer.DrawText(g,Text,Font,ClientRectangle,ink,TextFormatFlags.HorizontalCenter|TextFormatFlags.VerticalCenter);if(Focused&&Enabled){int inset=(int)(6*scale);using(var path=HuiLauncher.Round(new Rectangle(inset,inset,Width-inset*2-1,Height-inset*2-1),(int)(9*scale)))using(var pen=new Pen(Primary?Color.FromArgb(218,201,231):Color.FromArgb(143,114,164),1.5f))g.DrawPath(pen,path);}}
}
class HuiLauncher : Form {
    Process server; IntPtr job; string address; bool exiting;
    Label status = new Label(),state = new Label(); SoftButton open = new SoftButton();
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] static extern IntPtr CreateJobObject(IntPtr attributes, string name);
    [DllImport("kernel32.dll")] static extern bool SetInformationJobObject(IntPtr job, int type, IntPtr info, uint length);
    [DllImport("kernel32.dll")] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    [DllImport("user32.dll")] static extern bool DestroyIcon(IntPtr handle);
    [StructLayout(LayoutKind.Sequential)] struct BasicLimits { public long PerProcess, PerJob; public uint Flags; public UIntPtr Min,Max; public uint Active; public UIntPtr Affinity; public uint Priority,Scheduling; }
    [StructLayout(LayoutKind.Sequential)] struct IoCounters { public ulong A,B,C,D,E,F; }
    [StructLayout(LayoutKind.Sequential)] struct ExtendedLimits { public BasicLimits Basic; public IoCounters Io; public UIntPtr ProcessMemory,JobMemory,PeakProcess,PeakJob; }
    [STAThread] static void Main() { Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);if(Array.IndexOf(Environment.GetCommandLineArgs(),"--preview")>=0)Application.Run(new HuiLauncher());else Application.Run(new HuiDesktop()); }
    public HuiLauncher() {
        AutoScaleDimensions=new SizeF(96,96);AutoScaleMode=AutoScaleMode.Dpi;Text="绘";ClientSize=new Size(600,352);FormBorderStyle=FormBorderStyle.FixedSingle;MaximizeBox=false;StartPosition=FormStartPosition.CenterScreen;BackColor=Color.FromArgb(248,245,251);ForeColor=Color.FromArgb(63,49,76);Font=new Font("Microsoft YaHei UI",11.5f);DoubleBuffered=true;
        string iconFile=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"assets","hui.ico");
        if(File.Exists(iconFile))Icon=new Icon(iconFile);else using(var bitmap=new Bitmap(48,48)){using(var g=Graphics.FromImage(bitmap))HuiMark.Draw(g,new Rectangle(0,0,48,48));IntPtr handle=bitmap.GetHicon();Icon=(Icon)Icon.FromHandle(handle).Clone();DestroyIcon(handle);}
        var title=new Label{Text="绘",Font=new Font(Font.FontFamily,27,FontStyle.Bold),Location=new Point(121,25),AutoSize=true,BackColor=Color.Transparent};Controls.Add(title);
        Controls.Add(new Label{Text="对话 / 翻译 / Tag",Location=new Point(125,77),AutoSize=true,ForeColor=Color.FromArgb(108,86,125),BackColor=Color.Transparent});
        state.SetBounds(444,48,122,31);state.Text="准备中";state.TextAlign=ContentAlignment.MiddleCenter;state.Font=new Font(Font.FontFamily,10.5f);state.BackColor=Color.FromArgb(235,226,243);state.ForeColor=Color.FromArgb(96,72,116);Controls.Add(state);
        Controls.Add(new Label{Text="服务地址",Location=new Point(52,147),AutoSize=true,Font=new Font(Font.FontFamily,10.5f),ForeColor=Color.FromArgb(110,89,125),BackColor=Color.White});
        status.SetBounds(51,181,490,44);status.Text="正在启动…";status.Font=new Font(Font.FontFamily,12.5f);status.BackColor=Color.White;status.ForeColor=Color.FromArgb(68,51,81);Controls.Add(status);
        open.Text="打开工作台  ↗";open.Primary=true;open.SetBounds(32,251,318,51);open.Enabled=false;open.Click+=(s,e)=>OpenBrowser();Controls.Add(open);
        var stop=new SoftButton{Text="退出程序",Location=new Point(364,251),Size=new Size(204,51)};stop.Click+=(s,e)=>Close();Controls.Add(stop);
        Controls.Add(new Label{Text="关闭启动器后自动释放端口",Location=new Point(36,318),AutoSize=true,Font=new Font(Font.FontFamily,10),ForeColor=Color.FromArgb(111,92,124),BackColor=Color.Transparent});
        Shown+=async(s,e)=>{string[] args=Environment.GetCommandLineArgs();int preview=Array.IndexOf(args,"--preview");if(preview>=0&&preview+1<args.Length){status.Text="http://127.0.0.1:3210";state.Text="运行中";open.Enabled=true;stop.Focus();using(var bitmap=new Bitmap(Width,Height)){DrawToBitmap(bitmap,new Rectangle(Point.Empty,Size));bitmap.Save(args[preview+1],System.Drawing.Imaging.ImageFormat.Png);}Close();return;}await StartServer();};FormClosing+=(s,e)=>StopServer();
    }
    public static GraphicsPath Round(Rectangle r,int radius){var p=new GraphicsPath();int d=radius*2;p.AddArc(r.Left,r.Top,d,d,180,90);p.AddArc(r.Right-d,r.Top,d,d,270,90);p.AddArc(r.Right-d,r.Bottom-d,d,d,0,90);p.AddArc(r.Left,r.Bottom-d,d,d,90,90);p.CloseFigure();return p;}
    static void DrawMoon(Graphics g,Rectangle r,Color paper){using(var brush=new SolidBrush(Color.FromArgb(138,108,162)))g.FillEllipse(brush,r);using(var brush=new SolidBrush(paper))g.FillEllipse(brush,new Rectangle(r.X+r.Width/3,r.Y-r.Height/8,r.Width,r.Height));}
    protected override void OnPaint(PaintEventArgs e){base.OnPaint(e);var g=e.Graphics;var saved=g.Save();g.SmoothingMode=SmoothingMode.AntiAlias;g.ScaleTransform(ClientSize.Width/600f,ClientSize.Height/352f);
        using(var shadow=Round(new Rectangle(32,131,536,107),18))using(var brush=new SolidBrush(Color.FromArgb(237,231,243)))g.FillPath(brush,shadow);
        using(var card=Round(new Rectangle(32,127,536,107),18)){using(var brush=new SolidBrush(Color.White))g.FillPath(brush,card);using(var pen=new Pen(Color.FromArgb(223,211,232)))g.DrawPath(pen,card);}
        HuiMark.Draw(g,new Rectangle(32,30,76,76));
        g.Restore(saved);
    }
    int FreePort() { for(int i=3210;i<3310;i++){try{var l=new TcpListener(IPAddress.Loopback,i);l.Start();l.Stop();return i;}catch(SocketException){}}throw new Exception("没有可用的本地端口"); }
    async Task StartServer() {
        try {
            string root=AppDomain.CurrentDomain.BaseDirectory; string app=Directory.Exists(Path.Combine(root,"app"))?Path.Combine(root,"app"):root;
            if(File.Exists(Path.Combine(root,".hui-update","update.lock")))throw new Exception("升级正在进行或中断，请先使用升级助手完成更新或恢复。");
            string node=Path.Combine(root,"runtime","node.exe");if(!File.Exists(node))throw new Exception("缺少 runtime/node.exe，请完整解压便携包。");
            int port=FreePort(); address="http://127.0.0.1:"+port;
            job=CreateJobObject(IntPtr.Zero,null);if(job==IntPtr.Zero)throw new Exception("无法创建服务进程组");
            var limits=new ExtendedLimits();limits.Basic.Flags=0x2000;int size=Marshal.SizeOf(limits);IntPtr ptr=Marshal.AllocHGlobal(size);
            try{Marshal.StructureToPtr(limits,ptr,false);if(!SetInformationJobObject(job,9,ptr,(uint)size))throw new Exception("无法设置退出清理");}finally{Marshal.FreeHGlobal(ptr);}
            var info=new ProcessStartInfo(node,"\""+Path.Combine(app,"server.mjs")+"\""){WorkingDirectory=app,UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true}; info.EnvironmentVariables["PORT"]=port.ToString();
            server=new Process{StartInfo=info,EnableRaisingEvents=true};server.Start();
            if(!AssignProcessToJobObject(job,server.Handle))throw new Exception("无法管理服务进程生命周期");
            server.BeginOutputReadLine();server.BeginErrorReadLine();
            bool ready=false;
            for(int i=0;i<80&&!exiting;i++) { if(server.HasExited)throw new Exception("服务启动失败，请检查便携包文件是否完整。");try{using(var client=new WebClient()){string health=await client.DownloadStringTaskAsync(address+"/api/health");if(health.Contains("true")){ready=true;break;}}}catch{}await Task.Delay(100); }
            if(exiting)return;if(!ready)throw new Exception("服务启动超时");
            status.Text=address;state.Text="运行中";open.Enabled=true;if(Array.IndexOf(Environment.GetCommandLineArgs(),"--no-browser")<0)OpenBrowser();
            server.Exited+=(s,e)=>{if(!exiting&&IsHandleCreated)BeginInvoke(new Action(()=>{status.Text="服务已停止，请关闭后重新启动。";state.Text="已停止";open.Enabled=false;}));};
        } catch(Exception error){StopServer();state.Text="未启动";status.Text=error.Message;}
    }
    void OpenBrowser(){try{Process.Start(new ProcessStartInfo(address){UseShellExecute=true});}catch(Exception error){MessageBox.Show(error.Message,"绘");}}
    void StopServer(){exiting=true;if(job!=IntPtr.Zero){CloseHandle(job);job=IntPtr.Zero;}try{if(server!=null&&!server.HasExited){server.Kill();server.WaitForExit(3000);}}catch{} }
}

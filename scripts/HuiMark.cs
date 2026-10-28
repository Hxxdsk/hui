using System.Drawing;
using System.Drawing.Drawing2D;
public static class HuiMark {
 public static void Draw(Graphics g,Rectangle bounds){var saved=g.Save();g.TranslateTransform(bounds.X,bounds.Y);g.ScaleTransform(bounds.Width/64f,bounds.Height/64f);g.SmoothingMode=SmoothingMode.AntiAlias;
  using(var tile=new GraphicsPath()){tile.AddArc(1,1,34,34,180,90);tile.AddArc(29,1,34,34,270,90);tile.AddArc(29,29,34,34,0,90);tile.AddArc(1,29,34,34,90,90);tile.CloseFigure();using(var fill=new LinearGradientBrush(new Point(0,0),new Point(64,64),Color.FromArgb(244,237,250),Color.FromArgb(225,213,237)))g.FillPath(fill,tile);using(var pen=new Pen(Color.FromArgb(208,190,221),.8f))g.DrawPath(pen,tile);}
  using(var nib=new GraphicsPath()){nib.AddBezier(32,9,37,20,45,24,49,32);nib.AddBezier(49,32,49,42,40,51,32,56);nib.AddBezier(32,56,24,51,15,42,15,32);nib.AddBezier(15,32,19,24,27,20,32,9);nib.CloseFigure();using(var fill=new LinearGradientBrush(new Point(18,15),new Point(47,55),Color.FromArgb(137,107,160),Color.FromArgb(96,69,120)))g.FillPath(fill,nib);}
  using(var brush=new SolidBrush(Color.FromArgb(237,227,245)))g.FillEllipse(brush,28.5f,29.5f,7,7);
  using(var pen=new Pen(Color.FromArgb(237,227,245),2.2f)){pen.StartCap=LineCap.Round;g.DrawLine(pen,32,36,32,56);}
  using(var shine=new GraphicsPath()){shine.AddBezier(23,28,19,34,20,39,25,43);using(var pen=new Pen(Color.FromArgb(181,154,200),1.4f)){pen.StartCap=pen.EndCap=LineCap.Round;g.DrawPath(pen,shine);}}
  g.Restore(saved);
 }
}

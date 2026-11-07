using System.Drawing;
using System.Drawing.Drawing2D;
public static class HuiMark {
 public static void Draw(Graphics g,Rectangle bounds){var saved=g.Save();g.TranslateTransform(bounds.X,bounds.Y);g.ScaleTransform(bounds.Width/64f,bounds.Height/64f);g.SmoothingMode=SmoothingMode.AntiAlias;
  using(var tile=new GraphicsPath()){tile.AddArc(1,1,34,34,180,90);tile.AddArc(29,1,34,34,270,90);tile.AddArc(29,29,34,34,0,90);tile.AddArc(1,29,34,34,90,90);tile.CloseFigure();using(var fill=new LinearGradientBrush(new Point(0,0),new Point(64,64),Color.FromArgb(244,237,250),Color.FromArgb(225,213,237)))g.FillPath(fill,tile);using(var pen=new Pen(Color.FromArgb(208,190,221),.8f))g.DrawPath(pen,tile);}
  using(var outline=new Pen(Color.FromArgb(102,77,123),2.2f)){
   outline.LineJoin=LineJoin.Round;
   using(var crown=new GraphicsPath())
   using(var fill=new SolidBrush(Color.FromArgb(166,139,184))){
    crown.AddBezier(14,39,10,34,11,26,17,22);
    crown.AddBezier(17,22,18,16,25,13,31,15);
    crown.AddBezier(31,15,37,11,45,15,48,22);
    crown.AddBezier(48,22,54,25,56,32,51,39);
    crown.CloseFigure();
    g.FillPath(fill,crown);
    g.DrawPath(outline,crown);
   }
   using(var brim=new GraphicsPath())
   using(var fill=new SolidBrush(Color.FromArgb(253,247,253))){
    brim.AddBezier(13,36,20,40,43,41,51,36);
    brim.AddBezier(51,36,55,36,58,41,55,45);
    brim.AddBezier(55,45,52,49,47,49,44,47);
    brim.AddBezier(44,47,41,51,36,51,32,48);
    brim.AddBezier(32,48,28,51,23,51,20,47);
    brim.AddBezier(20,47,15,49,10,47,9,43);
    brim.AddBezier(9,43,8,40,10,37,13,36);
    brim.CloseFigure();
    g.FillPath(fill,brim);
    g.DrawPath(outline,brim);
   }
  }
  using(var band=new Pen(Color.FromArgb(182,120,153),3.2f)){
   band.StartCap=band.EndCap=LineCap.Round;
   g.DrawBezier(band,14,37,22,42,42,43,51,37);
  }
  using(var crescent=new GraphicsPath())
  using(var fill=new SolidBrush(Color.FromArgb(251,239,216))){
   crescent.AddBezier(37,24,33,26,33,31,37,33);
   crescent.AddBezier(37,33,31,35,27,30,29,26);
   crescent.AddBezier(29,26,30,23,34,22,37,24);
   g.FillPath(fill,crescent);
  }
  g.Restore(saved);
 }
}

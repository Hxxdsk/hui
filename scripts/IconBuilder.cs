using System;
using System.IO;
using System.Drawing;
using System.Drawing.Imaging;
using System.Collections.Generic;
class IconBuilder{
 static void Main(string[] args){var sizes=new[]{16,24,32,48,64,128,256};var images=new List<byte[]>();foreach(int size in sizes){using(var bitmap=new Bitmap(size,size)){using(var g=Graphics.FromImage(bitmap)){g.Clear(Color.Transparent);HuiMark.Draw(g,new Rectangle(0,0,size,size));}using(var ms=new MemoryStream()){bitmap.Save(ms,ImageFormat.Png);images.Add(ms.ToArray());}if(size==128&&args.Length>1)bitmap.Save(args[1],ImageFormat.Png);}}
 using(var writer=new BinaryWriter(File.Create(args[0]))){writer.Write((ushort)0);writer.Write((ushort)1);writer.Write((ushort)sizes.Length);int offset=6+16*sizes.Length;for(int i=0;i<sizes.Length;i++){writer.Write((byte)(sizes[i]==256?0:sizes[i]));writer.Write((byte)(sizes[i]==256?0:sizes[i]));writer.Write((byte)0);writer.Write((byte)0);writer.Write((ushort)1);writer.Write((ushort)32);writer.Write(images[i].Length);writer.Write(offset);offset+=images[i].Length;}foreach(var bytes in images)writer.Write(bytes);}
 }
}

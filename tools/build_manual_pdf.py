#!/usr/bin/env python3
"""Build the Chinese operating guide from the same source as the app's offline help."""
import re,html
from pathlib import Path
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,Table,TableStyle,PageBreak,Flowable,KeepTogether
R=Path(__file__).resolve().parents[1]
FONT=R/'build/android/manual-font.ttf'
if not FONT.exists():raise SystemExit('Need the build artifact manual-font.ttf')
pdfmetrics.registerFont(TTFont('Manual',str(FONT)))
INK=colors.HexColor('#183B35');GREEN=colors.HexColor('#16654E');GRAY=colors.HexColor('#63796F');PALE=colors.HexColor('#E6EDE4');LINE=colors.HexColor('#D8E2D9')
W,H=A4;WIDTH=W-88
styles={
'body':ParagraphStyle('Body',fontName='Manual',fontSize=10.5,leading=18,spaceAfter=10,textColor=INK,wordWrap='CJK',splitLongWords=True),
'h2':ParagraphStyle('H2',fontName='Manual',fontSize=20,leading=29,spaceAfter=20,textColor=INK,wordWrap='CJK',keepWithNext=True),
'cell':ParagraphStyle('Cell',fontName='Manual',fontSize=9.2,leading=14.5,textColor=INK,wordWrap='CJK'),
'head':ParagraphStyle('Head',fontName='Manual',fontSize=9.2,leading=14.5,textColor=colors.white,wordWrap='CJK'),
'small':ParagraphStyle('Small',fontName='Manual',fontSize=9,leading=15,textColor=GRAY,wordWrap='CJK',spaceAfter=8),
'quote':ParagraphStyle('Quote',fontName='Manual',fontSize=10,leading=17,textColor=INK,wordWrap='CJK',backColor=PALE,borderPadding=12,spaceBefore=12,spaceAfter=16,leftIndent=12,rightIndent=12),
'cover':ParagraphStyle('Cover',fontName='Manual',fontSize=34,leading=46,textColor=INK,wordWrap='CJK',spaceAfter=18),
'subtitle':ParagraphStyle('Subtitle',fontName='Manual',fontSize=22,leading=32,textColor=GREEN,spaceAfter=20,wordWrap='CJK')}
def inline(s):
 s=html.escape(s)
 return re.sub(r'https://[^\s&lt;&gt;]+',lambda m:'<link href="'+m.group()+'" color="#16654E">'+m.group()+'</link>',s)
def p(s,style='body'):return Paragraph(inline(s),styles[style])
class CoverMap(Flowable):
 def __init__(self):Flowable.__init__(self);self.width=WIDTH;self.height=126
 def draw(self):
  c=self.canv;gap=15;w=(WIDTH-gap*2)/3
  for i,(title,sub) in enumerate([('安卓 APP','填写 · 生成 · 分享'),('GitHub','任务 · 正文 · 凭证'),('电脑控制台','发送 · 检测 · 接力')]):
   x=i*(w+gap);c.setFillColor(PALE);c.roundRect(x,28,w,84,8,fill=1,stroke=0);c.setFillColor(INK);c.setFont('Manual',13);c.drawCentredString(x+w/2,80,title);c.setFont('Manual',9);c.drawCentredString(x+w/2,54,sub)
  c.setFillColor(GRAY);c.setFont('Manual',9);c.drawString(0,7,'普通聊天执行创作；系统负责交接，最终选题由你决定。')
class GuideDoc(SimpleDocTemplate):
 def afterFlowable(self,flowable):
  if isinstance(flowable,Paragraph) and flowable.style.name=='H2':
   title=flowable.getPlainText();key='section-'+str(self.page);self.canv.bookmarkPage(key);self.canv.addOutlineEntry(title,key,0,False)
def page(c,doc):
 c.saveState();c.setStrokeColor(LINE);c.line(44,42,W-44,42);c.setFont('Manual',8);c.setFillColor(GRAY);c.drawString(44,27,'小说自动接力系统  /  操作教程 RC2');c.drawRightString(W-44,27,str(doc.page))
 if doc.page>1:c.drawString(44,H-29,'安卓生成器 + GitHub + 电脑控制台');c.setStrokeColor(LINE);c.line(44,H-36,W-44,H-36)
 c.restoreState()
source=(R/'docs/06_整合系统说明书与操作教程.md').read_text('utf-8');lines=source.splitlines();story=[]
story += [Spacer(1,50),p('NOVEL RELAY / 使用指南','small'),p('小说自动接力系统','cover'),p('整合说明书\n与操作教程'.replace('\n',' '),'subtitle'),p('从手机生成匹配包，到电脑接上十角色创作。学堂地址可以自行更换，三本小说各自推进。'),Spacer(1,16),CoverMap(),Spacer(1,20)]
cover_rows=[[p('安卓生成器','head'),p('电脑控制台','head'),p('交接协议','head')],[p('1.0.0-RC2','cell'),p('0.2.0','cell'),p('AUTO-0.2.0-RC2','cell')]]
t=Table(cover_rows,colWidths=[WIDTH/3]*3);t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),INK),('BOX',(0,0),(-1,-1),.6,LINE),('GRID',(0,0),(-1,-1),.4,LINE),('TOPPADDING',(0,0),(-1,-1),10),('BOTTOMPADDING',(0,0),(-1,-1),10)]));story+=[t,Spacer(1,20),p('先跑通一本 1 至 2 章的验收样书，再启动三书并行。','body'),p('阅读顺序：第 01 至 04 节了解系统与手机 APP；第 05 至 08 节安装和启动；第 09 至 14 节运行、恢复、换学堂与验收。','small'),p('这是一套可安装的候选版本。自动检查和模拟器验证不能替代你的真实账号全流程验收。','small')]
i=next(i for i,l in enumerate(lines) if l.startswith('## '))
while i<len(lines):
 line=lines[i].strip()
 if not line:i+=1;continue
 if line.startswith('## '):story.extend([PageBreak(),p(line[3:],'h2')]);i+=1;continue
 if line.startswith('|'):
  rows=[]
  while i<len(lines) and lines[i].strip().startswith('|'):
   cells=[c.strip() for c in lines[i].strip().strip('|').split('|')]
   if not all(re.fullmatch(r'[:\- ]+',c) for c in cells):rows.append(cells)
   i+=1
  n=len(rows[0]);widths=[WIDTH*.24,WIDTH*.76] if n==2 else [WIDTH*.24,WIDTH*.33,WIDTH*.43]
  cells=[[p(c,'head' if j==0 else 'cell') for c in row] for j,row in enumerate(rows)]
  t=Table(cells,colWidths=widths,repeatRows=1,hAlign='LEFT');t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),INK),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,colors.HexColor('#F5F8F3')]),('GRID',(0,0),(-1,-1),.4,LINE),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),9),('RIGHTPADDING',(0,0),(-1,-1),9),('TOPPADDING',(0,0),(-1,-1),9),('BOTTOMPADDING',(0,0),(-1,-1),9)]));story.extend([t,Spacer(1,14)]);continue
 if line.startswith('> '):story.append(p(line[2:],'quote'))
 elif line.startswith('- '):story.append(p('• '+line[2:]))
 else:story.append(p(line))
 i+=1
out=R/'output/pdf';out.mkdir(parents=True,exist_ok=True)
path=out/'小说自动接力系统_整合说明书与操作教程_RC2.pdf'
doc=GuideDoc(str(path),pagesize=A4,leftMargin=44,rightMargin=44,topMargin=58,bottomMargin=56,title='小说自动接力系统：整合说明书与操作教程 RC2',author='小说接力系统',allowSplitting=1)
doc.build(story,onFirstPage=page,onLaterPages=page);print(path)

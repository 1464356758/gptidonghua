// 无依赖ZIP生成，UTF-8文件名，STORE。压缩不是正确生成ZIP的必要条件。
const enc=new TextEncoder();
const table=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc32(a){let c=0xffffffff;for(const b of a)c=table[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
function header(size){const a=new Uint8Array(size);return [a,new DataView(a.buffer)];}
function concat(parts){const out=new Uint8Array(parts.reduce((s,x)=>s+x.length,0));let p=0;for(const a of parts){out.set(a,p);p+=a.length;}return out;}
export function zip(files){
  const parts=[],central=[];let offset=0;
  for(const [name,text] of Object.entries(files)){
    const n=enc.encode(name),data=typeof text==='string'?enc.encode(text):text,crc=crc32(data);
    const [h,v]=header(30);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(12,0x21,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,n.length,true);
    parts.push(h,n,data);
    const [ch,cv]=header(46);cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x800,true);cv.setUint16(14,0x21,true);cv.setUint32(16,crc,true);cv.setUint32(20,data.length,true);cv.setUint32(24,data.length,true);cv.setUint16(28,n.length,true);cv.setUint32(42,offset,true);central.push(ch,n);offset+=30+n.length+data.length;
  }
  const cd=concat(central),[end,v]=header(22);v.setUint32(0,0x06054b50,true);v.setUint16(8,Object.keys(files).length,true);v.setUint16(10,Object.keys(files).length,true);v.setUint32(12,cd.length,true);v.setUint32(16,offset,true);
  return concat([...parts,cd,end]);
}

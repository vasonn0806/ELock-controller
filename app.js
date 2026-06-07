const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const logEl = $('#log');
const log = m => { logEl.textContent += `[${new Date().toLocaleTimeString()}] ${m}\n`; logEl.scrollTop = logEl.scrollHeight; };

// Tabs
$$('.tab').forEach(btn => btn.onclick = () => { $$('.tab,.panel').forEach(x=>x.classList.remove('active')); btn.classList.add('active'); $('#'+btn.dataset.tab).classList.add('active'); });

// Bluetooth layer - compatible with Alibaba Group 20190605 / DLG-CLOCK e-paper tags.
// The board uses a BLE writable characteristic and binary command packets.
const DEVICE_PROFILE = {
  optionalServices: [
    '0000ffe0-0000-1000-8000-00805f9b34fb', // common UART clone
    '6e400001-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART
    '0000fee0-0000-1000-8000-00805f9b34fb',
    '0000fee1-0000-1000-8000-00805f9b34fb',
    '0000fe01-0000-1000-8000-00805f9b34fb',
    '0000fe02-0000-1000-8000-00805f9b34fb',
    '0000ff00-0000-1000-8000-00805f9b34fb'
  ],
  serviceUUIDs: [
    '0000ffe0-0000-1000-8000-00805f9b34fb',
    '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
    '0000fee0-0000-1000-8000-00805f9b34fb',
    '0000fee1-0000-1000-8000-00805f9b34fb',
    '0000fe01-0000-1000-8000-00805f9b34fb',
    '0000fe02-0000-1000-8000-00805f9b34fb',
    '0000ff00-0000-1000-8000-00805f9b34fb'
  ],
  writeUUIDs: [
    '0000ffe1-0000-1000-8000-00805f9b34fb',
    '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
    '0000fee1-0000-1000-8000-00805f9b34fb',
    '0000fe02-0000-1000-8000-00805f9b34fb',
    '0000ff01-0000-1000-8000-00805f9b34fb',
    '0000ff02-0000-1000-8000-00805f9b34fb'
  ],
  notifyUUIDs:[
    '0000ffe1-0000-1000-8000-00805f9b34fb',
    '6e400003-b5a3-f393-e0a9-e50e24dcca9e',
    '0000fe01-0000-1000-8000-00805f9b34fb',
    '0000ff01-0000-1000-8000-00805f9b34fb'
  ]
};
let device, server, writeChar, notifyChar, epdChar, rxtxChar;

async function connect(){
  if(!navigator.bluetooth) throw new Error('This browser does not support Web Bluetooth. Use Chrome/Edge over HTTPS.');
  device = await navigator.bluetooth.requestDevice({
    acceptAllDevices:true,
    optionalServices:DEVICE_PROFILE.optionalServices
  });
  device.addEventListener('gattserverdisconnected',()=>{
    $('#btStatus').textContent='Disconnected';
    $('#btStatus').style.background='';
    log('Device disconnected');
  });
  server = await device.gatt.connect();
  log('GATT server found');
  await discoverWritableCharacteristics();
  if(!writeChar) throw new Error('Writable BLE characteristic not found. Update UUIDs in app.js for your e-paper device.');
  $('#btStatus').textContent = `Connected: ${device.name||'E-paper device'}`;
  $('#btStatus').style.background='#16a34a';
  log('Bluetooth connected');
}

async function discoverWritableCharacteristics(){
  writeChar = notifyChar = epdChar = rxtxChar = null;
  for(const su of DEVICE_PROFILE.serviceUUIDs){
    try{
      const service = await server.getPrimaryService(su);
      log(`Service found: ${shortUuid(service.uuid)}`);
      const chars = await service.getCharacteristics();
      for(const ch of chars){
        const p = ch.properties;
        const writable = p.write || p.writeWithoutResponse;
        if(writable){
          if(!writeChar) writeChar = ch;
          // The original web uses epdCharacteristic for time/update commands.
          // Prefer likely EPD service over UART service; fallback to first writable.
          if(service.uuid.includes('fe') || service.uuid.includes('ff')) epdChar = ch;
          if(service.uuid.includes('ffe0') || service.uuid.includes('6e400001')) rxtxChar = ch;
          log(`Writable characteristic: ${shortUuid(ch.uuid)}`);
        }
        if(p.notify || p.indicate){
          try{
            await ch.startNotifications();
            ch.addEventListener('characteristicvaluechanged', e=>log('RX '+hex(new Uint8Array(e.target.value.buffer))));
            notifyChar = ch;
            log(`Notify characteristic: ${shortUuid(ch.uuid)}`);
          }catch{}
        }
      }
    }catch{}
  }
  if(epdChar) writeChar = epdChar;
}

function shortUuid(uuid){ return String(uuid).replace('-0000-1000-8000-00805f9b34fb',''); }
async function writeToChar(characteristic, data){
  if(characteristic.properties.writeWithoutResponse) return characteristic.writeValueWithoutResponse(data);
  return characteristic.writeValue(data);
}
async function sendBytes(bytes, prefer='epd'){
  const data = bytes instanceof Uint8Array ? bytes : new TextEncoder().encode(String(bytes));
  const target = prefer==='rxtx' ? (rxtxChar || writeChar) : (epdChar || writeChar);
  if(!target){ log('Demo send: '+hex(data)); return; }
  const chunk = 180;
  for(let i=0;i<data.length;i+=chunk){ await writeToChar(target, data.slice(i,i+chunk)); await new Promise(r=>setTimeout(r,12)); }
  log('TX '+data.length+' bytes: '+hex(data));
}
const hex = a => [...a].map(x=>x.toString(16).padStart(2,'0')).join(' ');
function hexToBytes(str){
  const clean = String(str).replace(/[^0-9a-fA-F]/g,'');
  if(clean.length % 2) throw new Error('HEX command must have an even number of characters');
  return new Uint8Array(clean.match(/.{1,2}/g).map(x=>parseInt(x,16)));
}
const cmdPacket = cmd => hexToBytes(cmd); // Original control buttons send raw HEX like e102/e3/e5/AA.
$('#scanBtn').onclick = () => connect().catch(e=>log('BLE error: '+e.message));
$('#reconnectBtn').onclick = async()=>{ if(device?.gatt) {server=await device.gatt.connect(); await discoverWritableCharacteristics(); log('Reconnected');} else connect().catch(e=>log(e.message)); };
$('#clearLogBtn').onclick=()=>logEl.textContent='';
$$('[data-cmd]').forEach(b=>b.onclick=()=>sendBytes(cmdPacket(b.dataset.cmd), b.dataset.cmd?.toLowerCase().startsWith('e') ? 'rxtx':'epd').catch(e=>log('TX error: '+e.message)));
function localDateTimeValue(date = new Date()){
  return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
}
function epaperTimePacket(date){
  // DLG-CLOCK / Alibaba 20190605 command: DD + Unix timestamp (4 bytes, big-endian).
  // Example from original page log: DD 6A 26 60 6A.
  const seconds = Math.floor(date.getTime()/1000);
  return new Uint8Array([
    0xdd,
    (seconds >>> 24) & 0xff,
    (seconds >>> 16) & 0xff,
    (seconds >>> 8) & 0xff,
    seconds & 0xff
  ]);
}
function setTimeFromInput(){
  const value = $('#timeInput').value || localDateTimeValue();
  $('#timeInput').value = value;
  const date = new Date(value);
  const packet = epaperTimePacket(date);
  sendBytes(packet, 'epd').then(()=>log(`Time set to: ${date.toLocaleTimeString()} : ${hex(packet).replaceAll(' ','')}`)).catch(e=>log('Set Time error: '+e.message));
}
$('#timeInput').value = localDateTimeValue();
$('#timeInput').onchange=setTimeFromInput;
$('#timeInput').onblur=setTimeFromInput;
$('#setTimeBtn').onclick=setTimeFromInput;
$('#enableSleep').onclick=()=>sendBytes(hexToBytes(`FB01${(+$('#sleepStart').value||0).toString(16).padStart(2,'0')}${(+$('#sleepEnd').value||0).toString(16).padStart(2,'0')}`),'rxtx');
$('#disableSleep').onclick=()=>sendBytes(hexToBytes('FB00'),'rxtx');
$('#setNumberBtn').onclick=()=>{
  const n = String($('#numberInput').value || '').trim();
  const bytes = new TextEncoder().encode(n);
  const packet = new Uint8Array(1+bytes.length); packet[0]=0xdc; packet.set(bytes,1);
  sendBytes(packet,'epd');
};

// Countdown canvas
const cc=$('#countCanvas'), cctx=cc.getContext('2d'); let timer;
function drawCountdown(){
  const target = new Date($('#countDate').value || Date.now());
  const days = Math.max(0, Math.ceil((target - new Date())/86400000));
  const inv=$('#countInvert').checked; cctx.fillStyle=inv?'#000':'#fff'; cctx.fillRect(0,0,cc.width,cc.height);
  if($('#countGrid').checked){cctx.strokeStyle=inv?'#333':'#e5e7eb'; for(let x=0;x<cc.width;x+=20){cctx.beginPath();cctx.moveTo(x,0);cctx.lineTo(x,cc.height);cctx.stroke()} for(let y=0;y<cc.height;y+=20){cctx.beginPath();cctx.moveTo(0,y);cctx.lineTo(cc.width,y);cctx.stroke()}}
  cctx.fillStyle=inv?'#fff':'#000'; cctx.textAlign='center'; cctx.font=`bold ${72*$('#countSize').value/100}px ${$('#countFont').value}`; cctx.fillText(days+' DAYS',cc.width/2,135); cctx.font=`${36*$('#countSize').value/100}px ${$('#countFont').value}`; cctx.fillText($('#countText').value,cc.width/2,205);
}
$('#countSize').oninput=()=>{$('#countSizeText').textContent=$('#countSize').value+'%';drawCountdown()};
['countDate','countText','countFont','countInvert','countGrid'].forEach(id=>$('#'+id).oninput=drawCountdown);
$('#applyCountdown').onclick=drawCountdown; $('#startCountdown').onclick=()=>{clearInterval(timer); timer=setInterval(drawCountdown,1000); log('Countdown started')}; $('#stopCountdown').onclick=()=>{clearInterval(timer); log('Countdown stopped')}; $('#sendCountdown').onclick=()=>sendCanvas(cc,'COUNTDOWN'); drawCountdown();

// Image transfer
const ic=$('#imgCanvas'), ictx=ic.getContext('2d'); let srcImg=null, imgState={rot:0,scale:1,mode:'fit'};
$('#screenSize').onchange=()=>{const [w,h]=$('#screenSize').value.split('x').map(Number); ic.width=w;ic.height=h; dc.width=w;dc.height=h; renderImage(); renderDesign();};
$('#imageInput').onchange=e=>loadImageFile(e.target.files[0], img=>{srcImg=img; renderImage();});
function loadImageFile(file, cb){ if(!file)return; const img=new Image(); img.onload=()=>cb(img); img.src=URL.createObjectURL(file); }
function renderImage(){ ictx.clearRect(0,0,ic.width,ic.height); if(!srcImg){ictx.fillStyle='#fff';ictx.fillRect(0,0,ic.width,ic.height);ictx.fillStyle='#94a3b8';ictx.textAlign='center';ictx.fillText('Upload image',ic.width/2,ic.height/2);return;}
  const b=$('#brightness').value/100,c=$('#contrast').value/100,s=$('#saturation').value/100; ictx.filter=`brightness(${b}) contrast(${c}) saturate(${s})`;
  ictx.save(); ictx.translate(ic.width/2,ic.height/2); ictx.rotate((Number($('#rotation').value)+imgState.rot)*Math.PI/180);
  let scale = $('#scale').value/100; const fit=Math.min(ic.width/srcImg.width, ic.height/srcImg.height); const stretch= imgState.mode==='stretch';
  if(stretch) ictx.drawImage(srcImg,-ic.width*scale/2,-ic.height*scale/2,ic.width*scale,ic.height*scale); else ictx.drawImage(srcImg,-srcImg.width*fit*scale/2,-srcImg.height*fit*scale/2,srcImg.width*fit*scale,srcImg.height*fit*scale);
  ictx.restore(); ictx.filter='none'; applyDither(); }
function applyDither(){ const img=ictx.getImageData(0,0,ic.width,ic.height), d=img.data, th=Number($('#threshold').value), mode=$('#dither').value; const lum=i=>0.299*d[i]+0.587*d[i+1]+0.114*d[i+2];
  if(mode==='none'||mode==='bayer'){ const mat=[[15,135,45,165],[195,75,225,105],[60,180,30,150],[240,120,210,90]]; for(let y=0;y<ic.height;y++)for(let x=0;x<ic.width;x++){let i=(y*ic.width+x)*4; let t=mode==='bayer'?mat[y%4][x%4]:th; let v=lum(i)>t?255:0; d[i]=d[i+1]=d[i+2]=v;} ictx.putImageData(img,0,0); return; }
  let gray=new Float32Array(ic.width*ic.height); for(let i=0,p=0;i<d.length;i+=4,p++)gray[p]=lum(i);
  const spread=(x,y,err,f)=>{if(x>=0&&x<ic.width&&y>=0&&y<ic.height)gray[y*ic.width+x]+=err*f*($('#diffusion').value/50)};
  for(let y=0;y<ic.height;y++)for(let x=0;x<ic.width;x++){let p=y*ic.width+x, old=gray[p], nv=old>th?255:0, err=old-nv; gray[p]=nv; if(mode==='floyd'){spread(x+1,y,err,7/16);spread(x-1,y+1,err,3/16);spread(x,y+1,err,5/16);spread(x+1,y+1,err,1/16)} else {[[1,0],[2,0],[-1,1],[0,1],[1,1],[0,2]].forEach(([dx,dy])=>spread(x+dx,y+dy,err,1/8));}}
  for(let p=0,i=0;p<gray.length;p++,i+=4)d[i]=d[i+1]=d[i+2]=gray[p]>128?255:0; ictx.putImageData(img,0,0);
}
['brightness','contrast','saturation','threshold','diffusion','scale','rotation','dither'].forEach(id=>$('#'+id).oninput=renderImage); $('#applyImg').onclick=renderImage; $('#stretchImg').onclick=()=>{imgState.mode='stretch';renderImage()}; $('#fitImg').onclick=()=>{imgState.mode='fit';renderImage()}; $('#rotateCW').onclick=()=>{imgState.rot+=90;renderImage()}; $('#rotateCCW').onclick=()=>{imgState.rot-=90;renderImage()}; $('#resetImg').onclick=()=>{imgState={rot:0,scale:1,mode:'fit'};$('#scale').value=100;$('#rotation').value=0;renderImage()}; $('#downloadImg').onclick=()=>downloadCanvas(ic,'epaper-image.png'); $('#uploadImg').onclick=()=>sendCanvas(ic,'IMAGE'); renderImage();

// Designer
const dc=$('#designCanvas'), dctx=dc.getContext('2d'); let els=[], selected=-1, dragging=false, last={x:0,y:0};
function addEl(type){ const el={type,x:80,y:80,w:130,h:70,rot:0,color:$('#fillColor').value,text:$('#customText').value,font:$('#fontFamily').value,size:Number($('#fontSize').value),bold:false,italic:false,underline:false}; if(type==='Line'){el.h=2} els.push(el); selected=els.length-1; renderDesign(); }
$('#addElement').onclick=()=>addEl($('#elementType').value); $('#applyColor').onclick=()=>{sel(e=>e.color=$('#fillColor').value)}; $('#updateText').onclick=()=>{sel(e=>{e.text=$('#customText').value;e.font=$('#fontFamily').value;e.size=Number($('#fontSize').value)})}; ['bold','italic','underline'].forEach(k=>$('#'+k+'Btn').onclick=()=>sel(e=>e[k]=!e[k])); $('#applySize').onclick=()=>sel(e=>{e.w=Number($('#elW').value)||e.w;e.h=Number($('#elH').value)||e.h}); $('#applyRot').onclick=()=>sel(e=>e.rot=Number($('#elRot').value)||0); $('#deleteEl').onclick=()=>{if(selected>-1){els.splice(selected,1);selected=-1;renderDesign()}}; $('#copyEl').onclick=()=>{if(selected>-1){els.push({...els[selected],x:els[selected].x+20,y:els[selected].y+20});selected=els.length-1;renderDesign()}}; $('#frontEl').onclick=()=>{if(selected>-1){els.push(els.splice(selected,1)[0]);selected=els.length-1;renderDesign()}}; $('#backEl').onclick=()=>{if(selected>-1){els.unshift(els.splice(selected,1)[0]);selected=0;renderDesign()}};
[['moveUp',0,-5],['moveDown',0,5],['moveLeft',-5,0],['moveRight',5,0]].forEach(([id,dx,dy])=>$('#'+id).onclick=()=>sel(e=>{e.x+=dx;e.y+=dy}));
function sel(fn){ if(selected>-1){fn(els[selected]); renderDesign();} }
function renderDesign(){ dctx.fillStyle='#fff'; dctx.fillRect(0,0,dc.width,dc.height); els.forEach((e,i)=>{dctx.save();dctx.translate(e.x+e.w/2,e.y+e.h/2);dctx.rotate(e.rot*Math.PI/180);dctx.fillStyle=dctx.strokeStyle=e.color; if(e.type==='Text'){dctx.font=`${e.italic?'italic ':''}${e.bold?'bold ':''}${e.size}px ${e.font}`; dctx.textBaseline='middle'; dctx.textAlign='center'; dctx.fillText(e.text,0,0); if(e.underline){let m=dctx.measureText(e.text).width; dctx.fillRect(-m/2,8,m,2)}} else if(e.type==='Rectangle')dctx.fillRect(-e.w/2,-e.h/2,e.w,e.h); else if(e.type==='Circle'){dctx.beginPath();dctx.ellipse(0,0,e.w/2,e.h/2,0,0,Math.PI*2);dctx.fill()} else if(e.type==='Triangle'){dctx.beginPath();dctx.moveTo(0,-e.h/2);dctx.lineTo(e.w/2,e.h/2);dctx.lineTo(-e.w/2,e.h/2);dctx.closePath();dctx.fill()} else if(e.type==='Line'){dctx.lineWidth=Math.max(2,e.h);dctx.beginPath();dctx.moveTo(-e.w/2,0);dctx.lineTo(e.w/2,0);dctx.stroke()} else if(e.type==='Star'){star(dctx,0,0,5,e.w/2,e.w/4);dctx.fill()} else {dctx.strokeRect(-e.w/2,-e.h/2,e.w,e.h);dctx.fillText('ICON',0,0)} dctx.restore(); if(i===selected){dctx.strokeStyle='#2563eb';dctx.setLineDash([4,3]);dctx.strokeRect(e.x,e.y,e.w,e.h);dctx.setLineDash([])}}); }
function star(ctx,x,y,p,outer,inner){ctx.beginPath();for(let i=0;i<p*2;i++){let r=i%2?inner:outer,a=Math.PI*i/p-Math.PI/2;ctx[i?'lineTo':'moveTo'](x+Math.cos(a)*r,y+Math.sin(a)*r)}ctx.closePath()}
dc.onmousedown=e=>{const r=dc.getBoundingClientRect(),x=(e.clientX-r.left)*dc.width/r.width,y=(e.clientY-r.top)*dc.height/r.height; selected=els.findLastIndex(el=>x>=el.x&&x<=el.x+el.w&&y>=el.y&&y<=el.y+el.h); dragging=selected>-1; last={x,y}; renderDesign();}; dc.onmousemove=e=>{if(!dragging)return;const r=dc.getBoundingClientRect(),x=(e.clientX-r.left)*dc.width/r.width,y=(e.clientY-r.top)*dc.height/r.height;els[selected].x+=x-last.x;els[selected].y+=y-last.y;last={x,y};renderDesign()}; window.onmouseup=()=>dragging=false;
$('#makeQr').onclick=()=>{addEl('Rectangle'); els[selected].text='QR'; els[selected].w=90; els[selected].h=90; log('QR placeholder added. For production, connect a QR library such as qrcode.min.js.');};
$('#applyTemplate').onclick=()=>{els=[]; const t=$('#template').value; if(t==='Namecard'){els=[{type:'Text',x:30,y:50,w:330,h:50,text:'NAME CARD',color:'#000',font:'Arial',size:32,bold:true,italic:false,underline:false,rot:0},{type:'Line',x:40,y:115,w:300,h:3,color:'#000',rot:0},{type:'Text',x:45,y:150,w:300,h:40,text:'www.example.com',color:'#000',font:'Arial',size:20,bold:false,italic:false,underline:false,rot:0}] } else if(t==='NoteMemo'){els=[{type:'Text',x:30,y:30,w:330,h:40,text:'NOTE MEMO',color:'#000',font:'Arial',size:30,bold:true,italic:false,underline:false,rot:0},...Array.from({length:6},(_,i)=>({type:'Line',x:35,y:95+i*30,w:320,h:2,color:'#000',rot:0}))]} else if(t==='WIFI'){els=[{type:'Text',x:60,y:45,w:280,h:60,text:'WIFI',color:'#000',font:'Arial',size:48,bold:true,italic:false,underline:false,rot:0},{type:'Text',x:55,y:130,w:290,h:40,text:'SSID / PASSWORD',color:'#000',font:'Arial',size:24,bold:false,italic:false,underline:false,rot:0}]} else {els=[{type:'Rectangle',x:20,y:20,w:dc.width-40,h:dc.height-40,color:'#000',rot:0}]}; selected=0; renderDesign();};
$('#bgInput').onchange=e=>loadImageFile(e.target.files[0], img=>{els.unshift({type:'Image/Icon',x:0,y:0,w:dc.width,h:dc.height,color:'#999',rot:0,text:'BG'}); renderDesign(); dctx.drawImage(img,0,0,dc.width,dc.height);}); $('#clearCanvas').onclick=()=>{els=[];selected=-1;renderDesign()}; $('#saveCanvas').onclick=()=>downloadCanvas(dc,'template.png'); $('#sendDesigner').onclick=()=>{copyCanvas(dc,ic); document.querySelector('[data-tab="transfer"]').click();}; renderDesign();

async function sendCanvas(canvas,label){ const blob = await new Promise(r=>canvas.toBlob(r,'image/png')); const arr = new Uint8Array(await blob.arrayBuffer()); const header = new TextEncoder().encode(`IMG:${label}:${canvas.width}x${canvas.height}:${arr.length}\n`); const joined = new Uint8Array(header.length+arr.length); joined.set(header); joined.set(arr,header.length); await sendBytes(joined); }
function downloadCanvas(canvas,name){ const a=document.createElement('a'); a.href=canvas.toDataURL('image/png'); a.download=name; a.click(); }
function copyCanvas(src,dst){ dst.width=src.width;dst.height=src.height;dst.getContext('2d').drawImage(src,0,0); }

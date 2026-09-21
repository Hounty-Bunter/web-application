'use strict';

const APP_VERSION='1.0.0';
const DB_NAME='modiriat-mali-db';
const DB_VERSION=1;
const STORES=['kv','transactions','accounts','assets','debts','claims','goals','installments','goldHistory'];
const app=document.getElementById('app');
const toastEl=document.getElementById('toast');
let db;
let state={view:'home', unlocked:false, month:'1405/07', quickPreset:null};

const faDigits='۰۱۲۳۴۵۶۷۸۹';
const enDigits='0123456789';
const toFa=s=>String(s??'').replace(/\d/g,d=>faDigits[d]);
const toEn=s=>String(s??'').replace(/[۰-۹]/g,d=>enDigits[faDigits.indexOf(d)]).replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
const money=n=>toFa(new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(Math.round(Number(n)||0)))+' تومان';
const shortMoney=n=>{n=Number(n)||0; if(Math.abs(n)>=1e9)return toFa((n/1e9).toFixed(1))+' میلیارد'; if(Math.abs(n)>=1e6)return toFa((n/1e6).toFixed(n%1e6?1:0))+' میلیون'; if(Math.abs(n)>=1e3)return toFa((n/1e3).toFixed(0))+' هزار'; return toFa(n);};
const pct=n=>toFa((Number(n)||0).toFixed(1))+'٪';
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
const uid=(p='id')=>`${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
const todayISO=()=>new Date().toISOString().slice(0,10);
const monthOf=j=>String(j||'').slice(0,7);
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

function toast(msg){toastEl.textContent=msg;toastEl.classList.add('show');clearTimeout(toast._t);toast._t=setTimeout(()=>toastEl.classList.remove('show'),2600)}

// Jalali conversion (adapted from the widely used integer Jalaali algorithm)
function div(a,b){return ~~(a/b)}
function mod(a,b){return a-~~(a/b)*b}
function jalCal(jy){const breaks=[-61,9,38,199,426,686,756,818,1111,1181,1210,1635,2060,2097,2192,2262,2324,2394,2456,3178];let bl=breaks.length,gy=jy+621,leapJ=-14,jp=breaks[0],jm,jump,leap,leapG,march,n,i;if(jy<jp||jy>=breaks[bl-1])throw Error('Invalid Jalaali year '+jy);for(i=1;i<bl;i++){jm=breaks[i];jump=jm-jp;if(jy<jm)break;leapJ=leapJ+div(jump,33)*8+div(mod(jump,33),4);jp=jm}n=jy-jp;leapJ=leapJ+div(n,33)*8+div(mod(n,33)+3,4);if(mod(jump,33)===4&&jump-n===4)leapJ+=1;leapG=div(gy,4)-div((div(gy,100)+1)*3,4)-150;march=20+leapJ-leapG;if(jump-n<6)n=n-jump+div(jump+4,33)*33;leap=mod(mod(n+1,33)-1,4);if(leap===-1)leap=4;return{leap,gy,march}}
function g2d(gy,gm,gd){let d=div((gy+div(gm-8,6)+100100)*1461,4)+div(153*mod(gm+9,12)+2,5)+gd-34840408;d=d-div(div(gy+100100+div(gm-8,6),100)*3,4)+752;return d}
function d2g(jdn){let j=4*jdn+139361631;j=j+div(div(4*jdn+183187720,146097)*3,4)*4-3908;let i=div(mod(j,1461),4)*5+308;let gd=div(mod(i,153),5)+1,gm=mod(div(i,153),12)+1,gy=div(j,1461)-100100+div(8-gm,6);return{gy,gm,gd}}
function j2d(jy,jm,jd){let r=jalCal(jy);return g2d(r.gy,3,r.march)+(jm-1)*31-div(jm,7)*(jm-7)+jd-1}
function d2j(jdn){let g=d2g(jdn),jy=g.gy-621,r=jalCal(jy),jdn1f=g2d(g.gy,3,r.march),k=jdn-jdn1f;if(k>=0){if(k<=185)return{jy,jm:1+div(k,31),jd:mod(k,31)+1};k-=186}else{jy-=1;k+=179;if(r.leap===1)k+=1}return{jy,jm:7+div(k,30),jd:mod(k,30)+1}}
function gregToJalali(date=new Date()){const j=d2j(g2d(date.getFullYear(),date.getMonth()+1,date.getDate()));return `${j.jy}/${String(j.jm).padStart(2,'0')}/${String(j.jd).padStart(2,'0')}`}
function validJDate(v){v=toEn(v).trim();return /^14\d{2}\/(0[1-9]|1[0-2])\/([0-2]\d|3[01])$/.test(v)}
function nextJMonth(m,offset=1){let [y,mo]=toEn(m).split('/').map(Number);mo+=offset;while(mo>12){mo-=12;y++}while(mo<1){mo+=12;y--}return `${y}/${String(mo).padStart(2,'0')}`}
function monthLabel(m){const names=['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];const [y,mo]=toEn(m).split('/').map(Number);return `${names[(mo||1)-1]} ${toFa(y)}`}

function openDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,DB_VERSION);r.onupgradeneeded=()=>{const d=r.result;for(const s of STORES)if(!d.objectStoreNames.contains(s))d.createObjectStore(s,{keyPath:'id'})};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
function store(name,mode='readonly'){return db.transaction(name,mode).objectStore(name)}
function getAll(name){return new Promise((res,rej)=>{const r=store(name).getAll();r.onsuccess=()=>res(r.result||[]);r.onerror=()=>rej(r.error)})}
function getOne(name,id){return new Promise((res,rej)=>{const r=store(name).get(id);r.onsuccess=()=>res(r.result||null);r.onerror=()=>rej(r.error)})}
function put(name,obj){return new Promise((res,rej)=>{const r=store(name,'readwrite').put(obj);r.onsuccess=()=>res(obj);r.onerror=()=>rej(r.error)})}
function del(name,id){return new Promise((res,rej)=>{const r=store(name,'readwrite').delete(id);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
function clearStore(name){return new Promise((res,rej)=>{const r=store(name,'readwrite').clear();r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
async function kvGet(id,def=null){const x=await getOne('kv',id);return x?x.value:def}
async function kvSet(id,value){return put('kv',{id,value})}

const defaults={
 settings:{
  startDate:'1405/07/01', baseSalary:20000000, essentialBudget:10000000, freeMoneyTarget:10000000,
  debtOpening:14000000, debtMonthsTarget:5, insuranceBiMonthly:2000000, insuranceMonthlyReserve:1000000,
  variableBad:12000000, variableAverage:24000000, variableBest:35000000,
  carGoalMin:500000000, carGoalMax:700000000, carPersonalTarget:500000000, carMonths:6,
  goldGrams:6, phoneValue:160000000, phoneReplacementCost:null, workingCapital:14000000,
  risk:'متوسط', theme:'system', persianDigits:true,
  goldPrice:0, lastGoldUpdate:null, goldApiUrl:'', goldApiKey:'', goldApiUnit:'toman', goldApiHeader:'X-API-Key',
  vpnRule:'سود خالص VPN تا زمان تسویه بدهی، برای بدهی استفاده شود.',
  coreRule:'حقوق و پورسانت ابتدا هزینه ضروری، اقساط و ذخیره بیمه را پوشش دهند؛ مازاد به هدف ماشین برود.'
 }
};

async function seed(){
 const initialized=await kvGet('initialized',false); if(initialized)return;
 await kvSet('settings',defaults.settings);
 await put('debts',{id:'debt-main',title:'بدهی شخصی',opening:14000000,paidBefore:0,note:'هدف تسویه طی ۴ تا ۵ ماه از سود خالص VPN',created:'1405/07/01'});
 const plans=[['1405/07',19000000],['1405/08',19000000],['1405/09',19000000],['1405/10',11400000]];
 for(const [m,a] of plans)await put('installments',{id:'inst-'+m.replace('/','-'),month:m,amount:a,title:'اقساط برنامه‌ریزی‌شده'});
 await put('assets',{id:'asset-gold',type:'gold',title:'طلای ۱۸ عیار',qty:6,unit:'گرم',manualValue:0,carEligible:true,note:'قیمت روز از تنظیمات طلا'});
 await put('assets',{id:'asset-phone',type:'item',title:'گوشی',qty:1,unit:'عدد',manualValue:160000000,carEligible:true,note:'در صورت نیاز برای خرید ماشین فروخته می‌شود'});
 await put('assets',{id:'asset-working',type:'working',title:'کالای در گردش',qty:1,unit:'سرمایه',manualValue:14000000,carEligible:false,note:'برای تداوم کسب‌وکار؛ از هدف ماشین جدا'});
 await put('goals',{id:'goal-car',title:'خرید ماشین',target:500000000,targetMax:700000000,horizonMonths:6,priority:1,note:'هدف: حداقل ۵۰۰ میلیون تومان از سرمایه شخصی'});
 await put('goals',{id:'goal-home-items',title:'خرید اقساطی وسایل خانه',target:0,horizonMonths:12,priority:2,note:'هدف یک‌ساله؛ مبلغ قابل تنظیم'});
 await put('goals',{id:'goal-rent',title:'رهن و اجاره خانه',target:0,horizonMonths:36,priority:3,note:'هدف چندساله؛ مبلغ قابل تنظیم'});
 await kvSet('initialized',true);
}

function signedAmount(t){const plus=['income_salary','income_commission','income_vpn','income_other','transfer_in'];return plus.includes(t.kind)?Number(t.amount||0):-Number(t.amount||0)}
const kindMeta={
 income_salary:['حقوق','درآمد','in'],income_commission:['پورسانت','درآمد','in'],income_vpn:['فروش VPN','VPN','in'],income_other:['سایر درآمد','درآمد','in'],
 expense_essential:['هزینه ضروری','هزینه','out'],expense_free:['هزینه آزاد','هزینه','out'],expense_vpn:['هزینه VPN','VPN','out'],insurance:['بیمه','بیمه','out'],
 installment:['قسط','اقساط','out'],debt_payment:['پرداخت بدهی','بدهی','out'],car_saving:['صندوق ماشین','هدف ماشین','out'],savings:['پس‌انداز','پس‌انداز','out'],investment:['سرمایه‌گذاری','سرمایه','out'],
 transfer_in:['انتقال ورودی','انتقال','in'],transfer_out:['انتقال خروجی','انتقال','out']
};
function transactionName(k){return (kindMeta[k]||[k])[0]}

async function settings(){return await kvGet('settings',defaults.settings)}
async function saveSettingsPatch(patch){const s={...(await settings()),...patch};await kvSet('settings',s);applyTheme(s.theme);return s}
function applyTheme(theme){let t=theme;if(theme==='system')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=t;document.querySelector('meta[name="theme-color"]').setAttribute('content',t==='dark'?'#050a12':'#0a66ff')}

async function monthlyData(month){
 const tx=(await getAll('transactions')).filter(t=>monthOf(t.date)===month);
 const sum=kinds=>tx.filter(t=>kinds.includes(t.kind)).reduce((a,t)=>a+Number(t.amount||0),0);
 const salary=sum(['income_salary']),commission=sum(['income_commission']),vpnIncome=sum(['income_vpn']),otherIncome=sum(['income_other']);
 const essential=sum(['expense_essential']),free=sum(['expense_free']),vpnCost=sum(['expense_vpn']),insurance=sum(['insurance']),installment=sum(['installment']);
 const debtPay=sum(['debt_payment']),vpnDebtPay=tx.filter(t=>t.kind==='debt_payment'&&t.fundSource==='vpn').reduce((a,t)=>a+Number(t.amount||0),0),carSaving=sum(['car_saving']),saving=sum(['savings']),investment=sum(['investment']);
 const income=salary+commission+vpnIncome+otherIncome;
 const spending=essential+free+vpnCost+insurance+installment+debtPay;
 return{tx,salary,commission,vpnIncome,otherIncome,income,essential,free,vpnCost,insurance,installment,debtPay,vpnDebtPay,carSaving,saving,investment,spending,vpnNet:vpnIncome-vpnCost,coreIncome:salary+commission+otherIncome,variable:commission+vpnIncome+otherIncome};
}

async function dailyData(date){
 const tx=(await getAll('transactions')).filter(t=>t.date===date);
 let incoming=0,outgoing=0;
 for(const t of tx){const v=signedAmount(t);if(v>0)incoming+=v;else outgoing+=Math.abs(v)}
 return{incoming,outgoing,net:incoming-outgoing,count:tx.length};
}

async function accountBalance(a){const tx=(await getAll('transactions')).filter(t=>t.accountId===a.id);return Number(a.opening||0)+tx.reduce((x,t)=>x+signedAmount(t),0)}
async function debtStats(){const debts=await getAll('debts'),tx=await getAll('transactions');let opening=0,paid=0;for(const d of debts){opening+=Number(d.opening||0);paid+=Number(d.paidBefore||0)}paid+=tx.filter(t=>t.kind==='debt_payment').reduce((a,t)=>a+Number(t.amount||0),0);return{opening,paid,remaining:Math.max(0,opening-paid)}}
async function claimsStats(){const cs=await getAll('claims');const total=cs.reduce((a,c)=>a+Number(c.amount||0),0),received=cs.reduce((a,c)=>a+Number(c.received||0),0);return{total,received,remaining:Math.max(0,total-received)}}
async function assetsStats(){const s=await settings(),assets=await getAll('assets');let total=0,gold=0,working=0,phone=0;for(const a of assets){let v=0;if(a.type==='gold'){v=Number(a.qty||0)*Number(s.goldPrice||0);gold+=v}else v=Number(a.manualValue||0);if(a.type==='working')working+=v;if(a.id==='asset-phone')phone=v;total+=v}return{total,gold,working,phone,assets}}

let selectedBet=null,countdown=30,timerInterval=null,roundHistory=[];
const colorHex={red:'#ef4444',green:'#22c55e',violet:'#a855f7'};
function updateNavBal(){document.getElementById('navBal').textContent='₹'+parseFloat(localStorage.getItem('balance')||0).toFixed(2);}
function buildNumGrid(){
  const g=document.getElementById('numGrid');g.innerHTML='';
  for(let i=0;i<10;i++){
    const b=document.createElement('button');
    b.textContent=i;b.style.cssText='background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.09);color:white;padding:10px;border-radius:8px;font-weight:700;font-size:16px;cursor:pointer;transition:all 0.15s;';
    b.onmouseover=()=>b.style.background='rgba(212,160,23,0.15)';
    b.onmouseout=()=>b.style.background='rgba(255,255,255,0.05)';
    b.onclick=()=>selectBet(i.toString());g.appendChild(b);
  }
}
function selectBet(val){
  selectedBet=val;
  document.getElementById('selectedBet').textContent='Selected: '+val.toString().toUpperCase();
}
function showAlert(msg,type='error'){
  const b=document.getElementById('alertBox');
  b.innerHTML=`<div class="alert alert-${type}">${msg}</div>`;
  setTimeout(()=>b.innerHTML='',4000);
}
async function placeBet(){
  if(!selectedBet&&selectedBet!==0){showAlert('Select a color or number first!');return;}
  if(!localStorage.getItem('token')){window.location.href='login.html';return;}
  if(countdown<5){showAlert('Round closing! Wait for next.','info');return;}
  const betAmount=parseFloat(document.getElementById('betAmt').value);
  if(!betAmount||betAmount<1){showAlert('Enter valid bet amount');return;}
  const btn=document.getElementById('betBtn');btn.disabled=true;btn.textContent='Processing...';
  try{
    const res=await fetch('/api/game/wingo/bet',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+localStorage.getItem('token')},body:JSON.stringify({betAmount,betOn:selectedBet.toString()})});
    const data=await res.json();
    if(!res.ok){showAlert(data.msg);btn.disabled=false;btn.textContent='CONFIRM BET';return;}
    const ball=document.getElementById('resultBall');
    ball.textContent=data.result;
    ball.style.background=colorHex[data.resultColor];
    ball.style.boxShadow=`0 0 30px ${colorHex[data.resultColor]}60`;
    roundHistory.unshift({result:data.result,color:data.resultColor});
    if(roundHistory.length>15)roundHistory.pop();
    renderHistory();
    if(data.won){
      localStorage.setItem('balance',data.newBalance);updateNavBal();
      showAlert(`🎉 WON! +₹${data.payout} (${data.multiplier}×)`,'success');
    }else{
      showAlert(`❌ Lost. Result: ${data.result} (${data.resultColor})`,'error');
    }
  }catch{showAlert('Server error. Try again.');}
  btn.disabled=false;btn.textContent='CONFIRM BET';
  selectedBet=null;document.getElementById('selectedBet').textContent='';
}
function renderHistory(){
  document.getElementById('historyGrid').innerHTML=roundHistory.map(h=>
    `<span style="background:${colorHex[h.color]};color:${h.color==='green'?'#000':'#fff'};width:34px;height:34px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-weight:900;font-size:15px;">${h.result}</span>`
  ).join('');
}
function startTimer(){
  countdown=30;
  document.getElementById('roundId').textContent='Period #'+Date.now().toString().slice(-8);
  if(timerInterval)clearInterval(timerInterval);
  timerInterval=setInterval(()=>{
    countdown--;
    const t=document.getElementById('timer');
    t.textContent=countdown<10?'0'+countdown:countdown;
    t.style.color=countdown<=5?'var(--red)':'var(--gold)';
    const btn=document.getElementById('betBtn');
    btn.disabled=countdown<=5;btn.style.opacity=countdown<=5?'0.4':'1';
    if(countdown<=0){clearInterval(timerInterval);startTimer();}
  },1000);
}
buildNumGrid();updateNavBal();startTimer();

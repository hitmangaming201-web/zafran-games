let gameActive=false,selectedTiles=[],betAmount=10,mineCount=3;
function updateNavBal(){document.getElementById('navBal').textContent='₹'+parseFloat(localStorage.getItem('balance')||0).toFixed(2);}
function buildGrid(){
  const grid=document.getElementById('minesGrid');grid.innerHTML='';
  for(let i=0;i<25;i++){
    const t=document.createElement('div');t.className='mine-tile';t.id='tile-'+i;
    t.textContent=gameActive?'💎':'🔒';
    if(gameActive)t.onclick=()=>revealTile(i);
    grid.appendChild(t);
  }
}
function showAlert(msg,type='error'){
  const b=document.getElementById('alertBox');
  b.innerHTML=`<div class="alert alert-${type}">${msg}</div>`;
  setTimeout(()=>b.innerHTML='',3500);
}
function calcMult(rev,mines){
  const safe=25-mines;let m=1;
  for(let i=0;i<rev;i++)m*=(safe-i)/(25-mines-i);
  return parseFloat((1/m*0.97).toFixed(2));
}
function startGame(){
  if(!localStorage.getItem('token')){window.location.href='login.html';return;}
  betAmount=parseFloat(document.getElementById('betAmt').value);
  mineCount=parseInt(document.getElementById('mineCount').value);
  if(!betAmount||betAmount<1){showAlert('Enter valid bet');return;}
  gameActive=true;selectedTiles=[];buildGrid();
  document.getElementById('startBtn').disabled=true;
  document.getElementById('cashoutBtn').disabled=false;
  document.getElementById('cashoutBtn').style.opacity='1';
  document.getElementById('currentMult').textContent='1.00×';
  document.getElementById('potWin').textContent='₹'+betAmount.toFixed(2);
  showAlert(`Game on! ₹${betAmount} bet. ${mineCount} mines hidden. Find gems!`,'success');
}
async function revealTile(idx){
  if(!gameActive)return;
  const tile=document.getElementById('tile-'+idx);
  if(tile.classList.contains('safe')||tile.classList.contains('mine-hit'))return;
  selectedTiles.push(idx);
  const token=localStorage.getItem('token');
  try{
    const res=await fetch('/api/game/mines/bet',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({betAmount,mineCount,selectedTiles:[...selectedTiles]})});
    const data=await res.json();
    if(data.hitMine){
      data.minePositions.forEach(p=>{const t=document.getElementById('tile-'+p);t.className='mine-tile mine-hit';t.textContent='💣';});
      tile.className='mine-tile mine-hit';tile.textContent='💥';
      gameActive=false;
      document.getElementById('startBtn').disabled=false;
      document.getElementById('cashoutBtn').disabled=true;
      document.getElementById('cashoutBtn').style.opacity='0.4';
      document.getElementById('currentMult').textContent='0×';
      document.getElementById('potWin').textContent='₹0.00';
      if(data.newBalance!==undefined){localStorage.setItem('balance',data.newBalance);updateNavBal();}
      showAlert(`💥 BOOM! Mine hit. Lost ₹${betAmount}`,'error');
      setTimeout(()=>{gameActive=false;buildGrid();},2000);
      return;
    }
    tile.className='mine-tile safe';tile.textContent='💎';
    const mult=calcMult(selectedTiles.length,mineCount);
    document.getElementById('currentMult').textContent=mult.toFixed(2)+'×';
    document.getElementById('potWin').textContent='₹'+(betAmount*mult).toFixed(2);
  }catch{selectedTiles.pop();showAlert('Network error, retry');}
}
function cashout(){
  if(!gameActive||selectedTiles.length===0){showAlert('Reveal at least 1 tile!');return;}
  const mult=calcMult(selectedTiles.length,mineCount);
  const payout=parseFloat((betAmount*mult).toFixed(2));
  gameActive=false;
  document.getElementById('startBtn').disabled=false;
  document.getElementById('cashoutBtn').disabled=true;
  document.getElementById('cashoutBtn').style.opacity='0.4';
  const bal=parseFloat(localStorage.getItem('balance')||0)-betAmount+payout;
  localStorage.setItem('balance',bal.toFixed(2));updateNavBal();
  showAlert(`💰 Cashed out! ₹${payout} at ${mult}×`,'success');
  setTimeout(buildGrid,1500);
}
updateNavBal();buildGrid();

let currentMultiplier = 1.0;
let gameState = 'waiting';
let betPlaced = false;
let currentBet = 0;
let crashAt = 2.0;
let flyTimer = null;
const recentCrashes = [];

// Canvas trail
const canvas = document.getElementById('aviatorCanvas');
const ctx = canvas ? canvas.getContext('2d') : null;
let trail = [];

function resizeCanvas() {
  if (!canvas) return;
  const sky = document.getElementById('sky');
  canvas.width = sky.offsetWidth;
  canvas.height = sky.offsetHeight;
}

function drawTrail() {
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (trail.length < 2) return;
  ctx.beginPath();
  ctx.strokeStyle = gameState === 'crashed' ? '#ef4444' : '#22c55e';
  ctx.lineWidth = 2;
  ctx.shadowColor = gameState === 'crashed' ? '#ef4444' : '#22c55e';
  ctx.shadowBlur = 8;
  ctx.moveTo(trail[0].x, trail[0].y);
  trail.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.stroke();
}

function updateNavBal() {
  document.getElementById('navBal').textContent = '₹' + parseFloat(localStorage.getItem('balance')||0).toFixed(2);
}
function setBet(v) { document.getElementById('betAmt').value = v; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function showAlert(msg, type='error') {
  const b = document.getElementById('alertBox');
  b.innerHTML = `<div class="alert alert-${type}">${msg}</div>`;
  setTimeout(() => b.innerHTML = '', 3500);
}

async function startRound() {
  gameState = 'waiting';
  currentMultiplier = 1.0;
  betPlaced = false;
  trail = [];
  if (flyTimer) clearTimeout(flyTimer);

  resizeCanvas();
  if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);

  const mult = document.getElementById('multiplier');
  mult.className = 'multiplier-display';
  mult.textContent = '5s...';
  document.getElementById('status').textContent = '🎯 Place your bet now!';
  document.getElementById('cashoutBtn').disabled = true;
  document.getElementById('cashoutBtn').style.opacity = '0.4';
  document.getElementById('betBtn').disabled = false;
  document.getElementById('betBtn').textContent = 'BET';

  for (let i = 5; i > 0; i--) {
    mult.textContent = i + 's...';
    await sleep(1000);
  }

  try {
    const res = await fetch('/api/game/aviator/round');
    const data = await res.json();
    crashAt = data.crashAt;
  } catch {
    const r = Math.random();
    if (r < 0.35) crashAt = parseFloat((1 + Math.random() * 1.8).toFixed(2));
    else if (r < 0.70) crashAt = parseFloat((2 + Math.random() * 4).toFixed(2));
    else crashAt = parseFloat((6 + Math.random() * 50).toFixed(2));
  }

  gameState = 'flying';
  mult.className = 'multiplier-display flying';
  document.getElementById('status').textContent = '✈️ Flying!';

  if (betPlaced) {
    document.getElementById('cashoutBtn').disabled = false;
    document.getElementById('cashoutBtn').style.opacity = '1';
  }

  fly();
}

function fly() {
  currentMultiplier = parseFloat((currentMultiplier + 0.01 + currentMultiplier * 0.002).toFixed(2));
  document.getElementById('multiplier').textContent = currentMultiplier.toFixed(2) + '×';

  // Canvas trail
  if (canvas && ctx) {
    const pct = Math.min((currentMultiplier - 1) / Math.max(crashAt - 1, 1), 0.95);
    const x = 30 + pct * (canvas.width - 60);
    const y = canvas.height - 30 - pct * (canvas.height - 60);
    trail.push({ x, y });
    drawTrail();
  }

  if (betPlaced) {
    const autoAt = parseFloat(document.getElementById('cashoutAt').value);
    if (currentMultiplier >= autoAt) { executeCashout(autoAt); return; }
  }

  if (currentMultiplier >= crashAt) { doCrash(); return; }
  flyTimer = setTimeout(fly, 90);
}

function doCrash() {
  gameState = 'crashed';
  const mult = document.getElementById('multiplier');
  mult.className = 'multiplier-display crashed';
  mult.textContent = crashAt.toFixed(2) + '× 💥';
  document.getElementById('status').textContent = 'CRASHED!';
  document.getElementById('cashoutBtn').disabled = true;
  document.getElementById('cashoutBtn').style.opacity = '0.4';

  if (betPlaced) {
    showAlert(`Crashed at ${crashAt}×. Lost ₹${currentBet}`, 'error');
    betPlaced = false;
    document.getElementById('betBtn').disabled = false;
    document.getElementById('betBtn').textContent = 'BET';
  }

  recentCrashes.unshift(crashAt);
  if (recentCrashes.length > 15) recentCrashes.pop();
  renderCrashes();

  setTimeout(startRound, 3000);
}

async function placeBet() {
  if (gameState !== 'waiting') { showAlert('Wait for next round!'); return; }
  if (!localStorage.getItem('token')) { window.location.href = 'login.html'; return; }
  currentBet = parseFloat(document.getElementById('betAmt').value);
  if (!currentBet || currentBet < 1) { showAlert('Enter valid bet amount'); return; }
  betPlaced = true;
  document.getElementById('betBtn').disabled = true;
  document.getElementById('betBtn').textContent = '✓ PLACED';
  showAlert(`₹${currentBet} placed! Auto cashout at ${document.getElementById('cashoutAt').value}×`, 'success');
}

async function executeCashout(at) {
  if (!betPlaced) return;
  betPlaced = false;
  document.getElementById('cashoutBtn').disabled = true;
  document.getElementById('cashoutBtn').style.opacity = '0.4';

  const token = localStorage.getItem('token');
  try {
    const res = await fetch('/api/game/aviator/bet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ betAmount: currentBet, cashoutAt: at })
    });
    const data = await res.json();
    if (data.won) {
      localStorage.setItem('balance', data.newBalance);
      updateNavBal();
      showAlert(`💰 Won ₹${data.payout} at ${at}×!`, 'success');
    }
  } catch {
    const payout = parseFloat((currentBet * at).toFixed(2));
    const bal = parseFloat(localStorage.getItem('balance')||0) - currentBet + payout;
    localStorage.setItem('balance', bal.toFixed(2));
    updateNavBal();
    showAlert(`💰 Won ₹${payout} at ${at}×!`, 'success');
  }
}

function manualCashout() {
  if (!betPlaced || gameState !== 'flying') return;
  executeCashout(currentMultiplier);
}

function renderCrashes() {
  document.getElementById('recentResults').innerHTML = recentCrashes.map(c => {
    const color = c < 2 ? 'var(--red)' : c < 5 ? 'var(--gold)' : 'var(--green)';
    return `<span style="background:rgba(255,255,255,0.05);color:${color};padding:4px 10px;border-radius:16px;font-size:11px;font-weight:700;border:1px solid rgba(255,255,255,0.07);">${c}×</span>`;
  }).join('');
}

window.addEventListener('resize', resizeCanvas);
updateNavBal();
startRound();
